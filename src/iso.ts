import type { Vec2 } from '../engine';

/** Isometric projection for a given tile size. Tile size comes from the game's asset manifest. */
export class IsoProjection {
  constructor(
    readonly tileW: number,
    readonly tileH: number,
    /** Screen pixels per elevation level. */
    readonly levelH: number,
  ) {}

  /** World-space centre of a tile's top face. */
  tileToWorld(x: number, y: number, height: number): Vec2 {
    return { x: (x - y) * (this.tileW / 2), y: (x + y) * (this.tileH / 2) - height * this.levelH };
  }

  /** Is the world point inside the top diamond of a tile centred at `c`? */
  inTopFace(c: Vec2, p: Vec2): boolean {
    return Math.abs(p.x - c.x) / (this.tileW / 2) + Math.abs(p.y - c.y) / (this.tileH / 2) <= 1;
  }
}

/** Painter's order: tiles further back (smaller x+y) are drawn first. */
export function depthOf(x: number, y: number, layer = 0): number {
  return (x + y) * 10 + layer;
}
