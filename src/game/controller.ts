import {
  type ActionDef,
  type ActionTarget,
  type GameEvent,
  type GameState,
  type LeveledUpEvent,
  type MoveCommand,
  SYSTEM_ISSUER,
  type Vec2,
  INTERACT_RANGE,
  DISARM_RANGE,
  type Trap,
  distanceToTrap,
  trapAt,
  trapsOf,
  dialogueOf,
  evaluateCondition,
  gateSettled,
  entityAt,
  gridDistance,
  inZone,
  isHostile,
  nextAiCommand,
  posKey,
  reachableTiles,
  surfaceCost,
  blockedTiles,
  zonesOf,
} from '../../engine';
import type { MapScene } from '../scenes/MapScene';
import type { CombatHud } from '../ui/combatHud';
import type { GameDefinition } from './definition';
import type { GameStore } from './store';

const AI_STEP_MS = 380;
/** A fight starts with the party within this many tiles of the leader. */
const REGROUP_IN_COMBAT = 2;
/** Out of combat, a companion this far behind catches up at once. */
const REGROUP_CATCH_UP = 8;
/** Commands one AI fighter may issue in a single turn before it is ended for it. */
const AI_MAX_STEPS_PER_TURN = 40;

/**
 * Turns player input into commands and drives everything that isn't the player:
 * companions following the leader, encounter triggers and enemy turns. It only
 * reads state and dispatches commands; the engine decides what happens.
 */
export class GameController {
  private selected: ActionDef | null = null;
  /** Creature whose sprite the last tap hit (more reliable than the tile under the finger). */
  private tappedEntity: string | undefined;
  /** Creatures picked so far for multi-target actions (Bless, Magic Missile...). */
  private picks: string[] = [];
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  /** Recent leader positions, so companions walk in single file behind them. */
  private trail: Vec2[] = [];
  private leaderMoved = false;
  /** Gate scenes already played while the leader is still standing in them. */
  private scenesInside = new Set<string>();
  /** Story triggers already offered since the party arrived on this map. */
  private triggersShown = new Set<string>();
  /** Who the leader is walking up to talk to (or open, or pull). */
  private pendingInteract: string | null = null;
  scene!: MapScene;

  constructor(
    private store: GameStore,
    private game: GameDefinition,
    private hud: CombatHud,
  ) {
    store.subscribe((change, state) => {
      if (change.kind === 'reset' || change.events.some((e) => e.type === 'mapChanged')) this.triggersShown.clear();
      if (change.kind === 'reset') {
        this.trail = [];
        this.selected = null;
        this.pendingLevels = [];
      } else {
        this.track(change.events);
        this.hud.logEvents(change.events, state);
      }
      this.refresh();
    });
  }

  private get state(): GameState {
    return this.store.state;
  }

  private isPlayer(id: string | null | undefined): boolean {
    return !!id && this.state.entities[id]?.controllerId === this.game.playerId;
  }

  /** Who the player is steering right now: their active character in combat, the leader otherwise. */
  controlledId(): string {
    const { turn } = this.state;
    if (turn.mode === 'combat' && this.isPlayer(turn.activeEntityId)) return turn.activeEntityId!;
    return this.game.leaderId;
  }

  // --- Input --------------------------------------------------------------------

  onTileSelected(tile: Vec2, entityId?: string): void {
    if (this.scene.busy) return this.waitFeedback();
    this.tappedEntity = entityId;
    const { turn } = this.state;
    if (turn.mode !== 'combat') {
      if (dialogueOf(this.state)) return;
      // Tapping someone (or something) you can talk to or use: walk up to it, then interact.
      const target = this.occupantOf(tile);
      if (target && target.id !== this.game.leaderId && target.tags.some((t) => t.startsWith('dialogue:'))) {
        this.approachAndInteract(target.id);
        return;
      }
      // Someone standing there with nothing to say: answer the tap instead of walking onto them
      // (a tap that does nothing at all reads as a broken game).
      if (target && target.id !== this.game.leaderId && target.controllerId !== this.game.playerId && target.tags.includes('noncombatant') && !target.tags.includes('object')) {
        this.hud.say(`${target.name}: ${this.game.texts.combat?.noReply ?? 'no tiene nada que decirte. Por ahora.'}`);
        return;
      }
      // A known, armed trap: walk up to it and offer to disarm it.
      const trap = trapAt(this.state, tile);
      if (trap && !trap.hidden && trap.armed && trap.disarm) {
        this.approachTrap(trap.id);
        return;
      }
      this.pendingInteract = null;
      this.dispatchMove(this.game.leaderId, tile);
      return;
    }
    const active = turn.activeEntityId;
    if (!this.isPlayer(active)) return;
    if (this.selected) {
      this.aim(active!, this.selected, tile);
      return;
    }
    const occupant = this.occupantOf(tile);
    if (occupant && occupant.id !== active) {
      this.hud.showEntity(occupant, this.state);
      return;
    }
    this.dispatchMove(active!, tile);
  }

  /** A tap that lands while things are still animating isn't ignored in silence: that reads as a frozen game. */
  private waitFeedback(): void {
    this.hud.say(this.game.texts.combat?.busy ?? 'Un momento…');
  }

  selectAction(action: ActionDef | null): void {
    // Picking an ability mid-animation would look accepted but then every tap on a target is dropped.
    if (action && this.scene.busy) return this.waitFeedback();
    const active = this.state.turn.activeEntityId;
    this.picks = [];
    if (!action || !active) {
      this.selected = null;
      this.refresh();
      return;
    }
    // Self-targeted actions need no aiming: show the preview straight away.
    if (action.target.kind === 'self') {
      this.selected = null;
      this.confirmPreview(active, action, {});
      return;
    }
    this.selected = action;
    this.refresh();
  }

  endTurn(): void {
    const active = this.state.turn.activeEntityId;
    if (!active || !this.isPlayer(active) || this.scene.busy) return;
    this.selected = null;
    this.report(this.store.dispatch({ type: 'endTurn', issuer: this.game.playerId, entityId: active } as never));
  }

  /** The creature the player meant: the sprite they hit, else whoever stands on the tile. */
  private occupantOf(tile: Vec2) {
    const tapped = this.tappedEntity ? this.state.entities[this.tappedEntity] : undefined;
    if (tapped) return tapped;
    // Corpses and debris can share a tile with the living: prefer whoever still stands.
    const here = Object.values(this.state.entities).filter((e) => e.position.x === tile.x && e.position.y === tile.y);
    return here.find((e) => this.store.engine.ruleset.isStanding(e)) ?? here[0];
  }

  private aim(actorId: string, action: ActionDef, tile: Vec2): void {
    const occupant = this.occupantOf(tile);
    const max = action.target.maxTargets ?? 1;
    if (action.target.kind === 'creature' && max > 1) {
      this.pick(actorId, action, occupant?.id);
      return;
    }
    const target: ActionTarget = action.target.kind === 'tile' ? { tile } : { entityId: occupant?.id };
    if (action.target.kind === 'creature' && !occupant) {
      this.hud.say(this.game.texts.combat?.noTarget ?? '', true);
      return;
    }
    const actor = this.state.entities[actorId]!;
    const where = target.tile ?? occupant!.position;
    if (gridDistance(actor.position, where) > action.target.range) {
      this.hud.say(this.game.texts.errors.out_of_range ?? '', true);
      return;
    }
    this.confirmPreview(actorId, action, target);
  }

  /** Multi-target picking: tap to add (or remove, if repeats aren't allowed); full list opens the preview. */
  private pick(actorId: string, action: ActionDef, id: string | undefined): void {
    if (!id) {
      this.hud.say(this.game.texts.combat?.noTarget ?? '', true);
      return;
    }
    const actor = this.state.entities[actorId]!;
    const target = this.state.entities[id]!;
    if (gridDistance(actor.position, target.position) > action.target.range) {
      this.hud.say(this.game.texts.errors.out_of_range ?? '', true);
      return;
    }
    const hostile = target.factionId !== actor.factionId;
    if ((action.target.filter === 'hostile' && !hostile) || (action.target.filter === 'ally' && hostile)) {
      this.hud.say(this.game.texts.errors.invalid_target ?? '', true);
      return;
    }
    if (!action.target.allowRepeat && this.picks.includes(id)) this.picks = this.picks.filter((p) => p !== id);
    else this.picks.push(id);
    if (this.picks.length >= (action.target.maxTargets ?? 1)) this.finishPicking();
    else this.refresh();
  }

  /** Confirms a multi-target action with the creatures picked so far. */
  finishPicking(): void {
    const active = this.state.turn.activeEntityId;
    if (!this.selected || !active || this.picks.length === 0) return;
    this.confirmPreview(active, this.selected, { entityIds: [...this.picks] });
  }

  private confirmPreview(actorId: string, action: ActionDef, target: ActionTarget): void {
    const preview = this.store.engine.ruleset.previewAction(this.state, actorId, action.id, target);
    const targetName = target.entityId ? this.state.entities[target.entityId]?.name : undefined;
    if (preview.affectedTiles) this.scene.setOverlays([], [], preview.affectedTiles);
    const names = target.entityIds?.map((id) => this.state.entities[id]?.name).join(', ');
    this.hud.showPreview(action, preview, names ?? targetName, () => {
      this.selected = null;
      this.picks = [];
      this.report(this.store.dispatch({ type: 'act', issuer: this.game.playerId, entityId: actorId, actionId: action.id, target } as never));
    });
  }

  /** Asked when the party stands by a known trap: who tries to disarm it (or leave it). */
  onTrapReached: (trap: Trap, candidates: string[]) => void = () => undefined;

  private approachTrap(trapId: string): void {
    const trap = trapsOf(this.state).find((t) => t.id === trapId);
    const leader = this.state.entities[this.game.leaderId]!;
    if (!trap) return;
    if (distanceToTrap(trap, leader.position) <= 1) {
      this.pendingInteract = null;
      const candidates = Object.values(this.state.entities)
        .filter((e) => e.controllerId === this.game.playerId && this.store.engine.ruleset.canAct(e) && distanceToTrap(trap, e.position) <= DISARM_RANGE)
        .map((e) => e.id);
      this.onTrapReached(trap, candidates);
      return;
    }
    const spot = trap.tiles.flatMap((t) => this.freeAround(t)).find((p) => distanceToTrap(trap, p) <= 1 && !trap.tiles.some((t) => t.x === p.x && t.y === p.y));
    if (!spot) return;
    this.pendingInteract = `trap:${trapId}`;
    this.dispatchMove(leader.id, spot);
  }

  /** Walks the leader next to `targetId` (if needed) and starts the interaction on arrival. */
  private approachAndInteract(targetId: string): void {
    const leader = this.state.entities[this.game.leaderId]!;
    const target = this.state.entities[targetId]!;
    if (gridDistance(leader.position, target.position) <= INTERACT_RANGE) {
      this.pendingInteract = null;
      // A conversation can turn into a fight (a rival, a gate scene): have the party at hand.
      this.regroup(REGROUP_IN_COMBAT);
      this.report(this.store.dispatch({ type: 'interact', issuer: this.game.playerId, entityId: leader.id, targetId } as never));
      return;
    }
    const spot = this.freeAround(target.position).find((p) => gridDistance(p, target.position) <= INTERACT_RANGE);
    if (!spot) {
      this.hud.say(this.game.texts.errors.no_path ?? '', true);
      return;
    }
    this.pendingInteract = targetId;
    this.dispatchMove(leader.id, spot);
  }

  private dispatchMove(entityId: string, to: Vec2): void {
    const command: MoveCommand = { type: 'move', issuer: this.game.playerId, entityId, to };
    this.report(this.store.dispatch(command));
  }

  private report(result: ReturnType<GameStore['dispatch']>): void {
    if (!result.ok) {
      const t = this.game.texts.errors;
      this.hud.say(result.error.code === 'action_invalid' ? result.error.message : (t[result.error.code] ?? this.game.texts.ui.genericError), true);
    }
  }

  // --- Things that happen on their own ------------------------------------------------

  private track(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'leveledUp') {
        const up = e as LeveledUpEvent;
        // Narrated once per level the leader gains (a big haul can skip one: 3 -> 5).
        if (up.entityIds.includes(this.game.leaderId)) for (let l = up.from + 1; l <= up.level; l++) this.pendingLevels.push(l);
      }
      if (e.type === 'entityMoved' && (e as never as { entityId: string }).entityId === this.game.leaderId) {
        const ev = e as never as { from: Vec2; path: Vec2[] };
        this.trail.push(ev.from, ...ev.path.slice(0, -1));
        this.trail = this.trail.slice(-12);
        this.leaderMoved = this.state.turn.mode !== 'combat';
      }
    }
  }

  /** Called by the scene when animations finish. */
  onIdle(): void {
    this.refresh();
    const { turn } = this.state;
    if (turn.mode !== 'combat') {
      if (this.checkEncounters()) return;
      if (this.checkScenes()) return;
      if (this.checkLevels()) return;
      if (this.checkTriggers()) return;
      if (this.checkExits()) return;
      if (this.pendingInteract) {
        const id = this.pendingInteract;
        this.pendingInteract = null;
        if (id.startsWith('trap:')) {
          const trap = trapsOf(this.state).find((t) => `trap:${t.id}` === id);
          const lead = this.state.entities[this.game.leaderId];
          if (trap && lead && distanceToTrap(trap, lead.position) <= 1) this.approachTrap(trap.id);
          return;
        }
        const leader = this.state.entities[this.game.leaderId];
        const target = this.state.entities[id];
        // Only once: if the walk was cut short, the player taps again.
        if (leader && target && gridDistance(leader.position, target.position) <= INTERACT_RANGE) this.approachAndInteract(id);
        return;
      }
      if (this.leaderMoved) {
        this.leaderMoved = false;
        this.followLeader();
      }
      return;
    }
    const active = turn.activeEntityId;
    if (active && !this.isPlayer(active)) this.scheduleAi(active);
  }

  private aiSteps = { key: '', n: 0 };

  private scheduleAi(entityId: string): void {
    if (this.aiTimer) return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.state.turn.activeEntityId !== entityId) return;
      // Still animating: try again shortly instead of dropping the turn on the floor (nothing
      // else may come along to wake the AI up, and the fight would hang on an enemy's turn).
      if (this.scene.busy) {
        this.scheduleAi(entityId);
        return;
      }
      // A plan that keeps "working" without ever ending the turn would loop forever.
      const turnKey = `${this.state.turn.round}:${entityId}`;
      this.aiSteps = this.aiSteps.key === turnKey ? { key: turnKey, n: this.aiSteps.n + 1 } : { key: turnKey, n: 1 };
      if (this.aiSteps.n > AI_MAX_STEPS_PER_TURN) {
        console.warn(`AI ${entityId} took ${AI_MAX_STEPS_PER_TURN} steps without ending its turn`);
        this.store.dispatch({ type: 'endTurn', issuer: SYSTEM_ISSUER, entityId } as never);
        return;
      }
      try {
        const command = nextAiCommand(this.store.engine.ruleset, this.state, entityId);
        const result = this.store.dispatch(command);
        // A plan the engine refuses must never stall the fight.
        if (!result.ok) this.store.dispatch({ type: 'endTurn', issuer: SYSTEM_ISSUER, entityId } as never);
      } catch (err) {
        // A bug in planning or in a rule must not freeze the fight either: log it and move on.
        console.error('AI turn failed', entityId, err);
        if (this.state.turn.activeEntityId === entityId) this.store.dispatch({ type: 'endTurn', issuer: SYSTEM_ISSUER, entityId } as never);
      }
    }, AI_STEP_MS);
  }

  /** Starts combat when the leader walks into an encounter zone with enemies still standing. */
  /** Flag conditions a zone may carry: requiresFlag / unlessFlag. */
  private zoneAllowed(z: { properties: Record<string, unknown> }): boolean {
    const req = z.properties.requiresFlag;
    const unless = z.properties.unlessFlag;
    if (req && !this.state.flags[String(req)]) return false;
    if (unless && this.state.flags[String(unless)]) return false;
    return true;
  }

  /** The leader walked into a scene: someone there starts talking (avoidable fights, the trial...). */
  private checkScenes(): boolean {
    const leader = this.state.entities[this.game.leaderId];
    if (!leader || dialogueOf(this.state)) return false;
    // A gate scene re-arms once the leader has stepped out of its zone.
    for (const name of [...this.scenesInside]) {
      const z = zonesOf(this.state, 'scenes').find((x) => x.name === name);
      if (!z || !inZone(z, leader.position)) this.scenesInside.delete(name);
    }
    for (const z of zonesOf(this.state, 'scenes')) {
      if (!inZone(z, leader.position) || !this.zoneAllowed(z)) continue;
      const dialogue = String(z.properties.dialogue ?? '');
      if (!dialogue || dialogue.startsWith('TODO') || !this.game.dialogues?.[dialogue]) continue;
      const seen = `scene:${z.name}`;
      // Gate scenes (someone blocking the way) come back each time you walk in, until the way opens.
      if (z.properties.gate ? gateSettled(this.state, z) || this.scenesInside.has(z.name) : z.properties.once !== false && this.state.flags[seen]) continue;
      const speaker = z.properties.speaker ? this.state.entities[String(z.properties.speaker)] : undefined;
      if (z.properties.speaker && (!speaker || !this.store.engine.ruleset.isStanding(speaker))) continue;
      if (z.properties.gate) this.scenesInside.add(z.name);
      this.regroup(REGROUP_IN_COMBAT);
      const r = this.store.dispatch({ type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId: dialogue, actorId: leader.id, ...(z.properties.gate ? {} : { markFlag: seen }), ...(speaker ? { partnerId: speaker.id } : {}) } as never);
      if (r.ok) return true;
    }
    return false;
  }

  /** Shown when the party levels up (the client puts up the narration and companions' lines). */
  onLevelUp: (level: number) => void = () => undefined;

  /** Levels the engine has raised the leader to and the client hasn't narrated yet. */
  private pendingLevels: number[] = [];

  /**
   * The engine levels the party when its shared points cross a threshold (leveledUp); the
   * client only waits for a quiet moment (no conversation, animations done) to say so.
   */
  private checkLevels(): boolean {
    if (!this.pendingLevels.length || dialogueOf(this.state)) return false;
    const level = this.pendingLevels.shift()!;
    this.onLevelUp(level);
    return true;
  }

  /** Story beats the game opens itself (the epilogue once the last decision is made). */
  private checkTriggers(): boolean {
    const leader = this.state.entities[this.game.leaderId];
    if (!leader || dialogueOf(this.state)) return false;
    const ruleset = this.store.engine.ruleset;
    for (const t of this.game.triggers ?? []) {
      // Offered once per visit to the map while its condition holds: "let me think about it" just
      // postpones it until you come back (the condition itself says when it's settled).
      if (this.triggersShown.has(t.id) || (t.map && t.map !== this.state.map.id) || !this.game.dialogues?.[t.dialogue]) continue;
      if (!evaluateCondition(ruleset, this.state, leader.id, t.when)) continue;
      this.triggersShown.add(t.id);
      const r = this.store.dispatch({ type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId: t.dialogue, actorId: leader.id, ...(t.partner && this.state.entities[t.partner] ? { partnerId: t.partner } : {}) } as never);
      if (r.ok) return true;
    }
    return false;
  }

  /** The leader stepped onto an exit: the whole party travels to the next map. */
  private checkExits(): boolean {
    const leader = this.state.entities[this.game.leaderId];
    if (!leader || dialogueOf(this.state)) return false;
    // A way the story hasn't opened yet: say so instead of leaving the player standing there.
    const shut = zonesOf(this.state, 'exits').find((z) => inZone(z, leader.position) && !this.zoneAllowed(z));
    if (shut) {
      this.hud.say(String(shut.properties.closedText ?? (this.game.texts.ui as Record<string, string>).closedWay ?? 'Por ahí no se puede pasar todavía.'), true);
      return false;
    }
    const exit = zonesOf(this.state, 'exits').find((z) => inZone(z, leader.position) && z.properties.to && z.properties.spawn && this.zoneAllowed(z));
    if (!exit) return false;
    this.trail = [];
    this.leaderMoved = false;
    const r = this.store.dispatch({ type: 'travel', issuer: this.game.playerId, entityId: leader.id, mapId: String(exit.properties.to), spawn: String(exit.properties.spawn) } as never);
    if (!r.ok) this.report(r);
    return r.ok;
  }

  private checkEncounters(): boolean {
    const leader = this.state.entities[this.game.leaderId];
    if (!leader) return false;
    const ruleset = this.store.engine.ruleset;
    for (const zone of zonesOf(this.state, 'encounters')) {
      if (!inZone(zone, leader.position) || !this.zoneAllowed(zone)) continue;
      const foes = String(zone.properties.participants ?? '')
        .split(',')
        .map((s) => s.trim())
        // Only those still standing and still against us (allies are listed too).
        .filter((id) => this.state.entities[id] && ruleset.isStanding(this.state.entities[id]!) && isHostile(leader, this.state.entities[id]!));
      if (foes.length === 0) continue;
      const party = Object.values(this.state.entities)
        .filter((e) => e.factionId === leader.factionId && ruleset.isStanding(e))
        .map((e) => e.id);
      // Zone consequences: setFlag when the fight ends either way, winFlag only if the party wins.
      const flag = (f: unknown) => ({ type: 'setFlag', flag: String(f), value: true });
      const hooks = zone.properties.setFlag || zone.properties.winFlag
        ? { side: leader.factionId, ...(zone.properties.winFlag ? { onVictory: [flag(zone.properties.winFlag)] } : {}), ...(zone.properties.setFlag ? { onEnd: [flag(zone.properties.setFlag)] } : {}) }
        : undefined;
      // The party fights together: anyone left behind (the walk stopped at the zone's edge before
      // they caught up) regroups next to the leader first. Playtest: the companion started fights far away.
      this.regroup(REGROUP_IN_COMBAT);
      this.store.dispatch({ type: 'startCombat', issuer: SYSTEM_ISSUER, participants: [...party, ...foes], ...(hooks ? { hooks } : {}) } as never);
      return true;
    }
    return false;
  }

  /**
   * Companions walk to the leader's recent footsteps, one tile further back each. If a
   * footstep can't be reached (a ledge too high, someone in the way), they try the free
   * tiles nearest the leader instead of standing still.
   */
  /** Companions farther than `beyond` tiles from the leader are placed on free tiles beside them. */
  private regroup(beyond: number): void {
    const leader = this.state.entities[this.game.leaderId];
    if (!leader) return;
    const ruleset = this.store.engine.ruleset;
    const far = Object.values(this.state.entities).filter(
      (e) => e.id !== leader.id && e.factionId === leader.factionId && this.isPlayer(e.id) && ruleset.isStanding(e) && gridDistance(e.position, leader.position) > beyond,
    );
    if (far.length === 0) return;
    const spots = this.freeAround(leader.position).filter((p) => gridDistance(p, leader.position) <= 2);
    const effects = far.flatMap((e, i) => (spots[i] ? [{ type: 'setPosition', entityId: e.id, position: spots[i] }] : []));
    if (effects.length) this.store.dispatch({ type: 'script', issuer: SYSTEM_ISSUER, effects } as never);
  }

  private followLeader(): void {
    // Someone left far behind (a long walk, a jump, a lift) catches up at once instead of trekking.
    this.regroup(REGROUP_CATCH_UP);
    const leader = this.state.entities[this.game.leaderId];
    if (!leader) return;
    const ruleset = this.store.engine.ruleset;
    const companions = Object.values(this.state.entities).filter(
      (e) => e.id !== leader.id && e.factionId === leader.factionId && this.isPlayer(e.id) && ruleset.isStanding(e),
    );
    const taken = new Set([posKey(leader.position)]);
    companions.forEach((c, i) => {
      if (gridDistance(c.position, leader.position) <= 1 + i) {
        taken.add(posKey(c.position));
        return;
      }
      const trailSpots = [...this.trail].reverse().slice(i);
      const candidates = [...trailSpots, ...this.freeAround(leader.position)].filter((p) => !taken.has(posKey(p)) && !entityAt(this.state, p));
      for (const spot of candidates) {
        const result = this.store.dispatch({ type: 'move', issuer: this.game.playerId, entityId: c.id, to: spot } as MoveCommand);
        if (result.ok) {
          taken.add(posKey(spot));
          return;
        }
      }
    });
  }

  /** Free tiles near a point, closest first. */
  private freeAround(around: Vec2): Vec2[] {
    const ruleset = this.store.engine.ruleset;
    return [...reachableTiles(this.state.map, around, 4, { rules: ruleset.movement, blocked: blockedTiles(ruleset, this.state, '') }).values()]
      .filter((t) => t.cost > 0)
      .sort((a, b) => a.cost - b.cost)
      .map((t) => t.pos);
  }

  // --- Presentation -------------------------------------------------------------------

  private refresh(): void {
    if (!this.scene) return;
    const state = this.state;
    const ruleset = this.store.engine.ruleset;
    const { turn } = state;
    const active = turn.mode === 'combat' ? turn.activeEntityId : null;
    this.scene.setActive(active);
    const playerTurn = this.isPlayer(active);
    const picking =
      this.selected && (this.selected.target.maxTargets ?? 1) > 1
        ? { count: this.picks.length, max: this.selected.target.maxTargets!, onDone: () => this.finishPicking() }
        : undefined;
    this.hud.render(state, ruleset, active, playerTurn, this.selected?.id ?? null, (a) => this.selectAction(a), () => this.endTurn(), picking);

    if (!active || !playerTurn) {
      this.scene.setOverlays([], []);
      return;
    }
    const actor = state.entities[active]!;
    if (this.selected) {
      const a = this.selected;
      // Area spells are aimed at a tile: the area is painted once a tile is picked.
      if (a.target.kind === 'tile') {
        this.scene.setOverlays([], []);
        return;
      }
      const targets = Object.values(state.entities)
        .filter((e) => ruleset.isStanding(e) && gridDistance(e.position, actor.position) <= a.target.range)
        .filter((e) => (a.target.filter === 'hostile' ? e.factionId !== actor.factionId : a.target.filter === 'ally' ? e.factionId === actor.factionId : true))
        .map((e) => e.id);
      this.scene.setOverlays([], targets, [], this.picks);
      return;
    }
    const left = ruleset.movementBudget(actor, state) - turn.movementUsed;
    const tiles = left > 0 ? [...reachableTiles(state.map, actor.position, left, { rules: ruleset.movement, blocked: blockedTiles(ruleset, state, active), extraCost: surfaceCost(ruleset, state) }).values()].map((t) => t.pos) : [];
    this.scene.setOverlays(tiles, []);
  }
}
