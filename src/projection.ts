import type { Vec2 } from '../engine';

/**
 * Top-down 3/4 projection on an orthogonal grid. Elevation is purely visual:
 * each level lifts a tile `levelH` pixels and shows a cliff face below it.
 */
export class GridProjection {
  constructor(
    readonly tile: number,
    readonly levelH: number,
  ) {}

  /** World-space centre of a tile's top surface. */
  tileCentre(x: number, y: number, height: number): Vec2 {
    return { x: x * this.tile + this.tile / 2, y: y * this.tile + this.tile / 2 - height * this.levelH };
  }

  /**
   * Draw order: rows further down the screen are in front. Within a row, higher
   * tiles go last so their faces cover lower neighbours' tops.
   */
  depth(y: number, height: number, layer = 0): number {
    return y * 100 + height * 10 + layer;
  }
}
