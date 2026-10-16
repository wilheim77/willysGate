// Minimal RGBA image helpers on top of pngjs, shared by the art build scripts.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export interface Image {
  width: number;
  height: number;
  data: Buffer; // RGBA
}

export function readPng(path: string): Image {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: png.data };
}

export function writePng(path: string, img: Image): void {
  const png = new PNG({ width: img.width, height: img.height });
  img.data.copy(png.data);
  writeFileSync(path, PNG.sync.write(png));
}

export function blank(width: number, height: number): Image {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

export function crop(src: Image, x: number, y: number, w: number, h: number): Image {
  const out = blank(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * src.width + x) * 4;
    src.data.copy(out.data, row * w * 4, from, from + w * 4);
  }
  return out;
}

/** Alpha-composites `src` over `dst` at (dx, dy). */
export function blit(dst: Image, src: Image, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const s = (y * src.width + x) * 4;
      const sa = src.data[s + 3]! / 255;
      if (sa === 0) continue;
      const d = (ty * dst.width + tx) * 4;
      const da = dst.data[d + 3]! / 255;
      const outA = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        dst.data[d + c] = Math.round((src.data[s + c]! * sa + dst.data[d + c]! * da * (1 - sa)) / outA);
      }
      dst.data[d + 3] = Math.round(outA * 255);
    }
  }
}

export function isOpaque(img: Image): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 255) return false;
  return true;
}
