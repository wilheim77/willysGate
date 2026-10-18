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
}

export const DEFAULT_AI: AiProfile = { damage: 1, healing: 1.2, kill: 6, focusWounded: 3, walking: 0.15, hazard: 1.5, friendlyFire: 1.5 };

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

  const best = bestCandidate(ruleset, state, actor, reachable, { ...profile, healthResource: profile.healthResource ?? healthResourceOf(ruleset) });
  if (best && best.score > 0) {
    if (samePos(best.position, actor.position)) {
      return { type: 'act', issuer, entityId: actorId, actionId: best.action.id, target: best.target } as ActCommand;
    }
    return { type: 'move', issuer, entityId: actorId, to: best.position } as MoveCommand;
  }

  // Nothing worth doing from here: close in on the nearest enemy.
  const approach = approachNearestEnemy(ruleset, state, actor, reachable, blocked);
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
          ? [...others, ...props, ...(action.tags.includes('heal') || action.tags.includes('support') ? fallenFriends : [])].filter((e) => matchesFilter(actor, e, action.target.filter))
          : [...others.filter((e) => isHostile(actor, e)), ...props];
    for (const target of targets) {
      // Try the tiles from which the target is in range, nearest first.
      const spots = reachable
        .filter((r) => action.target.kind === 'self' || gridDistance(r.pos, target.position) <= action.target.range)
        .sort((a, b) => a.cost - b.cost)
        .slice(0, 6);
      for (const spot of spots) {
        const hypothetical = withPosition(state, actor.id, spot.pos);
        const ref: ActionTarget = action.target.kind === 'tile' ? { tile: { ...target.position } } : { entityId: target.id };
        const preview = ruleset.previewAction(hypothetical, actor.id, action.id, ref);
        if (!preview.valid) continue;
        const score =
          scorePreview(preview, actor, target, profile) +
          collateralScore(preview, actor, hypothetical, profile) -
          spot.cost * profile.walking -
          (hazardAt(ruleset, state, spot.pos) + (ruleset.dangerAt?.(hypothetical, actor.id, spot.pos) ?? 0)) * profile.hazard;
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
  }
  if (preview.expectedHealing && !isHostile(actor, target)) {
    // Healing a healthy ally is worthless; healing a dying one is worth a lot.
    score += Math.min(preview.expectedHealing, health ? health.max - health.current : 0) * profile.healing * (0.5 + missing);
  }
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

function approachNearestEnemy(ruleset: Ruleset, state: GameState, actor: Entity, reachable: { pos: Vec2; cost: number }[], blocked: Set<string>): Vec2 | null {
  const enemies = Object.values(state.entities).filter((e) => isHostile(actor, e) && ruleset.isStanding(e) && !e.tags.includes(OBJECT_TAG));
  if (enemies.length === 0 || reachable.length === 0) return null;
  let best: { pos: Vec2; d: number } | null = null;
  for (const r of reachable) {
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
