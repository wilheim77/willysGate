// Derives action animations from each character's own idle frame, so they keep the pack's style:
//   attack: wind-up, lunge with a weapon smear (slash / thrust / blunt), follow-through, recover;
//   cast:   gather a glow in the front hand, rim light in the spell colour, release;
//   hurt:   white flash, then a red-tinted flinch.
//   node scripts/art/build-action-anims.ts <game> <preset>
// Reads content/<game>/art/<preset>/actions.json and the preset manifest (after the sprite
// builders), writes public/assets/<preset>/<output> with every frame of the listed sprites
// (their existing animations copied unchanged) and points those manifest sprites, and any
// alias sharing their art, at it. New frames are padded symmetrically so the feet pivot holds.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';
import { type Rgb, hexToRgb, mix } from './color.ts';
import { drawText } from './font.ts';

interface ActionSpec {
  output: string;
  sprites: Record<string, { attack: 'slash' | 'thrust' | 'blunt'; cast?: string }>;
}
type Rect = { x: number; y: number; w: number; h: number };
interface SpriteArt { kind: string; url: string; facing: string; animations: Record<string, Rect[]>; scale?: number }

const [game = 'intereses', preset = '0x72'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'actions.json'), 'utf8')) as ActionSpec;
const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sprites = manifest.sprites as Record<string, SpriteArt>;
const DERIVED = new Set(['attack', 'cast', 'hurt']);

const sheets = new Map<string, Image>();
const sheet = (url: string) => {
  if (!sheets.has(url)) sheets.set(url, readPng(join(gameDir, 'public', url)));
  return sheets.get(url)!;
};

function px(img: Image, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}
function put(img: Image, x: number, y: number, c: Rgb, a = 255): void {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [c[0], c[1], c[2], a];
}
function bbox(img: Image) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (px(img, x, y)[3]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

/** The base frame on a padded canvas, shifted by dx, with the upper body leaning by `lean`. */
function pose(base: Image, pad: number, dx: number, lean: number): Image {
  const out = blank(base.width + 2 * pad, base.height);
  const b = bbox(base);
  const chest = b.y0 + (b.y1 - b.y0) * 0.45;
  for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
    const [r, g, bl, a] = px(base, x, y);
    if (!a) continue;
    put(out, x + pad + dx + (y < chest ? lean : 0), y, [r, g, bl], a);
  }
  return out;
}

/** Mixes every opaque pixel towards a colour (flash, tint); `edge` limits it to the front rim. */
function tint(img: Image, c: Rgb, k: number, edge = false): void {
  const copy = blank(img.width, img.height);
  img.data.copy(copy.data);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b, a] = px(copy, x, y);
    if (!a) continue;
    if (edge && (x + 1 < img.width && px(copy, x + 1, y)[3] && px(copy, x, Math.max(0, y - 1))[3])) continue;
    put(img, x, y, mix([r, g, b], c, k), a);
  }
}

const BRIGHT = hexToRgb('#fdf7ed'), MID = hexToRgb('#c9d1d6'), DARK = hexToRgb('#878b91');

/** Weapon smear in front of the body. `fade` dithers it out for the follow-through. */
function smear(img: Image, kind: string, fx: number, fy: number, k: number, fade: boolean): void {
  const keep = (x: number, y: number) => !fade || (x + y) % 2 === 0;
  if (kind === 'thrust') {
    for (const [dy, len, c] of [[0, 7, BRIGHT], [-2, 4, MID], [2, 4, MID]] as const) {
      for (let i = 0; i < len * k; i++) if (keep(fx + i, fy + dy * k)) put(img, fx + i, fy + dy * k, i < 2 ? c : i < len * k - 2 ? MID : DARK);
    }
    return;
  }
  const r = (kind === 'blunt' ? 7 : 6) * k;
  const [a0, a1] = kind === 'blunt' ? [-1.9, 0.5] : [-1.3, 1.1];
  const cx = fx - 2 * k, cy = fy;
  for (let s = 0; s <= 24; s++) {
    const t = s / 24, a = a0 + (a1 - a0) * t;
    for (let w = 0; w < (kind === 'blunt' ? 3 : 2) * k; w++) {
      const rr = r - w;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (keep(Math.round(x), Math.round(y))) put(img, x, y, t > 0.7 ? BRIGHT : t > 0.35 ? MID : DARK);
    }
  }
  if (kind === 'blunt' && fade) for (const [ox, oy] of [[0, 0], [2, -1], [-2, -1], [3, 0]]) put(img, fx + ox! * k, img.height - 1 + oy!, DARK);
}

function glow(img: Image, cx: number, cy: number, r: number, c: Rgb): void {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r + 0.5) continue;
    put(img, x, y, d < r * 0.45 ? BRIGHT : d < r * 0.8 ? mix(c, BRIGHT, 0.35) : c);
  }
}

function derive(base: Image, kind: string, castHex: string | undefined): Record<string, Image[]> {
  const k = Math.max(1, Math.round(base.width / 16));
  const pad = 4 * k;
  const b = bbox(base);
  const front = (dx: number) => b.x1 + pad + dx + 1;
  const midY = b.y0 + Math.round((b.y1 - b.y0) * 0.42);
  const handY = b.y0 + Math.round((b.y1 - b.y0) * 0.55);

  const attack = [pose(base, pad, -k, -1), pose(base, pad, 2 * k, 1), pose(base, pad, k, 1), pose(base, pad, 0, 0)];
  smear(attack[1]!, kind, front(2 * k), midY, k, false);
  smear(attack[2]!, kind, front(k), midY + (kind === 'blunt' ? 2 * k : 0), k, true);

  const cc = hexToRgb(castHex ?? '#fff4c8');
  const cast = [pose(base, pad, 0, 0), pose(base, pad, 0, -1), pose(base, pad, 0, -1), pose(base, pad, k, 1)];
  glow(cast[0]!, front(0), handY, 0.6 * k, cc);
  glow(cast[1]!, front(0) + k, handY - 2 * k, 1.5 * k, cc);
  tint(cast[2]!, cc, 0.45, true);
  glow(cast[2]!, front(0) + k, handY - 3 * k, 2.5 * k, cc);
  for (const [ox, oy] of [[3, -4], [-1, -6], [4, 1], [-2, 2]]) put(cast[2]!, front(0) + k + ox! * k, handY - 3 * k + oy! * k, cc);
  for (const [ox, oy] of [[3, -3], [5, -1], [6, -4], [2, -6]]) put(cast[3]!, front(k) + ox! * k, handY + oy! * k, cc);

  const hurt = [pose(base, pad, -k, 0), pose(base, pad, -k, -1)];
  tint(hurt[0]!, hexToRgb('#ffffff'), 0.75);
  tint(hurt[1]!, hexToRgb('#c03030'), 0.35);
  return { attack, cast, hurt };
}

// --- Build ---------------------------------------------------------------------------------
type Row = { id: string; anims: Record<string, Image[]> };
const rows: Row[] = [];
const sourceKeys = new Map<string, string>(); // url+idle rect of the original art -> sprite id
for (const [id, opts] of Object.entries(spec.sprites)) {
  const s = sprites[id];
  if (!s) throw new Error(`actions.json: unknown sprite "${id}"`);
  const img = sheet(s.url);
  const anims: Record<string, Image[]> = {};
  for (const [name, rects] of Object.entries(s.animations)) {
    if (DERIVED.has(name)) continue;
    anims[name] = rects.map((r) => crop(img, r.x, r.y, r.w, r.h));
  }
  Object.assign(anims, derive(anims.idle![0]!, opts.attack, opts.cast));
  const r0 = s.animations.idle![0]!;
  sourceKeys.set(`${s.url}:${r0.x},${r0.y}`, id);
  rows.push({ id, anims });
}

const width = Math.max(...rows.map((r) => Object.values(r.anims).flat().reduce((w, f) => w + f.width, 0)));
const height = rows.reduce((h, r) => h + Math.max(...Object.values(r.anims).flat().map((f) => f.height)), 0);
const out = blank(width, height);
const url = `assets/${preset}/${spec.output}`;
const placed = new Map<string, Record<string, Rect[]>>();
let y = 0;
for (const r of rows) {
  let x = 0;
  const rects: Record<string, Rect[]> = {};
  for (const [name, frames] of Object.entries(r.anims)) {
    rects[name] = frames.map((f) => {
      blit(out, f, x, y);
      const rect = { x, y, w: f.width, h: f.height };
      x += f.width;
      return rect;
    });
  }
  placed.set(r.id, rects);
  y += Math.max(...Object.values(r.anims).flat().map((f) => f.height));
}
mkdirSync(join(gameDir, 'public', 'assets', preset), { recursive: true });
writePng(join(gameDir, 'public', url), out);

// Repoint the sprites, and aliases that shared their art.
let aliases = 0;
for (const [id, s] of Object.entries(sprites)) {
  const r0 = s.animations.idle?.[0];
  if (!r0) continue;
  const src = spec.sprites[id] ? id : sourceKeys.get(`${s.url}:${r0.x},${r0.y}`);
  if (!src) continue;
  if (src !== id) aliases++;
  s.url = url;
  s.animations = placed.get(src)!;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Preview: each sprite's idle frame, then attack, cast and hurt, at 3x.
const K = 3, labelW = 130;
const rowH = (r: Row) => Math.max(...Object.values(r.anims).flat().map((f) => f.height)) * K + 8;
const prevW = labelW + Math.max(...rows.map((r) => ['idle', 'attack', 'cast', 'hurt'].reduce((w, a) => w + (a === 'idle' ? 1 : r.anims[a]!.length) * (r.anims[a]![0]!.width * K + 4) + 10, 0)));
const prev = blank(prevW, rows.reduce((h, r) => h + rowH(r), 8));
for (let i = 0; i < prev.data.length; i += 4) [prev.data[i], prev.data[i + 1], prev.data[i + 2], prev.data[i + 3]] = [30, 26, 32, 255];
let py = 4;
for (const r of rows) {
  drawText(prev, r.id, 4, py + 4, [220, 210, 190]);
  let px0 = labelW;
  for (const a of ['idle', 'attack', 'cast', 'hurt']) {
    const frames = a === 'idle' ? r.anims.idle!.slice(0, 1) : r.anims[a]!;
    for (const f of frames) {
      const big = blank(f.width * K, f.height * K);
      for (let yy = 0; yy < big.height; yy++) for (let xx = 0; xx < big.width; xx++) {
        const s = (Math.floor(yy / K) * f.width + Math.floor(xx / K)) * 4;
        f.data.copy(big.data, (yy * big.width + xx) * 4, s, s + 4);
      }
      for (let yy = 0; yy < big.height; yy++) for (let xx = 0; xx < big.width; xx++) {
        const i = ((py + yy) * prev.width + px0 + xx) * 4, j = (yy * big.width + xx) * 4;
        const al = big.data[j + 3]! / 255;
        const bg: Rgb = [44, 38, 42];
        const c = al ? mix(bg, [big.data[j]!, big.data[j + 1]!, big.data[j + 2]!], al) : bg;
        [prev.data[i], prev.data[i + 1], prev.data[i + 2]] = c;
      }
      px0 += f.width * K + 4;
    }
    px0 += 10;
  }
  py += rowH(r);
}
writePng(join(root, 'docs', 'art-previews', `${preset}-actions.png`), prev);
console.log(`${preset} actions: ${rows.length} sprites (+${aliases} aliases) with attack/cast/hurt -> ${url}`);
