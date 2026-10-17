// Builds HUD portraits (pixel-art busts) from each character's first idle frame.
//   node scripts/art/build-portraits.ts <game> <preset>
// Reads content/<game>/art/<preset>/portraits.json and the preset manifest, writes
// public/assets/<preset>/portraits.png and the manifest's 'portraits' entries
// ({ [spriteId]: { url, x, y, w, h } }), plus docs/art-previews/<preset>-portraits.png.
// The bust is the top of the sprite scaled by an integer factor, centred on the head,
// over a framed backdrop whose tint tells party from foes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';
import { type Rgb, hexToRgb, mix } from './color.ts';
import { drawText } from './font.ts';
import { type Shape, paintBust } from './portrait-painter.ts';

interface PortraitSpec {
  size: number;
  /** Backdrop colours by tone: [dark, light]. */
  tones: Record<string, [string, string]>;
  /** Tone used when a sprite is not listed. */
  defaultTone: string;
  /** Sprites to leave out (objects, placeholders). */
  skip: string[];
  /** Per-sprite overrides: backdrop tone, integer scale, extra rows of headroom, horizontal nudge. */
  sprites: Record<string, { tone?: string; scale?: number; headroom?: number; dx?: number; label?: string }>;
  /** Hand-designed busts that replace the generated ones (bigger, with real faces). */
  hand?: { size: number; busts: Record<string, { tone: string; shapes: Shape[]; also?: string[] }> };
}

const [game = 'intereses', preset = '0x72'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'portraits.json'), 'utf8')) as PortraitSpec;
const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const S = spec.size;

const images = new Map<string, Image>();
const load = (url: string) => {
  if (!images.has(url)) images.set(url, readPng(join(gameDir, 'public', url)));
  return images.get(url)!;
};

function put(img: Image, x: number, y: number, c: Rgb): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [c[0], c[1], c[2], 255];
}

/** Opaque bounding box of an image. */
function bbox(img: Image): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!img.data[(y * img.width + x) * 4 + 3]) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

function scaleUp(img: Image, k: number): Image {
  const out = blank(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const s = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
    img.data.copy(out.data, (y * out.width + x) * 4, s, s + 4);
  }
  return out;
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

function backdrop(tone: [string, string], S = spec.size): Image {
  const img = blank(S, S);
  const dark = hexToRgb(tone[0]), light = hexToRgb(tone[1]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // Soft light behind the head (upper centre), dithered in 3 steps.
    const d = Math.hypot((x - S / 2) / (S * 0.55), (y - S * 0.38) / (S * 0.55));
    const t = Math.max(0, 1 - d) * 3;
    const step = Math.floor(t) + ((t % 1) > (BAYER[y & 3]![x & 3]! + 0.5) / 16 ? 1 : 0);
    put(img, x, y, mix(dark, light, Math.min(3, step) / 3));
  }
  return img;
}

function frame(img: Image, S = img.width): void {
  const out = hexToRgb('#111111'), hi = hexToRgb('#8a8088'), lo = hexToRgb('#3a3438');
  for (let i = 0; i < S; i++) {
    put(img, i, 0, out); put(img, i, S - 1, out); put(img, 0, i, out); put(img, S - 1, i, out);
    if (i > 0 && i < S - 1) {
      put(img, i, 1, hi); put(img, 1, i, hi); put(img, i, S - 2, lo); put(img, S - 2, i, lo);
    }
  }
}

const ids = Object.entries(manifest.sprites as Record<string, { kind: string; url: string; animations: Record<string, { x: number; y: number; w: number; h: number }[]> }>)
  .filter(([id, s]) => s.kind === 'frames' && !spec.skip.includes(id));
// Aliases share art: render each distinct frame once.
const seen = new Map<string, number>();
const cells: Image[] = [];
const entries: Record<string, { url: string; x: number; y: number; w: number; h: number }> = {};
const url = `assets/${preset}/portraits.png`;
const cols = 8;

for (const [id, s] of ids) {
  const r = s.animations.idle![0]!;
  const key = `${s.url}:${r.x},${r.y}:${JSON.stringify(spec.sprites[id] ?? {})}`;
  if (!seen.has(key)) {
    const o = spec.sprites[id] ?? {};
    const src = crop(load(s.url), r.x, r.y, r.w, r.h);
    const b = bbox(src);
    const k = o.scale ?? (b.x1 - b.x0 + 1 > 20 ? 1 : 2);
    const inner = S - 4;
    // Head and shoulders: the top of the sprite, as many rows as fit after scaling.
    const rows = Math.ceil(inner / k);
    const headroom = o.headroom ?? 1;
    const top = Math.max(0, b.y0 - headroom);
    const cx = Math.round((b.x0 + b.x1 + 1) / 2) + (o.dx ?? 0);
    const cw = Math.ceil(inner / k);
    const part = crop(paddedX(src, cw), cx - Math.floor(cw / 2) + cw, top, cw, Math.min(rows, src.height - top));
    const bust = scaleUp(part, k);
    const cell = backdrop(spec.tones[o.tone ?? spec.defaultTone]!);
    blit(cell, bust, 2 + Math.floor((inner - bust.width) / 2), 2);
    frame(cell);
    seen.set(key, cells.length);
    cells.push(cell);
  }
  const i = seen.get(key)!;
  entries[id] = { url, x: (i % cols) * S, y: Math.floor(i / cols) * S, w: S, h: S };
}

/** Pads an image horizontally by its own width on each side, so crops can go past the edges. */
function paddedX(img: Image, pad: number): Image {
  const out = blank(img.width + 2 * pad, img.height);
  blit(out, img, pad, 0);
  return out;
}

const sheet = blank(cols * S, Math.ceil(cells.length / cols) * S);
cells.forEach((c, i) => blit(sheet, c, (i % cols) * S, Math.floor(i / cols) * S));
const outDir = join(gameDir, 'public', 'assets', preset);
mkdirSync(outDir, { recursive: true });
writePng(join(outDir, 'portraits.png'), sheet);
// Hand-painted busts: their own sheet, same entry shape.
const hand = spec.hand;
const handIds: string[] = [];
if (hand) {
  const H = hand.size;
  const busts = Object.entries(hand.busts);
  const handSheet = blank(busts.length * H, H);
  const handUrl = `assets/${preset}/portraits-hand.png`;
  busts.forEach(([id, b], i) => {
    const cell = backdrop(spec.tones[b.tone]!, H);
    blit(cell, paintBust(b.shapes, H), 0, 0);
    frame(cell);
    blit(handSheet, cell, i * H, 0);
    for (const target of [id, ...(b.also ?? [])]) entries[target] = { url: handUrl, x: i * H, y: 0, w: H, h: H };
    handIds.push(id);
  });
  writePng(join(gameDir, 'public', 'assets', preset, 'portraits-hand.png'), handSheet);
  const big = blank(busts.length * (H * 3 + 12) + 12, H * 3 + 30);
  for (let i = 0; i < big.data.length; i += 4) [big.data[i], big.data[i + 1], big.data[i + 2], big.data[i + 3]] = [20, 18, 22, 255];
  busts.forEach(([id], i) => {
    blit(big, scaleUp(crop(handSheet, i * H, 0, H, H), 3), 12 + i * (H * 3 + 12), 8);
    drawText(big, id, 12 + i * (H * 3 + 12), H * 3 + 14, [200, 196, 186], 2);
  });
  writePng(join(root, 'docs', 'art-previews', `${preset}-portraits-hand.png`), big);
}
manifest.portraits = entries;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Preview: every portrait at 3x with its id.
const firstId = new Map<number, string>();
for (const [id, e] of Object.entries(entries)) {
  if (e.url !== url) continue;
  const i = (e.y / S) * cols + e.x / S;
  if (!firstId.has(i) || spec.sprites[id]) firstId.set(i, id);
}
const named = [...firstId.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => [id, entries[id]!] as const);
const pcols = 5, cellW = S * 3 + 12, cellH = S * 3 + 22;
const preview = blank(pcols * cellW, Math.ceil(named.length / pcols) * cellH);
for (let i = 0; i < preview.data.length; i += 4) [preview.data[i], preview.data[i + 1], preview.data[i + 2], preview.data[i + 3]] = [20, 18, 22, 255];
named.forEach(([id, e], i) => {
  const x = (i % pcols) * cellW + 6, y = Math.floor(i / pcols) * cellH + 4;
  blit(preview, scaleUp(crop(sheet, e.x, e.y, S, S), 3), x, y);
  drawText(preview, (spec.sprites[id]?.label ?? id).slice(0, 24), x, y + S * 3 + 6, [200, 196, 186]);
});
const previewDir = join(root, 'docs', 'art-previews');
mkdirSync(previewDir, { recursive: true });
writePng(join(previewDir, `${preset}-portraits.png`), preview);
console.log(`${preset} portraits: ${cells.length} busts, ${handIds.length} hand-painted (${handIds.join(', ')}), for ${Object.keys(entries).length} sprite ids`);
