// Renders preview sheets of a preset's art into docs/art-previews/ (for review on GitHub).
//   node scripts/art/build-previews.ts <game> <preset>
// Sheets: characters (every 'frames' sprite: idle + move), terrain (top variants
// and a raised block with its face), props (animated props and FX from props.json).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';
import { drawText } from './font.ts';
import type { Rgb } from './color.ts';

const [game = 'intereses', preset = '0x72'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const manifest = JSON.parse(readFileSync(join(gameDir, 'assets', `${preset}.json`), 'utf8'));
const outDir = join(root, 'docs', 'art-previews');
mkdirSync(outDir, { recursive: true });

const BG: Rgb = [28, 26, 30];
const LABEL: Rgb = [200, 196, 186];
const images = new Map<string, Image>();
const load = (url: string): Image => {
  if (!images.has(url)) images.set(url, readPng(join(gameDir, 'public', url)));
  return images.get(url)!;
};

export function fill(img: Image, rgb: Rgb): void {
  for (let i = 0; i < img.data.length; i += 4) [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [...rgb, 255];
}

export function upscale(img: Image, k: number): Image {
  const out = blank(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
      img.data.copy(out.data, (y * out.width + x) * 4, s, s + 4);
    }
  }
  return out;
}

const terrainSheet = load(manifest.tilesets.terrain.url);
const T = manifest.tile.size as number;
const tile = (frame: number) => crop(terrainSheet, frame * T, 0, T, T);
const floorFrames: number[] = manifest.terrain.stone?.frames ?? [0];

/** Labels are drawn at 1x on the upscaled sheet, so they stay small and crisp. */
function save(name: string, img: Image, k: number, labels: { text: string; x: number; y: number }[]): void {
  const big = upscale(img, k);
  for (const l of labels) drawText(big, l.text, l.x * k, l.y * k, LABEL, 2);
  writePng(join(outDir, `${preset}-${name}.png`), big);
  console.log(`docs/art-previews/${preset}-${name}.png (${big.width}x${big.height})`);
}

// --- Characters ---------------------------------------------------------------
{
  const sprites = Object.entries(manifest.sprites).filter(([, s]: [string, any]) => s.kind === 'frames') as [string, any][];
  const cols = 4;
  const cellW = 96, cellH = 56;
  const sheet = blank(cols * cellW, Math.ceil(sprites.length / cols) * cellH);
  fill(sheet, BG);
  const labels: { text: string; x: number; y: number }[] = [];
  sprites.forEach(([id, s], i) => {
    const ox = (i % cols) * cellW, oy = Math.floor(i / cols) * cellH;
    // A strip of floor so colours are judged on the real background.
    for (let tx = 0; tx < 5; tx++) for (let ty = 0; ty < 2; ty++) blit(sheet, tile(floorFrames[(tx + ty) % floorFrames.length]!), ox + 4 + tx * T, oy + 18 + ty * T);
    const frames = [s.animations.idle[0], ...(s.animations.move ?? []).slice(0, 3), ...(s.animations.hit ?? []), ...(s.animations.broken ?? [])].slice(0, 5);
    let x = ox + 4;
    for (const r of frames) {
      const img = crop(load(s.url), r.x, r.y, r.w, r.h);
      blit(sheet, img, x + Math.floor((T - r.w) / 2), oy + 46 - r.h);
      x += Math.max(T, r.w);
    }
    labels.push({ text: id, x: ox + 4, y: oy + 2 });
  });
  save('characters', sheet, 3, labels);
}

// --- Terrain -------------------------------------------------------------------
{
  const entries = Object.entries(manifest.terrain) as [string, { frames: number[]; face: number }][];
  const cellW = 8 * T, cellH = 3 * T + 12;
  const sheet = blank(cellW, entries.length * cellH);
  fill(sheet, BG);
  const labels: { text: string; x: number; y: number }[] = [];
  const LH = manifest.tile.levelHeight as number;
  entries.forEach(([id, t], i) => {
    const oy = i * cellH;
    labels.push({ text: `${id} (${t.frames.length} variantes)`, x: 2, y: oy + 1 });
    t.frames.slice(0, 4).forEach((f, j) => blit(sheet, tile(f), 2 + j * (T + 1), oy + 8));
    // A 3x1 block raised 2 levels next to ground of the same terrain, like the renderer draws it.
    const bx = 4 * T + 4, by = oy + 8;
    for (let j = 0; j < 3; j++) {
      blit(sheet, tile(t.frames[j % t.frames.length]!), bx + j * T, by);
      const face = tile(t.face);
      for (let fy = 0; fy < 2 * LH; fy++) blit(sheet, crop(face, 0, fy % T, T, 1), bx + j * T, by + T + fy);
    }
  });
  save('terrain', sheet, 3, labels);
}

// --- Props, FX and surfaces (optional) -------------------------------------------------
type Anim = { url: string; frames: { x: number; y: number; w: number; h: number }[]; anchor?: string };
/** One row per entry: every frame over a background matching how the client places it. */
function animSheet(name: string, entries: [string, Anim][], background: (a: Anim) => 'wall' | 'floor' | 'floor3'): void {
  if (entries.length === 0) return;
  const cell = 36, rowH = 50;
  const sheet = blank(8 * cell + 8, entries.length * rowH);
  fill(sheet, BG);
  const labels: { text: string; x: number; y: number }[] = [];
  entries.forEach(([id, a], i) => {
    const oy = i * rowH;
    labels.push({ text: `${id} (${a.frames.length})`, x: 2, y: oy + 1 });
    a.frames.slice(0, 8).forEach((r, j) => {
      const ox = 4 + j * cell, by = oy + 10;
      const bg = background(a);
      if (bg === 'wall' && manifest.terrain.wall) for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) blit(sheet, tile(manifest.terrain.wall.face), ox + tx * T, by + ty * T);
      else for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) blit(sheet, tile(floorFrames[(tx + ty) % floorFrames.length]!), ox + tx * T, by + ty * T);
      const img = crop(load(a.url), r.x, r.y, r.w, r.h);
      if (bg === 'floor3') {
        // Surfaces: 2x2 copies to show how they tile.
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) blit(sheet, img, ox + tx * T, by + ty * T);
      } else {
        blit(sheet, img, ox + Math.floor((2 * T - r.w) / 2), by + 2 * T - r.h);
      }
    });
  });
  save(name, sheet, 3, labels);
}
animSheet('props', Object.entries(manifest.props ?? {}) as [string, Anim][], (a) => (a.anchor === 'wall' ? 'wall' : 'floor'));
animSheet('surfaces', Object.entries(manifest.surfaces ?? {}) as [string, Anim][], () => 'floor3');

if (!existsSync(outDir)) throw new Error('no output');
