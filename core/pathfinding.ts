import { type GridMap, type Vec2, inBounds, posKey, samePos, tileAt } from './grid';

/** Highest elevation change a creature can step up or down without climbing or jumping. */
export const MAX_STEP = 1;
/** Extra movement cost for stepping up one level. */
export const CLIMB_COST = 1;

export interface PathOptions {
  /** Tiles that cannot be entered (e.g. occupied by other creatures). Keys from posKey(). */
  blocked?: ReadonlySet<string>;
  /** Give up on paths more expensive than this. */
  maxCost?: number;
}

export interface PathResult {
  /** Steps from the first tile after `from` up to and including `to`. */
  path: Vec2[];
  cost: number;
}

const DIRECTIONS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/** Cost of a single step between adjacent tiles, or null if the step is not allowed. */
export function stepCost(map: GridMap, from: Vec2, to: Vec2, blocked?: ReadonlySet<string>): number | null {
  const a = tileAt(map, from);
  const b = tileAt(map, to);
  if (!a || !b || !b.walkable) return null;
  if (blocked?.has(posKey(to))) return null;
  const dh = b.height - a.height;
  if (Math.abs(dh) > MAX_STEP) return null;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return null;
  if (dx !== 0 && dy !== 0) {
    // No cutting corners: both orthogonal neighbours must be passable at a compatible height.
    for (const side of [{ x: from.x + dx, y: from.y }, { x: from.x, y: from.y + dy }]) {
      const t = tileAt(map, side);
      if (!t || !t.walkable || Math.abs(t.height - a.height) > MAX_STEP) return null;
    }
  }
  return 1 + (dh > 0 ? CLIMB_COST * dh : 0);
}

/** A* over the 8-connected grid. Deterministic: equal-cost ties always resolve the same way. */
export function findPath(map: GridMap, from: Vec2, to: Vec2, options: PathOptions = {}): PathResult | null {
  if (!inBounds(map, from) || !inBounds(map, to)) return null;
  if (samePos(from, to)) return { path: [], cost: 0 };
  const goal = tileAt(map, to);
  if (!goal?.walkable || options.blocked?.has(posKey(to))) return null;

  const maxCost = options.maxCost ?? Infinity;
  const index = (p: Vec2): number => p.y * map.width + p.x;
  const heuristic = (p: Vec2): number => Math.max(Math.abs(p.x - to.x), Math.abs(p.y - to.y));

  const gScore = new Map<number, number>([[index(from), 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  let order = 0;
  open.push({ pos: from, f: heuristic(from), h: heuristic(from), order: order++ });

  while (open.size > 0) {
    const current = open.pop()!;
    const ci = index(current.pos);
    if (closed.has(ci)) continue;
    closed.add(ci);

    if (samePos(current.pos, to)) {
      const path: Vec2[] = [];
      let i: number | undefined = ci;
      while (i !== undefined && i !== index(from)) {
        path.push({ x: i % map.width, y: Math.floor(i / map.width) });
        i = cameFrom.get(i);
      }
      return { path: path.reverse(), cost: gScore.get(ci)! };
    }

    const g = gScore.get(ci)!;
    for (const d of DIRECTIONS) {
      const next = { x: current.pos.x + d.x, y: current.pos.y + d.y };
      const cost = stepCost(map, current.pos, next, options.blocked);
      if (cost === null) continue;
      const ni = index(next);
      const tentative = g + cost;
      if (tentative > maxCost || closed.has(ni)) continue;
      if (tentative < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, tentative);
        cameFrom.set(ni, ci);
        const h = heuristic(next);
        open.push({ pos: next, f: tentative + h, h, order: order++ });
      }
    }
  }
  return null;
}

interface OpenNode {
  pos: Vec2;
  f: number;
  h: number;
  order: number;
}

function before(a: OpenNode, b: OpenNode): boolean {
  if (a.f !== b.f) return a.f < b.f;
  if (a.h !== b.h) return a.h < b.h;
  return a.order < b.order;
}

class MinHeap {
  private items: OpenNode[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: OpenNode): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(items[i]!, items[parent]!)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  pop(): OpenNode | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && before(items[l]!, items[best]!)) best = l;
        if (r < items.length && before(items[r]!, items[best]!)) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best]!, items[i]!];
        i = best;
      }
    }
    return top;
  }
}
