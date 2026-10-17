// Paints hand-designed pixel-art busts from simple shapes: each shape is filled with a
// 3-step ramp lit from the top-left (light on edges facing the light, shade on the far
// edges), small features are placed pixel by pixel, and the whole figure gets a dark
// outline. Used by build-portraits.ts for the 'hand' entries of portraits.json.
import { type Image, blank } from './png.ts';
import { type Rgb, hexToRgb } from './color.ts';

export type Shape =
  | { op: 'ellipse'; cx: number; cy: number; rx: number; ry: number; ramp?: string[]; color?: string; flat?: boolean }
  | { op: 'poly'; points: number[][]; ramp?: string[]; color?: string; flat?: boolean }
  | { op: 'rect'; x: number; y: number; w: number; h: number; ramp?: string[]; color?: string; flat?: boolean }
  | { op: 'line'; points: number[][]; color: string }
  | { op: 'px'; color: string; at: number[][] };

function inPoly(x: number, y: number, pts: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!, [xj, yj] = pts[j]!;
    if ((yi! > y) !== (yj! > y) && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

function maskOf(s: Shape, size: number): boolean[][] {
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => {
    const px = x + 0.5, py = y + 0.5;
    if (s.op === 'ellipse') return ((px - s.cx) / s.rx) ** 2 + ((py - s.cy) / s.ry) ** 2 <= 1;
    if (s.op === 'poly') return inPoly(px, py, s.points);
    if (s.op === 'rect') return x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
    return false;
  }));
}

/** Paints the figure (transparent background) and outlines it. */
export function paintBust(shapes: Shape[], size: number, outline = '#111111'): Image {
  const img = blank(size, size);
  const set = (x: number, y: number, c: Rgb) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [c[0], c[1], c[2], 255];
  };
  for (const s of shapes) {
    if (s.op === 'px') {
      for (const [x, y] of s.at) set(x!, y!, hexToRgb(s.color));
      continue;
    }
    if (s.op === 'line') {
      for (let k = 0; k + 1 < s.points.length; k++) {
        const [x0, y0] = s.points[k]!, [x1, y1] = s.points[k + 1]!;
        const n = Math.max(Math.abs(x1! - x0!), Math.abs(y1! - y0!), 1);
        for (let i = 0; i <= n; i++) set(Math.round(x0! + ((x1! - x0!) * i) / n), Math.round(y0! + ((y1! - y0!) * i) / n), hexToRgb(s.color));
      }
      continue;
    }
    const m = maskOf(s, size);
    const ramp = (s.ramp ?? [s.color!, s.color!, s.color!]).map(hexToRgb);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!m[y]![x]) continue;
      let c = ramp[1]!;
      if (!s.flat) {
        const lit = !m[y - 1]?.[x - 1] || !m[y - 1]?.[x];
        const shade = !m[y + 1]?.[x + 1] || !m[y + 2]?.[x + 2] || !m[y]?.[x + 2];
        if (shade) c = ramp[0]!;
        else if (lit) c = ramp[2]!;
      }
      set(x, y, c);
    }
  }
  // Outline: transparent pixels next to the figure.
  const o = hexToRgb(outline);
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && img.data[(y * size + x) * 4 + 3]! > 0;
  const edge: [number, number][] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (opaque(x, y)) continue;
    if (opaque(x + 1, y) || opaque(x - 1, y) || opaque(x, y + 1) || opaque(x, y - 1)) edge.push([x, y]);
  }
  for (const [x, y] of edge) set(x, y, o);
  return img;
}
