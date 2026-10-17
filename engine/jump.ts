import { type Vec2, inBounds, posKey, tileAt } from './grid';
import type { Ruleset } from './ruleset';
import type { GameState } from './state';

/**
 * Jumps and bouncing shots (R15): geometry only. A ruleset says how far someone can jump
 * and what a bounce does; the engine finds legal landings and traces the ball.
 */
export interface JumpRules {
  /** Tiles, in a straight line (8 directions). */
  maxLength: number;
  /** Levels you can land above where you start (ignores the walking step limit). */
  maxUp: number;
  /** Levels you can drop without it counting as a fall. */
  safeDown: number;
  /** May jump over creatures (default false). */
  overEntities?: boolean;
}

export interface JumpLanding {
  to: Vec2;
  length: number;
  /** Levels gained (+) or lost (−). */
  rise: number;
}

const DIRS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

function occupied(ruleset: Ruleset, state: GameState, p: Vec2, except: string): boolean {
  return Object.values(state.entities).some(
    (e) => e.id !== except && e.position.x === p.x && e.position.y === p.y && (ruleset.occupiesTile ? ruleset.occupiesTile(e) : ruleset.isStanding(e)),
  );
}

/**
 * Every tile `entityId` can land on: straight lines, over gaps and pits, never through a
 * wall taller than both ends of the jump.
 */
export function jumpTargets(ruleset: Ruleset, state: GameState, entityId: string, rules: JumpRules): JumpLanding[] {
  const me = state.entities[entityId];
  if (!me) return [];
  const startH = tileAt(state.map, me.position)?.height ?? 0;
  const out: JumpLanding[] = [];
  for (const d of DIRS) {
    for (let n = 1; n <= rules.maxLength; n++) {
      const p = { x: me.position.x + d.x * n, y: me.position.y + d.y * n };
      if (!inBounds(state.map, p)) break;
      const t = tileAt(state.map, p)!;
      const rise = t.height - startH;
      // A wall in the way, higher than where we take off and land, ends this line.
      if (!t.walkable && t.terrain !== 'void' && t.height > startH + rules.maxUp) break;
      const someone = occupied(ruleset, state, p, entityId);
      if (someone && !rules.overEntities) break;
      if (!t.walkable || t.terrain === 'void' || someone) continue;
      if (rise > rules.maxUp) continue;
      out.push({ to: p, length: n, rise });
    }
  }
  return out;
}

export interface ProjectileTrace {
  /** Tiles the projectile passes through, in order. */
  path: Vec2[];
  /** Where it bounced off a wall. */
  bounces: Vec2[];
  /** The first creature (or object) in its way, if any. */
  hitId?: string;
}

/**
 * A ball (or a ricochet) travelling from `from` in a straight 8-way direction, bouncing off
 * walls like a billiard ball, up to `range` tiles and `maxBounces` bounces.
 */
export function traceProjectile(ruleset: Ruleset, state: GameState, from: Vec2, toward: Vec2, options: { range: number; maxBounces: number; ignore?: string[] }): ProjectileTrace {
  let dx = Math.sign(toward.x - from.x);
  let dy = Math.sign(toward.y - from.y);
  const path: Vec2[] = [];
  const bounces: Vec2[] = [];
  if (dx === 0 && dy === 0) return { path, bounces };
  const startH = tileAt(state.map, from)?.height ?? 0;
  const solid = (p: Vec2) => {
    const t = tileAt(state.map, p);
    return !inBounds(state.map, p) || !t || (!t.walkable && t.terrain !== 'void') || t.height - startH >= 2;
  };
  const ignore = new Set(options.ignore ?? []);
  let pos = { ...from };
  const seen = new Set<string>();
  for (let step = 0; step < options.range; step++) {
    let next = { x: pos.x + dx, y: pos.y + dy };
    if (solid(next)) {
      if (bounces.length >= options.maxBounces) break;
      // Reflect the component(s) that hit the wall; a corner reverses both.
      const blockX = solid({ x: pos.x + dx, y: pos.y });
      const blockY = solid({ x: pos.x, y: pos.y + dy });
      if (blockX || (!blockX && !blockY)) dx = -dx;
      if (blockY || (!blockX && !blockY)) dy = -dy;
      bounces.push({ ...pos });
      next = { x: pos.x + dx, y: pos.y + dy };
      if (solid(next)) break;
    }
    pos = next;
    const key = `${posKey(pos)}|${dx},${dy}`;
    if (seen.has(key)) break;
    seen.add(key);
    path.push({ ...pos });
    const hit = Object.values(state.entities).find((e) => !ignore.has(e.id) && e.position.x === pos.x && e.position.y === pos.y && ruleset.isStanding(e));
    if (hit) return { path, bounces, hitId: hit.id };
  }
  return { path, bounces };
}
