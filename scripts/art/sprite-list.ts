import { readFileSync } from 'node:fs';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Parses a "name x y w h" sprite list (one per line), as shipped with 0x72's DungeonTileset II. */
export function readSpriteList(path: string): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const [name, x, y, w, h] = line.trim().split(/\s+/);
    if (name && h !== undefined) out[name] = { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
  }
  return out;
}
