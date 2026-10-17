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
const WIDE: Record<string, number[]> = { M: [17, 27, 21, 17, 17], W: [17, 17, 21, 21, 10] };

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
