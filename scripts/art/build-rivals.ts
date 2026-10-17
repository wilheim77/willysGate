// Builds Willy's modular rival dungeoneers (base body per race x palette, accessories by
// slot, and the composed legendaries) from content/<game>/art/<preset>/rivals.json.
//   node scripts/art/build-rivals.ts [game=willy] [preset=ninja]
// Writes public/assets/<preset>/<output>, and in the manifest:
//   sprites['rival-cuerpo-<race>'] (first palette) and ['rival-cuerpo-<race>--<palette>'],
//   sprites[<legendary id>],
//   rivals: { bodies: { <race>: { sprite, palettes: { <palette>: spriteId }, anchors: { <anim>: [ { cabeza, cara, mano } per frame ] } } },
//             accessories: { <slot>: { <id>: { url, x, y, w, h, pivot } } } }
// Accessories are drawn by the client with their pivot on the anchor (flip both when facing left).
// Also docs/art-previews/<game>-rivals.png.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, writePng } from './png.ts';
import { hexToRgb } from './color.ts';
import { drawText } from './font.ts';

type Layer = [string, number, number];
interface Race {
  sprite: string;
  size: [number, number];
  parts: Record<string, string[]>;
  animations: Record<string, Layer[][]>;
  anchors: Record<'cabeza' | 'cara' | 'mano', [number, number]>;
  palettes: Record<string, Record<string, string>>;
}
interface Accessory { rows: string[]; legend: Record<string, string>; pivot: [number, number] }
interface Legendary {
  race: string;
  palette: string;
  cabeza?: string;
  cara?: string;
  mano?: string;
  note?: string;
  extra?: { rows: string[]; legend: Record<string, string>; x: number; y: number }[];
}
interface Spec {
  output: string;
  races: Record<string, Race>;
  accessories: Record<string, Record<string, Accessory>>;
  legendaries: Record<string, Legendary>;
}

const [game = 'willy', preset = 'ninja'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'rivals.json'), 'utf8')) as Spec;
const SLOTS = ['cabeza', 'cara', 'mano'] as const;

/** '#rrggbb' or '#rrggbbaa' (translucent ghosts). */
function colour(hex: string): [number, number, number, number] {
  const [r, g, b] = hexToRgb(hex.slice(0, 7));
  return [r, g, b, hex.length === 9 ? parseInt(hex.slice(7), 16) : 255];
}
function paint(img: Image, rows: string[], legend: Record<string, string>, dx: number, dy: number, what: string): void {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === ' ') return;
    const hex = legend[ch];
    if (!hex) throw new Error(`${what}: no colour for "${ch}"`);
    const px = x + dx, py = y + dy;
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return;
    const i = (py * img.width + px) * 4;
    [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = colour(hex);
  }));
}
const OUTLINE = { k: '#1e1c24' };

function bodyFrames(race: Race, palette: Record<string, string>): Record<string, Image[]> {
  const legend = { ...OUTLINE, ...palette };
  return Object.fromEntries(Object.entries(race.animations).map(([anim, frames]) => [anim, frames.map((layers) => {
    const img = blank(race.size[0], race.size[1]);
    for (const [part, dx, dy] of layers) paint(img, race.parts[part]!, legend, dx, dy, `${race.sprite}.${part}`);
    return img;
  })]));
}

/** Anchor positions per frame: the race anchors moved with the 'body' layer of that frame. */
function anchorsOf(race: Race): Record<string, Record<string, [number, number]>[]> {
  return Object.fromEntries(Object.entries(race.animations).map(([anim, frames]) => [anim, frames.map((layers) => {
    const body = layers.find((l) => l[0] === 'body') ?? [ 'body', 0, 0 ];
    return Object.fromEntries(SLOTS.map((s) => [s, [race.anchors[s][0] + body[1], race.anchors[s][1] + body[2]] as [number, number]]));
  })]));
}

function accessoryImage(a: Accessory): Image {
  const w = Math.max(...a.rows.map((r) => r.length));
  const img = blank(w, a.rows.length);
  paint(img, a.rows, a.legend, 0, 0, 'accessory');
  return img;
}

// --- Compose everything ---------------------------------------------------------------------
const rows: { id: string; anims: Record<string, Image[]> }[] = [];
const bodies: Record<string, { sprite: string; palettes: Record<string, string>; anchors: ReturnType<typeof anchorsOf> }> = {};
for (const [raceId, race] of Object.entries(spec.races)) {
  const palettes: Record<string, string> = {};
  Object.entries(race.palettes).forEach(([pal, legend], i) => {
    const id = `${race.sprite}--${pal}`;
    const anims = bodyFrames(race, legend);
    rows.push({ id, anims });
    if (i === 0) rows.push({ id: race.sprite, anims });
    palettes[pal] = id;
  });
  bodies[raceId] = { sprite: race.sprite, palettes, anchors: anchorsOf(race) };
}
const accImages: Record<string, Record<string, Image>> = Object.fromEntries(
  Object.entries(spec.accessories).map(([slot, list]) => [slot, Object.fromEntries(Object.entries(list).map(([id, a]) => [id, accessoryImage(a)]))]),
);
for (const [id, leg] of Object.entries(spec.legendaries)) {
  const race = spec.races[leg.race]!;
  const base = bodyFrames(race, race.palettes[leg.palette]!);
  const anchors = anchorsOf(race);
  const anims = Object.fromEntries(Object.entries(base).map(([anim, frames]) => [anim, frames.map((img, f) => {
    const out = blank(img.width, img.height);
    img.data.copy(out.data);
    const body = race.animations[anim]![f]!.find((l) => l[0] === 'body') ?? ['body', 0, 0];
    for (const e of leg.extra ?? []) paint(out, e.rows, { ...OUTLINE, ...e.legend }, e.x + body[1], e.y + body[2], id);
    for (const slot of SLOTS) {
      const accId = leg[slot];
      if (!accId) continue;
      const a = spec.accessories[slot]![accId]!;
      const [ax, ay] = anchors[anim]![f]![slot]!;
      blit(out, accImages[slot]![accId]!, ax - a.pivot[0], ay - a.pivot[1]);
    }
    return out;
  })]));
  rows.push({ id, anims });
}

// Sheet: one row per sprite, then one row of accessories.
const accList = Object.entries(accImages).flatMap(([slot, list]) => Object.entries(list).map(([id, img]) => ({ slot, id, img })));
const width = Math.max(...rows.map((r) => Object.values(r.anims).flat().reduce((w, f) => w + f.width, 0)), accList.reduce((w, a) => w + a.img.width + 1, 0));
const height = rows.reduce((h, r) => h + Math.max(...Object.values(r.anims).flat().map((f) => f.height)), 0) + Math.max(...accList.map((a) => a.img.height));
const sheet = blank(width, height);
const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const url = `assets/${preset}/${spec.output}`;
let y = 0;
for (const r of rows) {
  let x = 0;
  const animations: Record<string, { x: number; y: number; w: number; h: number }[]> = {};
  for (const [anim, frames] of Object.entries(r.anims)) {
    animations[anim] = frames.map((img) => {
      blit(sheet, img, x, y);
      const rect = { x, y, w: img.width, h: img.height };
      x += img.width;
      return rect;
    });
  }
  manifest.sprites[r.id] = { kind: 'frames', url, facing: 'right', animations };
  y += Math.max(...Object.values(r.anims).flat().map((f) => f.height));
}
const accessories: Record<string, Record<string, unknown>> = {};
let ax = 0;
for (const a of accList) {
  blit(sheet, a.img, ax, y);
  (accessories[a.slot] ??= {})[a.id] = { url, x: ax, y, w: a.img.width, h: a.img.height, pivot: spec.accessories[a.slot]![a.id]!.pivot };
  ax += a.img.width + 1;
}
manifest.rivals = { bodies, accessories };
const outDir = join(gameDir, 'public', 'assets', preset);
mkdirSync(outDir, { recursive: true });
writePng(join(outDir, spec.output), sheet);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${game} rivals: ${Object.keys(bodies).length} races, ${rows.length} sprites, ${accList.length} accessories -> ${url}`);

// --- Preview: palettes per race, legendaries, and random combinations --------------------------
const K = 4;
const cell = 26;
const prevRows: { label: string; imgs: Image[] }[] = [];
for (const [raceId, race] of Object.entries(spec.races)) {
  prevRows.push({ label: raceId, imgs: Object.values(race.palettes).map((p) => bodyFrames(race, p).idle![0]!) });
}
prevRows.push({ label: 'legendarios', imgs: Object.keys(spec.legendaries).map((id) => rows.find((r) => r.id === id)!.anims.idle![0]!) });
// Deterministic sample of random combinations.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const combos: Image[] = [];
for (let n = 0; n < 10; n++) {
  const raceId = pick(Object.keys(spec.races));
  const race = spec.races[raceId]!;
  const img = bodyFrames(race, pick(Object.values(race.palettes))).idle![0]!;
  const anchors = anchorsOf(race).idle![0]!;
  for (const slot of SLOTS) {
    if (rand() < 0.25) continue;
    const accId = pick(Object.keys(spec.accessories[slot]!));
    const a = spec.accessories[slot]![accId]!;
    blit(img, accImages[slot]![accId]!, anchors[slot]![0] - a.pivot[0], anchors[slot]![1] - a.pivot[1]);
  }
  combos.push(img);
}
prevRows.push({ label: 'combinaciones al azar', imgs: combos });
const cols = Math.max(...prevRows.map((r) => r.imgs.length));
const pw = cols * cell * K + 16, ph = prevRows.reduce((h, r) => h + Math.max(...r.imgs.map((i) => i.height)) * K + 18, 8);
const preview = blank(pw, ph);
for (let i = 0; i < preview.data.length; i += 4) [preview.data[i], preview.data[i + 1], preview.data[i + 2], preview.data[i + 3]] = [0x5a, 0x6a, 0x88, 255];
let py = 4;
for (const r of prevRows) {
  drawText(preview, r.label, 8, py, [250, 245, 230], 2);
  py += 14;
  const h = Math.max(...r.imgs.map((i) => i.height));
  r.imgs.forEach((img, i) => {
    for (let yy = 0; yy < img.height * K; yy++) for (let xx = 0; xx < img.width * K; xx++) {
      const s = (Math.floor(yy / K) * img.width + Math.floor(xx / K)) * 4;
      if (!img.data[s + 3]) continue;
      const d = ((py + (h - img.height) * K + yy) * pw + 8 + i * cell * K + xx) * 4;
      const a = img.data[s + 3]! / 255;
      for (let c = 0; c < 3; c++) preview.data[d + c] = Math.round(img.data[s + c]! * a + preview.data[d + c]! * (1 - a));
    }
  });
  py += h * K + 4;
}
mkdirSync(join(root, 'docs', 'art-previews'), { recursive: true });
writePng(join(root, 'docs', 'art-previews', `${game}-rivals.png`), preview);
void crop;
