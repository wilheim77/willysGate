// Map markers shared by both games: exit chevrons (open: animated, closed: dim with a bar).
// They point right; the client rotates them towards the map edge the exit leads off.
import { type Image, blank } from './png.ts';
import { hexToRgb } from './color.ts';

const CHEVRON = ['k.....', 'Ck....', 'cCk...', '.cCk..', '..cCk.', '...cCk', '..cCk.', '.cCk..', 'cCk...', 'Ck....', 'k.....'];

function put(img: Image, x: number, y: number, hex: string, a = 255): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const [r, g, b] = hexToRgb(hex);
  const i = (y * img.width + x) * 4;
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [r, g, b, a];
}

function chevron(img: Image, x0: number, y0: number, light: string, dark: string, alpha: number): void {
  CHEVRON.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    put(img, x0 + x, y0 + y, ch === 'C' ? light : ch === 'c' ? dark : '#111111', alpha);
  }));
}

/** Open exit (16x16, 4 frames): two chevrons sliding towards the edge, the leading one brighter. */
export function exitOpen(frame: number, light: string, dark: string): Image {
  const img = blank(16, 16);
  const shift = frame % 4;
  chevron(img, 1 + shift, 2, dark, '#111111', 150 + 20 * shift);
  chevron(img, 6 + shift, 2, light, dark, 255);
  return img;
}

/** Closed exit (16x16, still): one dim chevron behind a bar. */
export function exitClosed(): Image {
  const img = blank(16, 16);
  chevron(img, 7, 2, '#6a6a72', '#3a3a40', 200);
  for (let y = 2; y < 13; y++) {
    put(img, 3, y, '#111111', 220);
    put(img, 4, y, '#8a5a50', 220);
    put(img, 5, y, '#111111', 220);
  }
  return img;
}
