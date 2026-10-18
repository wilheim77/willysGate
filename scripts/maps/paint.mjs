// A tiny canvas to paint map sources with rectangles instead of hand-aligned ASCII.
// Terrain chars as in build.mjs: '.' stone ',' dirt ';' slag '=' planks 'H' scaffold
// '#' wall '+' closed door '/' open door '-' rails '|' rails_v 'v' vault, 'C' + height 4 cliff ' ' void.
export class Canvas {
  constructor(width, height, terrain = ',', h = 0) {
    this.width = width;
    this.height = height;
    this.t = Array.from({ length: height }, () => Array(width).fill(terrain));
    this.h = Array.from({ length: height }, () => Array(width).fill(h));
  }

  /** Paint a rectangle. `height` undefined keeps the current heights. */
  rect(x, y, w, h, terrain, height) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        if (yy < 0 || xx < 0 || yy >= this.height || xx >= this.width) continue;
        if (terrain) this.t[yy][xx] = terrain;
        if (height !== undefined) this.h[yy][xx] = height;
      }
    return this;
  }

  put(x, y, terrain, height) {
    return this.rect(x, y, 1, 1, terrain, height);
  }

  /** Hollow rectangle of walls (a room's outline). */
  walls(x, y, w, h, terrain = '#') {
    this.rect(x, y, w, 1, terrain);
    this.rect(x, y + h - 1, w, 1, terrain);
    this.rect(x, y, 1, h, terrain);
    this.rect(x + w - 1, y, 1, h, terrain);
    return this;
  }

  /**
   * Stamp an ASCII block at (x, y). Each row is a string; ' ' leaves the cell alone.
   * `legend` maps a char to [terrain, height] (default: the char is a terrain at `height`).
   */
  stamp(x, y, rows, legend = {}, height) {
    rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        if (c === ' ') return;
        const [terrain, h] = legend[c] ?? [c, height];
        this.put(x + dx, y + dy, terrain, h);
      }),
    );
    return this;
  }

  /** A digit grid stamped as heights only. */
  heights(x, y, rows) {
    rows.forEach((row, dy) => [...row].forEach((c, dx) => /[0-9]/.test(c) && this.put(x + dx, y + dy, undefined, Number(c))));
    return this;
  }

  /** Re-terrain every cell: fn(terrainChar, height, x, y) returns a new char (or the same). */
  retile(fn) {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.t[y][x] = fn(this.t[y][x], this.h[y][x], x, y);
    return this;
  }

  source() {
    return { terrain: this.t.map((r) => r.join('')), height: this.h.map((r) => r.join('')) };
  }
}
