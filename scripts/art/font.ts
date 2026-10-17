// A tiny 3x5 bitmap font for labels in preview sheets and cinematic panels.
import type { Image } from './png.ts';
import type { Rgb } from './color.ts';

// Each glyph: 5 rows of 3 bits (MSB = left column).
const GLYPHS: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7], Ñ: [7, 0, 6, 5, 5],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ' ': [0, 0, 0, 0, 0], _: [0, 0, 0, 0, 7], '-': [0, 0, 7, 0, 0], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4],
  ':': [0, 2, 0, 2, 0], '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '/': [1, 1, 2, 4, 4], x: [0, 5, 2, 5, 0],
  '!': [2, 2, 2, 0, 2], '¡': [2, 0, 2, 2, 2], '¿': [2, 0, 2, 4, 3], '?': [6, 1, 2, 0, 2], "'": [2, 2, 0, 0, 0], '%': [5, 1, 2, 4, 5], '+': [0, 2, 7, 2, 0],
};

// Letters that need 5 columns to stay readable (MSB = left column of 5).
const WIDE: Record<string, number[]> = { M: [17, 27, 21, 17, 17], W: [17, 17, 21, 21, 10], N: [17, 25, 21, 19, 17] };

const FOLD: Record<string, string> = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U' };

function norm(raw: string): string {
  const up = raw === '×' ? 'x' : raw.toUpperCase();
  return FOLD[up] ?? up;
}

/** Pixel width of `text` at `scale`. */
export function textWidth(text: string, scale = 1): number {
  let w = 0;
  for (const raw of text) w += (WIDE[norm(raw)] ? 6 : 4) * scale;
  return w - scale;
}

/** Draws `text` (upper-cased; accents folded) at (x, y) in an opaque colour. */
export function drawText(img: Image, text: string, x: number, y: number, rgb: Rgb, scale = 1): void {
  let cx = x;
  for (const raw of text) {
    const key = norm(raw);
    const cols = WIDE[key] ? 5 : 3;
    const g = WIDE[key] ?? GLYPHS[key] ?? GLYPHS['?']!;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < cols; col++) {
        if (!(g[row]! & ((1 << (cols - 1)) >> col))) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + col * scale + sx, py = y + row * scale + sy;
            if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
            const i = (py * img.width + px) * 4;
            [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [rgb[0], rgb[1], rgb[2], 255];
          }
        }
      }
    }
    cx += (cols + 1) * scale;
  }
}

// A 5x7 display font for logos and titles (rows of 5 bits, '1' = ink).
const BIG: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  Ñ: ['01110', '00000', '10001', '11001', '10101', '10011', '10001'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'], W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'], Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'], '¡': ['00100', '00000', '00100', '00100', '00100', '00100', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'], '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
};

/** Pixel width of `text` in the 5x7 display font; `bold` thickens strokes by one pixel. */
export function bigTextWidth(text: string, scale = 1, bold = false): number {
  let w = 0;
  for (const raw of text) w += (raw === ' ' ? 3 : 5 + (bold ? 1 : 0) + 1) * scale;
  return w - scale;
}

/** Draws `text` in the 5x7 display font (upper-cased; accents folded). */
export function drawBigText(img: Image, text: string, x: number, y: number, rgb: Rgb, scale = 1, bold = false): void {
  let cx = x;
  const plot = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return;
    const i = (py * img.width + px) * 4;
    [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [rgb[0], rgb[1], rgb[2], 255];
  };
  for (const raw of text) {
    if (raw === ' ') { cx += 3 * scale; continue; }
    const g = BIG[norm(raw)] ?? BIG['!']!;
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (g[row]![col] !== '1') continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale + (bold ? scale : 0); sx++) plot(cx + col * scale + sx, y + row * scale + sy);
    }
    cx += (5 + (bold ? 1 : 0) + 1) * scale;
  }
}
