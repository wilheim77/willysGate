import { type EndTurnCommand, act, applyOutcome, checkCombatEnd, endTurn, inCombat, isAdjacent, isHostile, startCombat } from './combat';
import { type BaseCommand, type CommandHandler, type CommandResult, type GameEvent, SYSTEM_ISSUER, fail, requireControlled } from './command-types';
import { type Vec2, inBounds, posKey } from './grid';
import { type PathResult, findPath } from './pathfinding';
import { surfaceAt } from './surfaces';
import { type Effect, applyEffects } from './effects';
import { disarmTrap, trapsAfterStep, trapsOf } from './traps';
import { travel } from './world';
import { applyProgression } from './progression';
import { type EngineContent, chooseOption, dialogueOf, endDialogue, interact, startDialogue } from './dialogue';
import { RngCursor } from './rng';
import type { Ruleset } from './ruleset';
import type { Entity, GameState } from './state';

export * from './command-types';

export interface MoveCommand extends BaseCommand {
  type: 'move';
  entityId: string;
  to: Vec2;
}

export interface EntityMovedEvent extends GameEvent {
  type: 'entityMoved';
  entityId: string;
  from: Vec2;
  /** Tiles walked, excluding `from`. May stop short of the destination (interrupted). */
  path: Vec2[];
}

/** Tiles other creatures stand on (only those the ruleset still counts as standing block the way). */
/** Whether an entity takes up its tile (see Ruleset.occupiesTile). */
export function occupies(ruleset: Ruleset, e: Entity): boolean {
  return ruleset.occupiesTile ? ruleset.occupiesTile(e) : ruleset.isStanding(e);
}

export function blockedTiles(ruleset: Ruleset, state: GameState, exceptId: string): Set<string> {
  return new Set(
    Object.values(state.entities)
      .filter((e) => e.id !== exceptId && occupies(ruleset, e))
      .map((e) => posKey(e.position)),
  );
}

/** Extra movement cost of entering a tile, from its surface (rubble, deep water...). */
export function surfaceCost(ruleset: Ruleset, state: GameState): (p: Vec2) => number {
  const defs = ruleset.surfaces ?? {};
  return (p) => {
    const s = surfaceAt(state, p);
    return s ? (defs[s.type]?.extraMoveCost ?? 0) : 0;
  };
}

/**
 * A story zone that wants the party to stop here: a scene not yet played (flag
 * "scene:<name>"), or an encounter whose fighters are still standing, when its flags allow.
 */
type StoryZone = { name: string; layer: string; x: number; y: number; width: number; height: number; properties: Record<string, unknown> };

/**
 * A gate scene (the miners blocking the road) is settled once every exit it protects is open;
 * until then it plays again each time the party walks back in.
 */
export function gateSettled(state: GameState, z: StoryZone): boolean {
  // Someone who has joined the party (Garrán in the ditch) no longer blocks anything.
  const speaker = z.properties.speaker ? state.entities[String(z.properties.speaker)] : undefined;
  if (speaker?.controllerId.startsWith('player')) return true;
  // The scene's own outcome (the trial is over) settles it, even if other exits it guards wait
  // on later story beats; otherwise it would replay every time the party walks back in.
  if (z.properties.settledFlag && state.flags[String(z.properties.settledFlag)]) return true;
  const zones = (state.systems.zones as unknown as StoryZone[] | undefined) ?? [];
  const names = String(z.properties.protects ?? '').split(',').map((n) => n.trim()).filter(Boolean);
  const exits = zones.filter((e) => e.layer === 'exits' && names.includes(e.name));
  return exits.length > 0 && exits.every((e) => !e.properties.requiresFlag || !!state.flags[String(e.properties.requiresFlag)]);
}

export function haltsHere(ruleset: Ruleset, state: GameState, p: Vec2, from?: Vec2): boolean {
  const zones = (state.systems.zones as unknown as StoryZone[] | undefined) ?? [];
  const inside = (z: StoryZone, q: Vec2) => q.x >= z.x && q.y >= z.y && q.x < z.x + z.width && q.y < z.y + z.height;
  for (const z of zones) {
    if (z.layer !== 'scenes' && z.layer !== 'encounters') continue;
    if (!inside(z, p) || (from && inside(z, from))) continue;
    const props = z.properties;
    if ((props.requiresFlag && !state.flags[String(props.requiresFlag)]) || (props.unlessFlag && state.flags[String(props.unlessFlag)])) continue;
    if (z.layer === 'scenes') {
      if (props.gate ? gateSettled(state, z) : props.once !== false && state.flags[`scene:${z.name}`]) continue;
      const speaker = props.speaker ? state.entities[String(props.speaker)] : undefined;
      if (props.speaker && (!speaker || !ruleset.isStanding(speaker))) continue;
      if (!props.dialogue) continue;
      return true;
    }
    const party = Object.values(state.entities).find((e) => e.controllerId.startsWith('player'));
    const foes = String(props.participants ?? '').split(',').map((x) => state.entities[x.trim()]).filter((e) => e && ruleset.isStanding(e) && (!party || isHostile(party, e)));
    if (foes.length) return true;
  }
  return false;
}

/** How much a mover would rather not step on a tile (fire, electrified water...). */
export function surfaceHazard(ruleset: Ruleset, state: GameState): (p: Vec2) => number {
  const defs = ruleset.surfaces ?? {};
  // Known, armed traps are worth a long detour.
  const traps = new Set(trapsOf(state).filter((t) => t.armed && !t.hidden).flatMap((t) => t.tiles.map(posKey)));
  return (p) => {
    const s = surfaceAt(state, p);
    return (s ? (defs[s.type]?.hazard ?? 0) : 0) + (traps.has(posKey(p)) ? 20 : 0);
  };
}

/**
 * The path a move command takes: the cheapest one that steers around hazards when it
 * can afford to, otherwise simply the cheapest. Clients use it to draw the same path.
 */
export function movePath(ruleset: Ruleset, state: GameState, moverId: string, to: Vec2, budget = Infinity): PathResult | null {
  const mover = state.entities[moverId]!;
  const base = { blocked: blockedTiles(ruleset, state, moverId), rules: ruleset.movement, extraCost: surfaceCost(ruleset, state) };
  return findPath(state.map, mover.position, to, { ...base, maxCost: budget, avoid: surfaceHazard(ruleset, state) }) ?? findPath(state.map, mover.position, to, base);
}

const move: CommandHandler<MoveCommand> = (state, cmd, { ruleset }) => {
  if (dialogueOf(state)) return fail('cannot_act', 'Finish the conversation first');
  const actor = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!actor.ok) return actor;
  const { entity } = actor;
  if (!inBounds(state.map, cmd.to)) return fail('out_of_bounds', 'Destination outside the map');

  const fighting = inCombat(state, entity.id);
  if (fighting) {
    if (state.turn.activeEntityId !== entity.id) return fail('not_your_turn', `It is ${state.turn.activeEntityId}'s turn`);
    if (!ruleset.canAct(entity)) return fail('cannot_act', `${entity.id} cannot act`);
  }

  // Out of combat, time passes between moves: conditions about to run out (a snare, a slip)
  // wear off. Long ones (an hour of Mage Armor) are left to rests and the ruleset.
  const ending = (c: { remainingTurns?: number }) => c.remainingTurns !== undefined && c.remainingTurns <= 1;
  if (!fighting && entity.conditions.some(ending)) {
    const expired = entity.conditions.filter(ending).map((c) => ({ type: 'removeCondition' as const, entityId: entity.id, condition: c.id }));
    const cleared = applyEffects(ruleset, state, expired);
    const r = move(cleared.state, cmd, { ruleset });
    return r.ok ? { ...r, events: [...cleared.events, ...r.events] } : r;
  }
  const budget = fighting ? ruleset.movementBudget(entity, state) - state.turn.movementUsed : Infinity;
  const result = movePath(ruleset, state, entity.id, cmd.to, budget);
  if (!result) return fail('no_path', 'No path to destination');
  if (fighting) {
    const left = ruleset.movementBudget(entity, state) - state.turn.movementUsed;
    if (result.cost > left) return fail('out_of_range', `Path costs ${result.cost}, ${left} movement left`);
  }
  if (result.path.length === 0) return { ok: true, state, events: [] };

  // Walk step by step: in combat, leaving an enemy's reach gives it a chance to react
  // (an opportunity attack in 5e); anywhere, stepping into a surface triggers it.
  // Either can stop the move.
  const rng = new RngCursor(state.rng);
  let next = state;
  const events: GameEvent[] = [];
  let from = entity.position;
  let segment: Vec2[] = [];
  let spent = 0;
  let prev = entity.position;
  const placeAt = (s: GameState, p: Vec2): GameState => ({
    ...s,
    entities: { ...s.entities, [entity.id]: { ...s.entities[entity.id]!, position: { ...p } } },
  });

  for (const step of result.path) {
    const mover = next.entities[entity.id]!;
    const reactors = !fighting
      ? []
      : Object.values(next.entities).filter(
          (e) => inCombat(next, e.id) && isHostile(e, mover) && ruleset.canAct(e) && isAdjacent(e.position, prev) && !isAdjacent(e.position, step),
        );
    for (const reactor of reactors) {
      const outcome = ruleset.onLeaveReach?.(next, reactor.id, entity.id, rng);
      if (!outcome) continue;
      if (segment.length) {
        events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
        from = prev;
        segment = [];
      }
      const r = applyOutcome(ruleset, placeAt(next, prev), outcome, rng);
      next = r.state;
      events.push(...r.events);
    }
    const stillUp = next.entities[entity.id];
    if (!stillUp || !ruleset.isStanding(stillUp) || !ruleset.canAct(stillUp)) break;
    const tileFrom = next.map.tiles[prev.y * next.map.width + prev.x]!;
    const tileTo = next.map.tiles[step.y * next.map.width + step.x]!;
    spent += 1 + Math.max(0, tileTo.height - tileFrom.height) * ruleset.movement.climbCost + surfaceCost(ruleset, next)(step);
    segment.push(step);
    const tileFromPos = prev;
    prev = step;
    next = placeAt(next, step);
    // A scene or a fight waiting on this tile stops the walk here (otherwise a long tap walks
    // straight past the miners blocking the road and the story never starts).
    if (entity.controllerId.startsWith('player') && haltsHere(ruleset, next, step, tileFromPos)) {
      events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
      from = step;
      segment = [];
      prev = step;
      next = placeAt(next, step);
      break;
    }
    // Traps: stepping on an armed one sets it off; walking near a hidden one may reveal it.
    // Either stops the walk.
    const trapped = trapsAfterStep(next, entity.id, rng, ruleset);
    if (trapped.events.length) {
      events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
      from = step;
      segment = [];
      next = trapped.state;
      events.push(...trapped.events);
    }
    const surface = surfaceAt(next, step);
    if (surface && ruleset.onSurface) {
      events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
      from = step;
      segment = [];
      const before = new Set(next.entities[entity.id]!.conditions.map((c) => c.id));
      const r = applyOutcome(ruleset, next, ruleset.onSurface(next, entity.id, surface.type, 'enter', rng), rng);
      next = r.state;
      events.push(...r.events);
      const after = next.entities[entity.id];
      // A new condition (slipped and fell, stunned...) ends the walk where it happened.
      const struck = !!after && after.conditions.some((c) => !before.has(c.id));
      if (!after || struck || !ruleset.isStanding(after) || !ruleset.canAct(after) || (after.position.x !== step.x || after.position.y !== step.y)) {
        prev = after?.position ?? step;
        break;
      }
    }
    if (trapped.stop) {
      prev = next.entities[entity.id]?.position ?? step;
      break;
    }
  }
  if (segment.length) events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
  next = { ...placeAt(next, prev), rng: rng.state, turn: fighting ? { ...next.turn, movementUsed: next.turn.movementUsed + spent } : next.turn };
  const ended = checkCombatEnd(ruleset, next);
  return { ok: true, state: ended.state, events: [...events, ...ended.events] };
};

/** The game itself changing the world (a level-up, a scripted event). System issuer only. */
interface ScriptCommand extends BaseCommand {
  type: 'script';
  effects: Effect[];
}

const script: CommandHandler<ScriptCommand> = (state, cmd, { ruleset }) => {
  if (cmd.issuer !== 'system') return fail('not_your_entity', 'Only the game runs scripts');
  const rng = new RngCursor(state.rng);
  const r = applyOutcome(ruleset, state, { effects: cmd.effects, events: [] }, rng);
  return { ok: true, state: { ...r.state, rng: rng.state }, events: r.events };
};

export const ENGINE_COMMANDS: Readonly<Record<string, CommandHandler>> = { move, startCombat, endTurn, act, startDialogue, chooseOption, interact, endDialogue, disarmTrap, travel, script };

/** Validates a command against the state and returns the new state plus events. Pure: never mutates `state`. */
export function applyCommand(ruleset: Ruleset, state: GameState, command: BaseCommand, content?: EngineContent): ReturnType<CommandHandler> {
  const handler = ENGINE_COMMANDS[command.type] ?? ruleset.commands[command.type];
  if (!handler) return fail('unknown_command', `Unknown command type "${command.type}"`);
  const result = handler(state, command, { ruleset, ...(content ? { content } : {}) });
  if (!result.ok) return result;
  return levelUpIfEarned(ruleset, command.type === 'endTurn' ? result : passTurnIfHelpless(ruleset, result, content), content);
}

/** The party's shared points may have crossed a threshold: raise whoever is behind. */
function levelUpIfEarned(ruleset: Ruleset, result: CommandResult, content?: EngineContent): CommandResult {
  if (!result.ok || !content?.progression) return result;
  const r = applyProgression(ruleset, result.state, content.progression);
  return r.events.length ? { ok: true, state: r.state, events: [...result.events, ...r.events] } : result;
}

/**
 * Someone who goes down during their own turn (a trap under their feet, an opportunity
 * attack, their own fireball) can't end it themselves: the turn passes on its own, or the
 * fight would wait forever for a command that can't come.
 */
function passTurnIfHelpless(ruleset: Ruleset, result: CommandResult, content?: EngineContent): CommandResult {
  if (!result.ok) return result;
  const { turn } = result.state;
  const active = turn.mode === 'combat' && turn.activeEntityId ? result.state.entities[turn.activeEntityId] : undefined;
  if (!turn.activeEntityId || turn.mode !== 'combat') return result;
  if (active && ruleset.canAct(active)) return result;
  const passed = endTurn(result.state, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: turn.activeEntityId } as EndTurnCommand, { ruleset, ...(content ? { content } : {}) });
  if (!passed.ok) return result;
  return { ok: true, state: passed.state, events: [...result.events, ...passed.events] };
}
