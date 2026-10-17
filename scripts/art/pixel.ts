// Pixel-drawing helpers and the 0x72-based palette shared by the procedural art scripts.
import { type Image } from './png.ts';
import { type Rgb, hexToRgb } from './color.ts';

export const T = 16;

/** 0x72 DungeonTileset II colours, plus a few muted wood/iron/fluid steps. */
export const C = {
  out: '#222222', void: '#111111', ink: '#1a1416',
  s0: '#483b3a', s1: '#775c55', s2: '#aa8d7a', s3: '#d3bfa9', cap: '#2e2627',
  w0: '#2c1d1b', w1: '#4a2e27', w2: '#64402f', w3: '#7d5536', w4: '#966b42',
  i0: '#333333', i1: '#55565c', i2: '#878b91',
  f0: '#62232f', f1: '#8f4029', f2: '#c56025', f3: '#ee8e2e', f4: '#facb3e', f5: '#fdf7ed',
  b0: '#3a0e15', b1: '#5c1a22', b2: '#7e2629', b3: '#a03a30',
  d0: '#5e4a42', d1: '#775c55', d2: '#9a8070', d3: '#bba48e',
  // Fluids and effects.
  oil0: '#141014', oil1: '#231b22', oil2: '#3a2d3a', sheen0: '#4a3f63', sheen1: '#3f6363', glint: '#e8e0d0',
  gr0: '#5e5232', gr1: '#80703f', gr2: '#a8945a', gr3: '#d0c08a',
  wa0: '#1e3442', wa1: '#2e4a5e', wa2: '#4a6a7e', wa3: '#8ab0c0', wa4: '#d0e4ea',
  ic0: '#6f8ea0', ic1: '#9ab8c8', ic2: '#c4dce6', ic3: '#eef6f8',
  el0: '#a0e8ff', el1: '#fff8a0', el2: '#ffffff',
  sm0: '#3a3436', sm1: '#5a5254', sm2: '#857c7c', st0: '#9aa4ac', st1: '#c4ccd2', st2: '#e8eef0',
  paint: '#7a2a24', paint1: '#9e3a2a', warn: '#d8c070',
};
export type Key = keyof typeof C;
export const rgb = (k: Key | string): Rgb => hexToRgb(k in C ? C[k as Key] : k);

/** Deterministic RNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Writes a pixel; `alpha` in 0..255 (null colour clears it). */
export function set(img: Image, x: number, y: number, c: Rgb | null, alpha = 255): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  if (!c) {
    img.data[i + 3] = 0;
    return;
  }
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [c[0], c[1], c[2], alpha];
}
export function get(img: Image, x: number, y: number): Rgb | null {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
  const i = (y * img.width + x) * 4;
  return img.data[i + 3] ? [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!] : null;
}
export function rect(img: Image, x: number, y: number, w: number, h: number, c: Rgb): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(img, xx, yy, c);
}
/** Paints an ASCII drawing; each char looks up `legend` ('.' or ' ' = leave as is). */
export function ascii(img: Image, x0: number, y0: number, rows: string[], legend: Record<string, Key | null>): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const k = legend[ch];
      if (k === undefined) throw new Error(`no colour for "${ch}"`);
      set(img, x0 + x, y0 + y, k === null ? null : rgb(k));
    });
  });
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** Ordered-dither threshold in [0, 1). */
export const bayer = (x: number, y: number): number => (BAYER[y & 3]![x & 3]! + 0.5) / 16;

/** Smooth 2D value noise in [0, 1] with a period of `period` pixels (tiles seamlessly). */
export function valueNoise(seed: number, period: number, cell: number): (x: number, y: number) => number {
  const n = Math.max(1, Math.round(period / cell));
  const r = rng(seed);
  const grid = Array.from({ length: n * n }, () => r());
  const g = (i: number, j: number) => grid[(((j % n) + n) % n) * n + (((i % n) + n) % n)]!;
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g(i, j) + (g(i + 1, j) - g(i, j)) * sx;
    const b = g(i, j + 1) + (g(i + 1, j + 1) - g(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

export const FLAME_LEGEND: Record<string, Key> = { r: 'f1', o: 'f2', y: 'f3', Y: 'f4', w: 'f5', d: 'f0' };
export const FLAMES: string[][] = [
  ['...d...', '..ro...', '..royr.', '.royYo.', '.roYYyr', '.ryYwyr', '..yYYy.', '..oyyo.'],
  ['....d..', '...or..', '..royr.', '.ryYyo.', 'royYYyr', '.ryYwyr', '..yYYy.', '..oyyo.'],
  ['..d....', '..or...', '.royr..', '.royYo.', '.ryYYor', 'ryYwYyr', '.yYYYy.', '..oyyo.'],
  ['.......', '...d...', '..ror..', '..oyYr.', '.ryYYo.', '.ryYwyr', '..yYYy.', '..oyyo.'],
];
