import type { Vec2 } from '../engine';

/**
 * Isometric projection for a given tile size (from the game's asset manifest),
 * with the view rotated in 90° steps. Rotation is purely visual: the GameState
 * always uses map coordinates.
 */
export class IsoProjection {
  /** 0-3, quarter turns clockwise. */
  rotation = 0;
  private mapW = 1;
  private mapH = 1;

  constructor(
    readonly tileW: number,
    readonly tileH: number,
    /** Screen pixels per elevation level. */
    readonly levelH: number,
  ) {}

  setMapSize(width: number, height: number): void {
    this.mapW = width;
    this.mapH = height;
  }

  /** Map coordinates -> rotated view coordinates. */
  toView(x: number, y: number): Vec2 {
    const { mapW: w, mapH: h } = this;
    switch (this.rotation) {
      case 1:
        return { x: h - 1 - y, y: x };
      case 2:
        return { x: w - 1 - x, y: h - 1 - y };
      case 3:
        return { x: y, y: w - 1 - x };
      default:
        return { x, y };
    }
  }

  /** World-space centre of a tile's top face. */
  tileToWorld(x: number, y: number, height: number): Vec2 {
    const v = this.toView(x, y);
    return { x: (v.x - v.y) * (this.tileW / 2), y: (v.x + v.y) * (this.tileH / 2) - height * this.levelH };
  }

  /** Painter's order: tiles further back on screen (smaller view x+y) are drawn first. */
  depth(x: number, y: number, layer = 0): number {
    const v = this.toView(x, y);
    return (v.x + v.y) * 10 + layer;
  }

  /** Is the world point inside the top diamond of a tile centred at `c`? */
  inTopFace(c: Vec2, p: Vec2): boolean {
    return Math.abs(p.x - c.x) / (this.tileW / 2) + Math.abs(p.y - c.y) / (this.tileH / 2) <= 1;
  }
}
