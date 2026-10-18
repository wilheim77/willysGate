// Corpse props derived from each creature type's own idle frame, so they keep the pack's style:
// humanoids lie on their side (rotated a quarter turn), animals roll onto their backs (flipped),
// skeletons tumble into a heap; each lies in its pool (blood, dark ichor or bone dust).
//   node scripts/art/build-corpses.ts [game=intereses] [preset=0x72]
// Reads content/<game>/art/<preset>/corpses.json:
//   types: { <corpseId>: { from: <spriteId>, pose: 'side'|'back'|'heap', pool: 'blood'|'ichor'|'dust' } }
//   rules: [ [<regex on spriteId>, <corpseId>] ... ], default: <corpseId>
// Writes public/assets/<preset>/corpses.png, manifest props <corpseId> (anchor floor) and
// manifest.corpses = { [spriteId]: corpseId } for every creature sprite (one with a 'move' animation).
// Run after build-extra-art (which rewrites props) and after the sprite builders.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';
import { type Rgb, hexToRgb, mix } from './color.ts';

type Pose = 'side' | 'back' | 'heap';
interface Spec {
  types: Record<string, { from: string; pose: Pose; pool: 'blood' | 'ichor' | 'dust' }>;
  rules: [string, string][];
  default: string;
}
const [game = 'intereses', preset = '0x72'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'corpses.json'), 'utf8')) as Spec;
const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const pxAt = (img: Image, x: number, y: number) => { const i = (y * img.width + x) * 4; return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!] as const; };
function put(img: Image, x: number, y: number, c: Rgb, a = 255): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [c[0], c[1], c[2], a];
}
function trim(img: Image): Image {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (pxAt(img, x, y)[3]) (x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y));
  return crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}
/** Quarter turn counter-clockwise: the head ends up on the left. */
function rotate(img: Image): Image {
  const out = blank(img.height, img.width);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b, a] = pxAt(img, x, y);
    if (a) put(out, y, img.width - 1 - x, [r, g, b], a);
  }
  return out;
}
function flipV(img: Image): Image {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b, a] = pxAt(img, x, y);
    if (a) put(out, x, img.height - 1 - y, [r, g, b], a);
  }
  return out;
}
/** Dead things are a little greyer and darker. */
function pall(img: Image): void {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b, a] = pxAt(img, x, y);
    if (!a) continue;
    const grey = (r + g + b) / 3;
    put(img, x, y, mix(mix([r, g, b], [grey, grey, grey], 0.3), [20, 16, 18], 0.15), a);
  }
}

const POOLS = { blood: ['#3a0e15', '#5c1a22', '#7e2629'], ichor: ['#141a12', '#24301e', '#3a4a2a'], dust: ['#5a524c', '#857c74', '#aaa298'] } as const;

function corpse(id: string): Image {
  const t = spec.types[id]!;
  const s = manifest.sprites[t.from];
  if (!s) throw new Error(`corpses.json: ${id} comes from unknown sprite "${t.from}"`);
  const r = s.animations.idle[0];
  let body = trim(crop(readPng(join(gameDir, 'public', s.url)), r.x, r.y, r.w, r.h));
  if (t.pose === 'side') body = rotate(body);
  if (t.pose === 'back') body = flipV(body);
  if (t.pose === 'heap') {
    // Collapse into a heap: rotate, then squash every other row out.
    const rot = rotate(body);
    const heap = blank(rot.width, Math.ceil(rot.height * 0.7));
    for (let y = 0; y < heap.height; y++) for (let x = 0; x < rot.width; x++) {
      const [rr, g, b, a] = pxAt(rot, x, Math.min(rot.height - 1, Math.round(y / 0.7)));
      if (a) put(heap, x, y, [rr, g, b], a);
    }
    body = heap;
  }
  pall(body);
  const W = Math.max(16, body.width + 4), H = body.height + 4;
  const img = blank(W, H);
  // Pool: an uneven ellipse under the body, darkest at the rim.
  const pool = POOLS[t.pool].map(hexToRgb);
  const cx = (W - 1) / 2, cy = H - 4, rx = W / 2 - 0.5, ry = 3.2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + Math.sin(x * 1.7) * 0.06;
    if (d > 1) continue;
    if (t.pool === 'dust' && (x + y) % 2) continue;
    put(img, x, y, d > 0.8 ? pool[0]! : d > 0.4 ? pool[1]! : pool[2]!, t.pool === 'dust' ? 200 : 235);
  }
  blit(img, body, Math.round((W - body.width) / 2), H - 2 - body.height);
  return img;
}

const ids = Object.keys(spec.types);
const imgs = ids.map(corpse);
const width = imgs.reduce((w, i) => w + i.width, 0), height = Math.max(...imgs.map((i) => i.height));
const sheet = blank(width, height);
const url = `assets/${preset}/corpses.png`;
let x = 0;
manifest.props = manifest.props ?? {};
ids.forEach((id, i) => {
  blit(sheet, imgs[i]!, x, height - imgs[i]!.height);
  manifest.props[id] = { url, frames: [{ x, y: height - imgs[i]!.height, w: imgs[i]!.width, h: imgs[i]!.height }], fps: 0, loop: false, anchor: 'floor' };
  x += imgs[i]!.width;
});
writePng(join(gameDir, 'public', url), sheet);

// Which corpse each creature leaves: first matching rule, else the default. Objects (no 'move') leave none.
const rules = spec.rules.map(([re, id]) => [new RegExp(re), id] as const);
manifest.corpses = { default: spec.default };
for (const [sid, s] of Object.entries(manifest.sprites as Record<string, { animations: Record<string, unknown> }>)) {
  if (!s.animations.move) continue;
  manifest.corpses[sid] = rules.find(([re]) => re.test(sid))?.[1] ?? spec.default;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Preview at 4x on floor-coloured ground.
const K = 4;
const prev = blank(sheet.width * K + 16, sheet.height * K + 16);
for (let i = 0; i < prev.data.length; i += 4) [prev.data[i], prev.data[i + 1], prev.data[i + 2], prev.data[i + 3]] = [72, 59, 58, 255];
const big = blank(sheet.width * K, sheet.height * K);
for (let yy = 0; yy < big.height; yy++) for (let xx = 0; xx < big.width; xx++) {
  const s = (Math.floor(yy / K) * sheet.width + Math.floor(xx / K)) * 4;
  sheet.data.copy(big.data, (yy * big.width + xx) * 4, s, s + 4);
}
for (let yy = 0; yy < big.height; yy++) for (let xx = 0; xx < big.width; xx++) {
  const [r, g, b, a] = pxAt(big, xx, yy);
  if (a) put(prev, xx + 8, yy + 8, mix([72, 59, 58], [r, g, b], a / 255));
}
writePng(join(root, 'docs', 'art-previews', `${preset}-corpses.png`), prev);
console.log(`${preset} corpses: ${ids.length} props, ${Object.keys(manifest.corpses).length - 1} creatures mapped -> ${url}`);
