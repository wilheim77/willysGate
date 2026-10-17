import { type Vec2, samePos, tileAt } from './grid';
import type { GameState } from './state';

/**
 * Line of sight on the grid, generic: what stands between two tiles. Rulesets turn
 * obstructions into cover, darkness or "can't target"; lighting uses it so walls cast
 * shadows. Elevation matters: terrain blocks the view only if it rises at least
 * `BLOCKING_RISE` levels above both ends, so you can see over a step but not a wall.
 */
export const BLOCKING_RISE = 2;
/** Entities with this tag (crates, barrels, pillars) obstruct lines between other tiles. */
export const OBSTACLE_TAG = 'obstacle';

export interface Obstruction {
  tile: Vec2;
  kind: 'terrain' | 'entity';
  entityId?: string;
}

/** Tiles crossed going from `a` to `b` (Bresenham), excluding both ends. */
export function lineBetween(a: Vec2, b: Vec2): Vec2[] {
  const out: Vec2[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === b.x && y === b.y) break;
    out.push({ x, y });
  }
  return out;
}

/** Everything that obstructs the line from `a` to `b`. */
export function obstructionsBetween(state: GameState, a: Vec2, b: Vec2, options: { entities?: boolean } = {}): Obstruction[] {
  const ha = tileAt(state.map, a)?.height ?? 0;
  const hb = tileAt(state.map, b)?.height ?? 0;
  const eye = Math.max(ha, hb);
  const obstacles = options.entities === false ? [] : Object.values(state.entities).filter((e) => e.tags.includes(OBSTACLE_TAG));
  const out: Obstruction[] = [];
  for (const p of lineBetween(a, b)) {
    const t = tileAt(state.map, p);
    if (!t || t.terrain === 'void') continue;
    if (!t.walkable && t.height >= eye || t.height - eye >= BLOCKING_RISE) out.push({ tile: p, kind: 'terrain' });
    const blocker = obstacles.find((e) => samePos(e.position, p) && !samePos(e.position, a) && !samePos(e.position, b));
    if (blocker) out.push({ tile: p, kind: 'entity', entityId: blocker.id });
  }
  return out;
}

/** True when no terrain blocks the view (obstacle entities only give cover, they don't blind). */
export function hasLineOfSight(state: GameState, a: Vec2, b: Vec2): boolean {
  return !obstructionsBetween(state, a, b, { entities: false }).some((o) => o.kind === 'terrain');
}

