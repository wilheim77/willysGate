// Composes hand-drawn ASCII characters into animation frames.
//   node scripts/art/build-hand-sprites.ts <game> <preset>
// Reads content/<game>/art/<preset>/hand-sprites.json: per sprite, a legend, named ASCII
// parts (body, legs...) and animations as lists of frames, each frame a stack of
// [part, dx, dy]. Writes public/assets/<preset>/<output> and 'frames' sprite entries
// (replacing any recolour with the same id), plus docs/art-previews/<preset>-hand.png.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, writePng } from './png.ts';
import { hexToRgb } from './color.ts';
import { drawText } from './font.ts';

type Layer = [string, number, number];
interface HandSprite {
  note?: string;
  size: [number, number];
  scale?: number;
  legend: Record<string, string>;
  parts: Record<string, string[]>;
  animations: Record<string, Layer[][]>;
}
interface Spec {
  output: string;
  facing: 'left' | 'right';
  sprites: Record<string, HandSprite>;
}

const [game = 'intereses', preset = '0x72'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'hand-sprites.json'), 'utf8')) as Spec;

function paint(img: Image, rows: string[], legend: Record<string, string>, dx: number, dy: number, what: string): void {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === ' ') return;
    const hex = legend[ch];
    if (!hex) throw new Error(`${what}: no colour for "${ch}"`);
    const px = x + dx, py = y + dy;
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return;
    const i = (py * img.width + px) * 4;
    const [r, g, b] = hexToRgb(hex);
    [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [r, g, b, 255];
  }));
}

const frames: { id: string; anim: string; img: Image }[] = [];
for (const [id, s] of Object.entries(spec.sprites)) {
  for (const [anim, list] of Object.entries(s.animations)) {
    for (const layers of list) {
      const img = blank(s.size[0], s.size[1]);
      for (const [part, dx, dy] of layers) {
        const rows = s.parts[part];
        if (!rows) throw new Error(`${id}: unknown part "${part}"`);
        paint(img, rows, s.legend, dx, dy, `${id}.${part}`);
      }
      frames.push({ id, anim, img });
    }
  }
}

// Sheet: one row per sprite.
const ids = Object.keys(spec.sprites);
const width = Math.max(...ids.map((id) => frames.filter((f) => f.id === id).reduce((w, f) => w + f.img.width, 0)));
const height = ids.reduce((h, id) => h + spec.sprites[id]!.size[1], 0);
const sheet = blank(width, height);
const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const url = `assets/${preset}/${spec.output}`;
let y = 0;
for (const id of ids) {
  const s = spec.sprites[id]!;
  let x = 0;
  const animations: Record<string, { x: number; y: number; w: number; h: number }[]> = {};
  for (const f of frames.filter((fr) => fr.id === id)) {
    blit(sheet, f.img, x, y);
    (animations[f.anim] ??= []).push({ x, y, w: f.img.width, h: f.img.height });
    x += f.img.width;
  }
  manifest.sprites[id] = { kind: 'frames', url, facing: spec.facing, animations, ...(s.scale && s.scale !== 1 ? { scale: s.scale } : {}) };
  console.log(`${id} (hand): ${Object.entries(animations).map(([a, l]) => `${a}(${l.length})`).join(', ')}`);
  y += s.size[1];
}
const outDir = join(gameDir, 'public', 'assets', preset);
mkdirSync(outDir, { recursive: true });
writePng(join(outDir, spec.output), sheet);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Preview: every frame at 6x over a floor-coloured strip.
const K = 6;
const preview = blank(width * K + 16, height * K + ids.length * 12 + 8);
for (let i = 0; i < preview.data.length; i += 4) [preview.data[i], preview.data[i + 1], preview.data[i + 2], preview.data[i + 3]] = [0x48, 0x3b, 0x3a, 255];
let py = 4;
for (const id of ids) {
  const h = spec.sprites[id]!.size[1];
  drawText(preview, id, 8, py, [230, 220, 200], 2);
  py += 12;
  const strip = crop(sheet, 0, ids.slice(0, ids.indexOf(id)).reduce((a, o) => a + spec.sprites[o]!.size[1], 0), width, h);
  for (let yy = 0; yy < h * K; yy++) for (let xx = 0; xx < width * K; xx++) {
    const s = (Math.floor(yy / K) * width + Math.floor(xx / K)) * 4;
    if (!strip.data[s + 3]) continue;
    const d = ((py + yy) * preview.width + 8 + xx) * 4;
    strip.data.copy(preview.data, d, s, s + 4);
  }
  py += h * K;
}
mkdirSync(join(root, 'docs', 'art-previews'), { recursive: true });
writePng(join(root, 'docs', 'art-previews', `${preset}-hand.png`), preview);
