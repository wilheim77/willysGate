import { type ActCommand, type EndTurnCommand, isHostile } from './combat';
import { type BaseCommand, type MoveCommand, blockedTiles, surfaceCost } from './commands';
import { type Vec2, gridDistance, posKey, samePos } from './grid';
import { findPath, reachableTiles } from './pathfinding';
import { surfaceAt } from './surfaces';
import type { ActionDef, ActionTarget, Ruleset } from './ruleset';
import { type Entity, type GameState, OBJECT_TAG } from './state';

/**
 * Generic tactical AI. It knows nothing about any rule system: it enumerates the
 * ruleset's actions, asks the ruleset to preview each (chance, expected damage or
 * healing) from every reachable tile, and scores the result. One command per call:
 * move, act, or end the turn. Call again after applying each command.
 *
 * Weights live in AiProfile so each game (or enemy type) can tune them as data.
 */
export interface AiProfile {
  damage: number;
  healing: number;
  /** Bonus for finishing a target off (expected damage >= remaining hit points). */
  kill: number;
  /** Prefer wounded targets: bonus × missing-health fraction. */
  focusWounded: number;
  /** Penalty per tile walked (lazy enemies stay put). */
  walking: number;
  /** Penalty per point of surface hazard (or ruleset `dangerAt`) at the tile the AI would end on. */
  hazard: number;
  /** Weight of damage to its own side (collateral of an explosion or a shove), as a loss. */
  friendlyFire: number;
  /** Resource that represents health; defaults to the ruleset's resource with role 'health'. */
  healthResource?: string;
  /** Weight of the preview's `utility` (conditions, buffs, control). */
  utility?: number;
  /**
   * Penalty per unit of a resource that does not come back each turn (a spell slot, a
   * once-a-day power, a recharge), so they are spent only when they beat the free option.
   */
  scarcity?: number;
  /** Tiles the creature likes to keep between itself and the nearest enemy (0: melee). */
  keepAway?: number;
  /** Penalty per tile an end position falls short of `keepAway`. */
  exposure?: number;
}

export const DEFAULT_AI: AiProfile = { damage: 1, healing: 1.2, kill: 6, focusWounded: 3, walking: 0.15, hazard: 1.5, friendlyFire: 1.5, utility: 1, scarcity: 1.5, keepAway: 0, exposure: 2 };

export function healthResourceOf(ruleset: Ruleset): string | undefined {
  return Object.entries(ruleset.resources).find(([, r]) => r.role === 'health')?.[0];
}

interface Candidate {
  position: Vec2;
  pathCost: number;
  action: ActionDef;
  target: ActionTarget;
  score: number;
}

export function nextAiCommand(ruleset: Ruleset, state: GameState, actorId: string, profile: AiProfile = DEFAULT_AI): BaseCommand {
  const actor = state.entities[actorId]!;
  const issuer = actor.controllerId;
  const endTurn: EndTurnCommand = { type: 'endTurn', issuer, entityId: actorId };
  if (!ruleset.canAct(actor)) return endTurn;

  const blocked = blockedTiles(ruleset, state, actorId);
  const movementLeft = Math.max(0, ruleset.movementBudget(actor, state) - state.turn.movementUsed);
  const reachable = [...reachableTiles(state.map, actor.position, movementLeft, { blocked, rules: ruleset.movement, extraCost: surfaceCost(ruleset, state) }).values()];

  const tuned: AiProfile = { ...DEFAULT_AI, ...profile, ...(ruleset.aiProfile?.(state, actorId) ?? {}) };
  const best = bestCandidate(ruleset, state, actor, reachable, { ...tuned, healthResource: tuned.healthResource ?? healthResourceOf(ruleset) });
  if (best && best.score > 0) {
    if (samePos(best.position, actor.position)) {
      return { type: 'act', issuer, entityId: actorId, actionId: best.action.id, target: best.target } as ActCommand;
    }
    return { type: 'move', issuer, entityId: actorId, to: best.position } as MoveCommand;
  }

  // Nothing worth doing from here. A caster that is too close backs off (never from an
  // adjacent enemy: that would only invite a free attack); everyone else closes in,
  // casters only as far as their preferred distance.
  const keepAway = tuned.keepAway ?? 0;
  if (keepAway > 0) {
    const near = nearestEnemyDistance(ruleset, state, actor, actor.position);
    if (near >= 2 && near < keepAway) {
      const away = retreatTile(ruleset, state, actor, reachable, keepAway);
      if (away && !samePos(away, actor.position)) return { type: 'move', issuer, entityId: actorId, to: away } as MoveCommand;
      return endTurn;
    }
  }
  const approach = approachNearestEnemy(ruleset, state, actor, reachable, blocked, keepAway);
  if (approach && !samePos(approach, actor.position)) return { type: 'move', issuer, entityId: actorId, to: approach } as MoveCommand;
  return endTurn;
}

function bestCandidate(ruleset: Ruleset, state: GameState, actor: Entity, reachable: { pos: Vec2; cost: number }[], profile: AiProfile): Candidate | null {
  const affordable = ruleset
    .listActions(state, actor.id)
    .filter((a) => Object.entries(a.cost).every(([r, n]) => (actor.resources[r]?.current ?? 0) >= n));
  const others = Object.values(state.entities).filter((e) => e.id !== actor.id && ruleset.isStanding(e) && !e.tags.includes(OBJECT_TAG));
  // Fallen friends can still be saved: healing and support actions may target them.
  const fallenFriends = Object.values(state.entities).filter(
    (e) => e.id !== actor.id && !ruleset.isStanding(e) && !e.tags.includes(OBJECT_TAG) && !isHostile(actor, e) && ruleset.occupiesTile?.(e) !== false,
  );
  // Scenery that can be hit or shoved (an oil barrel): worth it only for what it does to others,
  // which the ruleset reports as the preview's collateral.
  const props = Object.values(state.entities).filter((e) => e.tags.includes(OBJECT_TAG) && ruleset.isStanding(e) && e.resources[profile.healthResource ?? ''] !== undefined);
  let best: Candidate | null = null;

  for (const action of affordable) {
    // Tile-targeted actions (area spells) are aimed at enemies' tiles; the ruleset's
    // preview nets out allies caught in the area.
    const targets: Entity[] =
      action.target.kind === 'self'
        ? [actor]
        : action.target.kind === 'creature'
          ? [
              ...others,
              ...props,
              ...(action.tags.includes('heal') || action.tags.includes('support') ? fallenFriends : []),
              // Friendly spells may be cast on oneself (a heal, a shield of faith).
              ...(action.target.filter === 'ally' ? [actor] : []),
            ].filter((e) => matchesFilter(actor, e, action.target.filter))
          : [...others.filter((e) => isHostile(actor, e)), ...props];
    const scarce = Object.entries(action.cost).reduce((n, [r, c]) => n + (ruleset.resources[r] && ruleset.resources[r]!.refresh !== 'turn' ? c : 0), 0);
    for (const target of targets) {
      // Try the tiles from which the target is in range, nearest first.
      const inRange = reachable.filter((r) => action.target.kind === 'self' || gridDistance(r.pos, target.position) <= action.target.range);
      const cheapest = inRange
        .map((r) => ({ ...r, exposed: exposureAt(ruleset, state, actor, r.pos, profile) }))
        .sort((a, b) => a.cost + a.exposed - (b.cost + b.exposed))
        .slice(0, 6);
      // Something done around oneself (a blast, a war cry) is worth trying next to the foes too,
      // not only on the cheapest tiles.
      const foes = action.target.kind === 'self' ? others.filter((e) => isHostile(actor, e)) : [];
      const nearFoes = foes.length
        ? inRange
            .map((r) => ({ ...r, d: Math.min(...foes.map((f) => gridDistance(r.pos, f.position))) }))
            .sort((a, b) => a.d - b.d || a.cost - b.cost)
            .slice(0, 4)
            .filter((r) => !cheapest.some((c) => c.pos.x === r.pos.x && c.pos.y === r.pos.y))
            .map((r) => ({ pos: r.pos, cost: r.cost, exposed: exposureAt(ruleset, state, actor, r.pos, profile) }))
        : [];
      const spots = [...cheapest, ...nearFoes];
      for (const spot of spots) {
        const hypothetical = withPosition(state, actor.id, spot.pos);
        const ref: ActionTarget = action.target.kind === 'tile' ? { tile: { ...target.position } } : { entityId: target.id };
        const preview = ruleset.previewAction(hypothetical, actor.id, action.id, ref);
        if (!preview.valid) continue;
        const score =
          scorePreview(preview, actor, target, profile) +
          collateralScore(preview, actor, hypothetical, profile) -
          spot.cost * profile.walking -
          (hazardAt(ruleset, state, spot.pos) + (ruleset.dangerAt?.(hypothetical, actor.id, spot.pos) ?? 0)) * profile.hazard -
          spot.exposed -
          scarce * (profile.scarcity ?? 0);
        if (!best || score > best.score) best = { position: spot.pos, pathCost: spot.cost, action, target: ref, score };
      }
    }
  }
  return best;
}

function scorePreview(
  preview: ReturnType<Ruleset['previewAction']>,
  actor: Entity,
  target: Entity,
  profile: AiProfile,
): number {
  const health = profile.healthResource ? target.resources[profile.healthResource] : undefined;
  const missing = health && health.max > 0 ? 1 - health.current / health.max : 0;
  let score = 0;
  // Damage to scenery is no gain in itself (see collateralScore).
  if (preview.expectedDamage && isHostile(actor, target) && !target.tags.includes(OBJECT_TAG)) {
    score += preview.expectedDamage * profile.damage + missing * profile.focusWounded;
    if (health && preview.expectedDamage >= health.current) score += profile.kill * (preview.chance ?? 1);
  } else if (preview.expectedDamage && target.id === actor.id) {
    // Aimed at oneself (a blast all around, a self-destruct): the damage lands on the foes about;
    // the ruleset's preview already nets out the allies caught in it (collateral).
    score += preview.expectedDamage * profile.damage;
  }
  if (preview.expectedHealing && !isHostile(actor, target)) {
    // Healing a healthy ally is worthless; healing a dying one is worth a lot.
    score += Math.min(preview.expectedHealing, health ? health.max - health.current : 0) * profile.healing * (0.5 + missing);
  }
  if (preview.utility) score += preview.utility * (profile.utility ?? 1);
  return score;
}

/** What an action does to everyone else (an explosion, a chain of shoves): foes gain, friends lose. */
function collateralScore(preview: ReturnType<Ruleset['previewAction']>, actor: Entity, state: GameState, profile: AiProfile): number {
  let score = 0;
  for (const c of preview.collateral ?? []) {
    const e = state.entities[c.entityId];
    if (!e || e.tags.includes(OBJECT_TAG) || c.damage <= 0) continue;
    if (e.id !== actor.id && isHostile(actor, e)) {
      const health = profile.healthResource ? e.resources[profile.healthResource] : undefined;
      score += c.damage * profile.damage + (health && c.damage >= health.current ? profile.kill * 0.5 : 0);
    } else score -= c.damage * profile.friendlyFire;
  }
  return score;
}

/** Grid distance from `p` to the nearest standing enemy (Infinity if none). */
function nearestEnemyDistance(ruleset: Ruleset, state: GameState, actor: Entity, p: Vec2): number {
  let best = Infinity;
  for (const e of Object.values(state.entities)) {
    if (e.id === actor.id || !isHostile(actor, e) || !ruleset.isStanding(e) || e.tags.includes(OBJECT_TAG)) continue;
    best = Math.min(best, gridDistance(p, e.position));
  }
  return best;
}

/** Score penalty for ending at `p` closer to the enemy than the creature likes. */
function exposureAt(ruleset: Ruleset, state: GameState, actor: Entity, p: Vec2, profile: AiProfile): number {
  const keepAway = profile.keepAway ?? 0;
  if (keepAway <= 0) return 0;
  return Math.max(0, keepAway - nearestEnemyDistance(ruleset, state, actor, p)) * (profile.exposure ?? 0);
}

/** The reachable tile that best restores the preferred distance; staying put wins ties. */
function retreatTile(ruleset: Ruleset, state: GameState, actor: Entity, reachable: { pos: Vec2; cost: number }[], keepAway: number): Vec2 | null {
  let best: { pos: Vec2; value: number } | null = null;
  for (const r of reachable) {
    const value = Math.min(keepAway, nearestEnemyDistance(ruleset, state, actor, r.pos)) - r.cost * 0.01 - hazardAt(ruleset, state, r.pos) * 3;
    if (!best || value > best.value + 1e-9) best = { pos: r.pos, value };
  }
  return best?.pos ?? null;
}

function approachNearestEnemy(ruleset: Ruleset, state: GameState, actor: Entity, reachable: { pos: Vec2; cost: number }[], blocked: Set<string>, keepAway = 0): Vec2 | null {
  const enemies = Object.values(state.entities).filter((e) => isHostile(actor, e) && ruleset.isStanding(e) && !e.tags.includes(OBJECT_TAG));
  if (enemies.length === 0 || reachable.length === 0) return null;
  // Casters stop at their preferred distance (when there is somewhere that far).
  const safe = keepAway > 0 ? reachable.filter((r) => nearestEnemyDistance(ruleset, state, actor, r.pos) >= keepAway) : reachable;
  const pool = safe.length > 0 ? safe : reachable;
  let best: { pos: Vec2; d: number } | null = null;
  for (const r of pool) {
    for (const enemy of enemies) {
      // Distance along walkable paths, so it doesn't get stuck against walls.
      const path = findPath(state.map, r.pos, enemy.position, { blocked: new Set([...blocked].filter((k) => k !== posKey(enemy.position))), rules: ruleset.movement });
      const d = (path ? path.cost : gridDistance(r.pos, enemy.position) + 100) + hazardAt(ruleset, state, r.pos) * 3;
      if (!best || d < best.d || (d === best.d && r.cost < (reachable.find((x) => samePos(x.pos, best!.pos))?.cost ?? 0))) best = { pos: r.pos, d };
    }
  }
  return best?.pos ?? null;
}

/** How dangerous it is to stand on a tile, from its surface's data. */
function hazardAt(ruleset: Ruleset, state: GameState, p: Vec2): number {
  const s = surfaceAt(state, p);
  return s ? (ruleset.surfaces?.[s.type]?.hazard ?? 0) : 0;
}

function matchesFilter(actor: Entity, target: Entity, filter: ActionDef['target']['filter']): boolean {
  if (filter === 'hostile') return isHostile(actor, target);
  if (filter === 'ally') return !isHostile(actor, target);
  return true;
}

function withPosition(state: GameState, id: string, pos: Vec2): GameState {
  return { ...state, entities: { ...state.entities, [id]: { ...state.entities[id]!, position: pos } } };
}
