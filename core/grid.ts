export interface Vec2 {
  x: number;
  y: number;
}

export interface Tile {
  terrain: string;
  /** Integer elevation level. 0 is ground level. */
  height: number;
  walkable: boolean;
}

/** Row-major grid: tiles[y * width + x]. */
export interface GridMap {
  id: string;
  width: number;
  height: number;
  tiles: Tile[];
}

export const VOID_TILE: Tile = Object.freeze({ terrain: 'void', height: 0, walkable: false });

export function inBounds(map: GridMap, p: Vec2): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
}

export function tileAt(map: GridMap, p: Vec2): Tile | undefined {
  if (!inBounds(map, p)) return undefined;
  return map.tiles[p.y * map.width + p.x];
}

export function posKey(p: Vec2): string {
  return `${p.x},${p.y}`;
}

export function samePos(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Chebyshev distance: the 5e grid distance when diagonals cost 1. */
export function gridDistance(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
