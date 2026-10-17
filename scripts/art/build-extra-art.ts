// Draws the 16 px art that no pack provides, in 0x72's palette, pixel by pixel:
// wooden planks and scaffolds for the mine, a solid wall top, platform rims,
// cliff faces recoloured from Ninja Adventure, an animated wall torch and brazier,
// small combat FX (blood decals, hit spark, dust puff), and the tactical environment
// from environment-art.ts: surface overlays, barrels/crate and explosion/steam.
//   node scripts/art/build-extra-art.ts <game> <preset>
// Output:
//   art-src/generated/<game>-<preset>-extra.png + .txt ("name x y w h" list), used by
//     tiles.json cells such as { "atlas": "generated/intereses-0x72-extra.png", "sprite": "planks_1" };
//   content/<game>/public/assets/<preset>/extra.png and the manifest's 'props' (animated
//     props and FX), 'surfaces' (overlays) and object 'sprites' (barrel, barrel_oil, crate).
// Everything is deterministic (seeded RNG), so re-running gives identical files.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';
import { type Rgb } from './color.ts';
import { type Rect, readSpriteList } from './sprite-list.ts';
import { FLAMES, FLAME_LEGEND, type Key, T, ascii, get, rect, rgb, rng, set } from './pixel.ts';
import * as env from './environment-art.ts';

const [game = 'intereses', preset = '0x72'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
// --- Tiles -------------------------------------------------------------------

/** Horizontal mine planks: three boards with staggered joints, nails and coal grime. */
function planks(seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  const boards: [number, number][] = [[0, 4], [5, 5], [11, 4]]; // [first row, height]; gaps at 4, 10, 15
  rect(img, 0, 0, T, T, rgb('w0'));
  for (const [y0, h] of boards) {
    const tone = r() < 0.3 ? -1 : 0; // some boards are older and darker
    const shades: Key[] = tone < 0 ? ['w1', 'w2', 'w3'] : ['w2', 'w3', 'w4'];
    for (let y = y0; y < y0 + h; y++) {
      for (let x = 0; x < T; x++) {
        let k: Key = shades[1]!;
        if (y === y0) k = shades[2]!; // lit upper edge
        if (y === y0 + h - 1) k = shades[0]!; // shadowed lower edge
        set(img, x, y, rgb(k));
      }
    }
    // Wood grain: short darker streaks along the board.
    for (let n = 0; n < 3; n++) {
      const gy = y0 + 1 + Math.floor(r() * Math.max(1, h - 2));
      const gx = Math.floor(r() * T);
      const len = 2 + Math.floor(r() * 4);
      for (let x = gx; x < gx + len; x++) set(img, x % T, gy, rgb(shades[0]!));
    }
    // A butt joint with two nails, placed differently on each board.
    const jx = 2 + Math.floor(r() * 12);
    for (let y = y0; y < y0 + h; y++) set(img, jx, y, rgb('w0'));
    set(img, jx - 1, y0 + 1, rgb('s2'));
    set(img, jx + 1, y0 + h - 2, rgb('s2'));
  }
  // Coal dust and scuffs.
  for (let n = 0; n < 5; n++) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb(r() < 0.5 ? 'w1' : 'w0'));
  return img;
}

/** Scaffold deck: slats running north-south with gaps over the dark drop, on a cross beam. */
function scaffold(seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('void'));
  // Cross beam visible through the gaps.
  rect(img, 0, 6, T, 3, rgb('w1'));
  rect(img, 0, 6, T, 1, rgb('w2'));
  const slats = [0, 4, 8, 12];
  for (const sx of slats) {
    const short = r() < 0.25 ? 1 + Math.floor(r() * 2) : 0; // a few slats are broken short
    for (let y = 0; y < T - short; y++) {
      set(img, sx, y, rgb('w4'));
      set(img, sx + 1, y, rgb('w3'));
      set(img, sx + 2, y, rgb('w2'));
    }
    set(img, sx + 1, 7, rgb('s2')); // nail into the beam
    const gy = Math.floor(r() * 12);
    set(img, sx + 1, gy, rgb('w2'));
    set(img, sx + 1, gy + 1, rgb('w2'));
  }
  return img;
}

/** Face under a raised scaffold: posts and an X brace over darkness, lit beam on top. */
function scaffoldFace(): Image {
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('ink'));
  // Diagonal braces.
  for (let i = 0; i < T; i++) {
    set(img, i, i, rgb('w2'));
    set(img, i, i + 1, rgb('w1'));
    set(img, T - 1 - i, i, rgb('w2'));
    set(img, T - 1 - i, i + 1, rgb('w1'));
  }
  // Posts.
  for (const px of [1, 12]) {
    rect(img, px, 0, 3, T, rgb('w2'));
    rect(img, px, 0, 1, T, rgb('w3'));
    rect(img, px + 2, 0, 1, T, rgb('w1'));
  }
  // Top beam (the platform's lip).
  rect(img, 0, 0, T, 2, rgb('w3'));
  rect(img, 0, 0, T, 1, rgb('w4'));
  rect(img, 0, 2, T, 1, rgb('w0'));
  return img;
}

/** Face under raised planks: a timber retaining wall of horizontal beams and posts. */
function planksFace(): Image {
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('w1'));
  for (let y = 0; y < T; y += 4) {
    rect(img, 0, y, T, 1, rgb('w3'));
    rect(img, 0, y + 3, T, 1, rgb('w0'));
  }
  for (const px of [0, 8]) {
    rect(img, px, 0, 2, T, rgb('w2'));
    set(img, px, 1, rgb('s2'));
    set(img, px, 9, rgb('s2'));
    rect(img, px + 2, 0, 1, T, rgb('w0'));
  }
  rect(img, 0, 0, T, 1, rgb('w4'));
  return img;
}

/** Solid top for walls: dark capstones with the 0x72 lit edge on the south side. */
function wallTop(atlas: Image, list: Record<string, Rect>, seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('cap'));
  // Irregular capstone seams.
  const rows = [0, 4, 8];
  for (const y of rows) {
    rect(img, 0, y, T, 1, rgb('out'));
    let x = Math.floor(r() * 5);
    while (x < T) {
      for (let yy = y; yy < y + 4; yy++) set(img, x, yy, rgb('out'));
      set(img, x + 1, y + 1, rgb('s0')); // chipped corner catches a little light
      x += 4 + Math.floor(r() * 5);
    }
  }
  for (let n = 0; n < 6; n++) set(img, Math.floor(r() * T), Math.floor(r() * 12), rgb(r() < 0.5 ? 's0' : 'ink'));
  // Bottom four rows: the original lit brick edge of wall_top_mid.
  const src = list.wall_top_mid!;
  blit(img, crop(atlas, src.x, src.y + 12, T, 4), 0, 12);
  return img;
}

/** A face texture with a lit lip on its first rows (the platform edge seen from the front). */
function withLip(face: Image, lip: [Key, Key, Key]): Image {
  const img = blank(T, T);
  blit(img, face, 0, 0);
  for (let x = 0; x < T; x++) {
    set(img, x, 0, rgb(lip[2]));
    set(img, x, 1, rgb(lip[1]));
    set(img, x, 2, rgb(lip[0]));
  }
  // Notches so the lip reads as cut stone, not a stripe.
  for (const x of [5, 11]) {
    set(img, x, 1, rgb(lip[0]));
    set(img, x, 0, rgb(lip[1]));
  }
  return img;
}

/** Remaps colours by luminance onto a ramp (dark -> light): keeps the pack's hand-drawn texture. */
function rampRecolour(src: Image, ramp: Key[]): Image {
  const lum = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const colours = new Map<string, Rgb>();
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3]) colours.set(`${src.data[i]},${src.data[i + 1]},${src.data[i + 2]}`, [src.data[i]!, src.data[i + 1]!, src.data[i + 2]!]);
  }
  const sorted = [...colours.values()].sort((a, b) => lum(a) - lum(b));
  const out = blank(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = get(src, x, y);
      if (!c) continue;
      const idx = sorted.findIndex((s) => s[0] === c[0] && s[1] === c[1] && s[2] === c[2]);
      const t = sorted.length === 1 ? 0 : idx / (sorted.length - 1);
      set(out, x, y, rgb(ramp[Math.round(t * (ramp.length - 1))]!));
    }
  }
  return out;
}

/** Thin rim strips (top 3 rows of a cell) for a renderer that draws edges separately. */
function rim(lip: [Key, Key, Key]): Image {
  const img = blank(T, T);
  for (let x = 0; x < T; x++) {
    set(img, x, 0, rgb(lip[2]));
    set(img, x, 1, rgb(lip[1]));
    set(img, x, 2, rgb(lip[0]));
    set(img, x, 3, rgb('out'));
  }
  return img;
}

// --- Props ---------------------------------------------------------------------

/** Wall torch: iron cup and bracket, wooden haft, 4-frame flame. Hangs on a wall face. */
function torch(frame: number): Image {
  const img = blank(T, T);
  ascii(img, 4, 1, FLAMES[frame]!, FLAME_LEGEND);
  ascii(img, 0, 8, [
    '.....#iIi#......',
    '......#wW#......',
    '.....#IiiI#.....',
    '......#wW#......',
    '.....#dIId#.....',
    '.....#dddd#.....',
    '......####......',
  ], { '#': 'out', i: 'i1', I: 'i2', d: 'i0', w: 'w3', W: 'w1' });
  return img;
}

/** Standing iron brazier with glowing coals and a 4-frame flame. */
function brazier(frame: number): Image {
  const img = blank(T, T);
  ascii(img, 4, 0, FLAMES[frame]!, FLAME_LEGEND);
  ascii(img, 3, 1, FLAMES[(frame + 2) % 4]!.slice(3), FLAME_LEGEND); // a second tongue behind
  const coals = ['..#rorYoroyro#..', '..#oryoYoryor#..', '..#rYroyoroyr#..', '..#royroYoryo#..'][frame]!;
  ascii(img, 0, 7, [
    coals,
    '.#Iiiiiiiiiiii#.',
    '..#kkkkkkkkkk#..',
    '...#kkkkkkkk#...',
    '....##kkkk##....',
    '.....#k##k#.....',
    '....#k#..#k#....',
    '...#k#....#k#...',
    '...##......##...',
  ], { ...FLAME_LEGEND, '#': 'out', i: 'i1', I: 'i2', k: 'i0' });
  return img;
}

/** Blood decal for the floor: a blob of overlapping drops plus spatter. */
function bloodSplat(seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  const mask = Array.from({ length: T }, () => Array<number>(T).fill(0));
  const disc = (cx: number, cy: number, rad: number) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) mask[y]![x] = 1;
  };
  disc(7.5, 8, 2.5 + r() * 1.2);
  for (let n = 0; n < 3; n++) disc(7.5 + (r() - 0.5) * 6, 8 + (r() - 0.5) * 5, 1 + r() * 1.8);
  for (let n = 0; n < 6; n++) {
    const a = r() * Math.PI * 2, d = 4.5 + r() * 2.5;
    const x = Math.round(7.5 + Math.cos(a) * d), y = Math.round(8 + Math.sin(a) * d * 0.8);
    if (x >= 0 && y >= 0 && x < T && y < T) mask[y]![x] = 2;
  }
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const m = mask[y]![x];
      if (!m) continue;
      if (m === 2) {
        set(img, x, y, rgb('b1'));
        continue;
      }
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !mask[y + dy!]?.[x + dx!]);
      const lit = !mask[y - 1]?.[x] || !mask[y]?.[x - 1];
      set(img, x, y, rgb(edge ? (lit ? 'b2' : 'b0') : 'b1'));
    }
  }
  // Wet highlight.
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      if (mask[y]![x] === 1 && mask[y - 1]?.[x] === 1 && mask[y]![x - 1] === 1 && mask[y - 2]?.[x] !== 1) {
        set(img, x, y, rgb('b3'));
        return img;
      }
    }
  }
  return img;
}

/** Hit spark: a white-hot star that throws rays and burns out (4 frames). */
function hitSpark(frame: number): Image {
  const img = blank(T, T);
  const c = 7;
  const ray = (len: number, from: number, k: Key, diag: boolean) => {
    for (let d = from; d <= len; d++) {
      for (const [dx, dy] of diag ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(img, c + dx! * d, c + dy! * d, rgb(k));
    }
  };
  if (frame === 0) {
    ray(1, 0, 'f5', false);
    set(img, c, c, rgb('f5'));
  } else if (frame === 1) {
    ray(4, 2, 'f4', false);
    ray(2, 1, 'f5', false);
    ray(2, 1, 'f3', true);
    set(img, c, c, rgb('f5'));
  } else if (frame === 2) {
    ray(6, 4, 'f3', false);
    ray(3, 2, 'f4', true);
    set(img, c, c, rgb('f4'));
  } else {
    for (const [dx, dy] of [[6, 1], [-5, 3], [2, -6], [-3, -5], [5, -4], [-6, -1], [1, 6]]) set(img, c + dx!, c + dy!, rgb('f2'));
  }
  return img;
}

/** Dust puff: three soft balls of dust that swell and thin out (5 frames). */
function dustPuff(frame: number): Image {
  const img = blank(T, T);
  const grow = [1.5, 2.5, 3.3, 4, 4.5][frame]!;
  const balls = [[7.5, 10, 1], [4.5, 11, 0.75], [10.5, 11, 0.8]] as const;
  const rise = frame * 0.8;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      let inside = false, top = false;
      for (const [bx, by, s] of balls) {
        const rad = grow * s;
        const dy = y - (by - rise);
        if ((x - bx) ** 2 + dy ** 2 <= rad * rad) {
          inside = true;
          if (dy < -rad * 0.35) top = true;
        }
      }
      if (!inside) continue;
      // Thin out with a growing ordered dither.
      const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y % 4]![x % 4]!;
      if (bayer < [0, 0, 3, 7, 11][frame]!) continue;
      set(img, x, y, rgb(top ? 'd3' : frame > 2 ? 'd1' : 'd2'));
    }
  }
  return img;
}

// --- Build -----------------------------------------------------------------------

const atlas = readPng(join(root, 'art-src', '0x72-dungeontileset-ii', '0x72_DungeonTilesetII_v1.7.png'));
const list = readSpriteList(join(root, 'art-src', '0x72-dungeontileset-ii', 'tile_list_v1.7'));
const ninjaRelief = readPng(join(root, 'art-src', 'ninja-adventure', 'TilesetRelief.png'));
const wallMid = crop(atlas, list.wall_mid!.x, list.wall_mid!.y, T, T);
const crate0x72 = crop(atlas, list.crate!.x, list.crate!.y, list.crate!.w, list.crate!.h);

const tiles: [string, Image][] = [
  ['planks_1', planks(11)],
  ['planks_2', planks(27)],
  ['planks_3', planks(43)],
  ['planks_face', planksFace()],
  ['scaffold_1', scaffold(5)],
  ['scaffold_2', scaffold(9)],
  ['scaffold_face', scaffoldFace()],
  ['wall_top_1', wallTop(atlas, list, 3)],
  ['wall_top_2', wallTop(atlas, list, 8)],
  ['stone_face_lip', withLip(wallMid, ['s1', 's2', 's3'])],
  ['dirt_face', withLip(rampRecolour(crop(ninjaRelief, 5 * T, 6 * T, T, T), ['ink', 'out', 's0', 'd0', 'd1']), ['d0', 'd2', 'd3'])],
  ['slag_face', withLip(rampRecolour(crop(ninjaRelief, 5 * T, 1 * T, T, T), ['void', 'ink', 'cap', 'i0', 's0']), ['i0', 's0', 's1'])],
  ['rim_stone', rim(['s1', 's2', 's3'])],
  ['rim_dirt', rim(['d0', 'd2', 'd3'])],
  ['rim_wood', rim(['w2', 'w3', 'w4'])],
];
type Anchor = 'wall' | 'floor' | 'centre';
const props: Record<string, { frames: Image[]; note: string; anchor: Anchor; fps: number; loop: boolean; light?: string }> = {
  torch_wall: { frames: [0, 1, 2, 3].map(torch), note: 'Antorcha de pared', anchor: 'wall', fps: 8, loop: true, light: '#ffb060' },
  brazier: { frames: [0, 1, 2, 3].map(brazier), note: 'Brasero de hierro', anchor: 'floor', fps: 8, loop: true, light: '#ff9a4a' },
  blood_1: { frames: [bloodSplat(1)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  blood_2: { frames: [bloodSplat(7)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  blood_3: { frames: [bloodSplat(13)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  fx_hit_spark: { frames: [0, 1, 2, 3].map(hitSpark), note: 'Chispa de impacto', anchor: 'centre', fps: 20, loop: false },
  fx_dust: { frames: [0, 1, 2, 3, 4].map(dustPuff), note: 'Polvareda (pasos, caídas)', anchor: 'floor', fps: 12, loop: false },
  fx_explosion: { frames: env.explosion(), note: 'Explosión (32x32, centrada)', anchor: 'centre', fps: 14, loop: false, light: '#ffb060' },
  fx_steam: { frames: env.steam(), note: 'Vapor (agua y fuego)', anchor: 'floor', fps: 10, loop: false },
};
/** Surface overlays (manifest 'surfaces'): drawn over the floor tile, may be translucent. */
const surfaces: Record<string, { frames: Image[]; fps: number; loop: boolean }> = {
  oil: { frames: env.oil(), fps: 0, loop: false },
  grease: { frames: env.grease(), fps: 0, loop: false },
  fire: { frames: env.fire(), fps: 8, loop: true },
  water: { frames: env.water(), fps: 5, loop: true },
  ice: { frames: env.ice(), fps: 0, loop: false },
  electrified: { frames: env.electrified(), fps: 12, loop: true },
  blood: { frames: env.bloodPool(), fps: 0, loop: false },
  rubble: { frames: env.rubble(), fps: 0, loop: false },
};
/** Objects (manifest 'sprites', kind 'frames'): idle + broken. */
const objects: Record<string, { idle: Image; broken: Image }> = {
  barrel: { idle: env.barrel(), broken: env.barrelBroken() },
  barrel_oil: { idle: env.barrelOil(), broken: env.barrelOilBroken() },
  crate: { idle: crate0x72, broken: env.crateBroken() },
};

// Sheet: one row per group of frames; each row as tall as its tallest frame.
type Row = { name: string; frames: Image[] };
const rows: Row[] = [
  ...tiles.map(([name, img]) => ({ name, frames: [img] })),
  ...Object.entries(props).map(([name, p]) => ({ name, frames: p.frames })),
  ...Object.entries(surfaces).map(([name, s]) => ({ name: `surface_${name}`, frames: s.frames })),
  ...Object.entries(objects).map(([name, o]) => ({ name: `object_${name}`, frames: [o.idle, o.broken] })),
];
// Tiles share the first row so build-tiles can keep reading them by name.
const tileRow = rows.splice(0, tiles.length);
const layout = new Map<string, Rect[]>();
const width = Math.max(tileRow.length * T, ...rows.map((r) => r.frames.reduce((w, f) => w + f.width, 0)));
const height = T + rows.reduce((h, r) => h + Math.max(...r.frames.map((f) => f.height)), 0);
const sheet = blank(width, height);
const names: string[] = [];
tileRow.forEach((r, i) => {
  blit(sheet, r.frames[0]!, i * T, 0);
  names.push(`${r.name} ${i * T} 0 ${T} ${T}`);
});
let y = T;
for (const r of rows) {
  let x = 0;
  layout.set(r.name, r.frames.map((img, f) => {
    blit(sheet, img, x, y);
    names.push(`${r.name}_f${f} ${x} ${y} ${img.width} ${img.height}`);
    const rect = { x, y, w: img.width, h: img.height };
    x += img.width;
    return rect;
  }));
  y += Math.max(...r.frames.map((f) => f.height));
}

const genDir = join(root, 'art-src', 'generated');
mkdirSync(genDir, { recursive: true });
const base = `${game}-${preset}-extra`;
writePng(join(genDir, `${base}.png`), sheet);
writeFileSync(join(genDir, `${base}.txt`), names.join('\n') + '\n');
const outDir = join(gameDir, 'public', 'assets', preset);
mkdirSync(outDir, { recursive: true });
copyFileSync(join(genDir, `${base}.png`), join(outDir, 'extra.png'));

const url = `assets/${preset}/extra.png`;
const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.props = Object.fromEntries(Object.entries(props).map(([id, p]) => [
  id,
  { url, frames: layout.get(id)!, fps: p.fps, loop: p.loop, anchor: p.anchor, ...(p.light ? { light: p.light } : {}) },
]));
manifest.surfaces = Object.fromEntries(Object.entries(surfaces).map(([id, s]) => [id, { url, frames: layout.get(`surface_${id}`)!, fps: s.fps, loop: s.loop }]));
for (const id of Object.keys(objects)) {
  const [idle, broken] = layout.get(`object_${id}`)!;
  manifest.sprites[id] = { kind: 'frames', url, facing: 'right', animations: { idle: [idle], broken: [broken] } };
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${preset} extra art: ${tiles.length} tiles, ${Object.keys(props).length} props, ${Object.keys(surfaces).length} surfaces, ${Object.keys(objects).length} objects -> art-src/generated/${base}.png`);
