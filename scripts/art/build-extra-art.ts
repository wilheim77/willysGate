// Draws the 16 px art that no pack provides, in 0x72's palette, pixel by pixel:
// wooden planks and scaffolds for the mine, a solid wall top, platform rims,
// cliff faces recoloured from Ninja Adventure, an animated wall torch and brazier,
// and small combat FX (blood decals, hit spark, dust puff).
//   node scripts/art/build-extra-art.ts <game> <preset>
// Output:
//   art-src/generated/<game>-<preset>-extra.png + .txt ("name x y w h" list), used by
//     tiles.json cells such as { "atlas": "generated/intereses-0x72-extra.png", "sprite": "planks_1" };
//   content/<game>/public/assets/<preset>/extra.png and the manifest's 'props' entries
//     (animated props and FX, as frame rects).
// Everything is deterministic (seeded RNG), so re-running gives identical files.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';
import { type Rgb, hexToRgb } from './color.ts';

const [game = 'intereses', preset = '0x72'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const T = 16;

// --- Palette (0x72 DungeonTileset II colours, plus a few muted wood/iron steps) ---
const C = {
  out: '#222222', void: '#111111', ink: '#1a1416',
  s0: '#483b3a', s1: '#775c55', s2: '#aa8d7a', s3: '#d3bfa9', cap: '#2e2627',
  w0: '#2c1d1b', w1: '#4a2e27', w2: '#64402f', w3: '#7d5536', w4: '#966b42',
  i0: '#333333', i1: '#55565c', i2: '#878b91',
  f0: '#62232f', f1: '#8f4029', f2: '#c56025', f3: '#ee8e2e', f4: '#facb3e', f5: '#fdf7ed',
  b0: '#3a0e15', b1: '#5c1a22', b2: '#7e2629', b3: '#a03a30',
  d0: '#5e4a42', d1: '#775c55', d2: '#9a8070', d3: '#bba48e',
};
type Key = keyof typeof C;
const rgb = (k: Key | string): Rgb => hexToRgb(k in C ? C[k as Key] : k);

/** Deterministic RNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function set(img: Image, x: number, y: number, c: Rgb | null): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  if (!c) {
    img.data[i + 3] = 0;
    return;
  }
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [c[0], c[1], c[2], 255];
}
function get(img: Image, x: number, y: number): Rgb | null {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
  const i = (y * img.width + x) * 4;
  return img.data[i + 3] ? [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!] : null;
}
function rect(img: Image, x: number, y: number, w: number, h: number, c: Rgb): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(img, xx, yy, c);
}
/** Paints an ASCII drawing; each char looks up `legend` ('.' or ' ' = leave as is). */
function ascii(img: Image, x0: number, y0: number, rows: string[], legend: Record<string, Key | null>): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const k = legend[ch];
      if (k === undefined) throw new Error(`no colour for "${ch}"`);
      set(img, x0 + x, y0 + y, k === null ? null : rgb(k));
    });
  });
}

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
function wallTop(atlas: Image, list: Record<string, { x: number; y: number }>, seed: number): Image {
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

const FLAME_LEGEND: Record<string, Key> = { r: 'f1', o: 'f2', y: 'f3', Y: 'f4', w: 'f5', d: 'f0' };
const FLAMES: string[][] = [
  ['...d...', '..ro...', '..royr.', '.royYo.', '.roYYyr', '.ryYwyr', '..yYYy.', '..oyyo.'],
  ['....d..', '...or..', '..royr.', '.ryYyo.', 'royYYyr', '.ryYwyr', '..yYYy.', '..oyyo.'],
  ['..d....', '..or...', '.royr..', '.royYo.', '.ryYYor', 'ryYwYyr', '.yYYYy.', '..oyyo.'],
  ['.......', '...d...', '..ror..', '..oyYr.', '.ryYYo.', '.ryYwyr', '..yYYy.', '..oyyo.'],
];

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
const list: Record<string, { x: number; y: number }> = {};
for (const line of readFileSync(join(root, 'art-src', '0x72-dungeontileset-ii', 'tile_list_v1.7'), 'utf8').split('\n')) {
  const [name, x, y] = line.trim().split(/\s+/);
  if (name && y !== undefined) list[name] = { x: Number(x), y: Number(y) };
}
const ninjaRelief = readPng(join(root, 'art-src', 'ninja-adventure', 'TilesetRelief.png'));
const wallMid = crop(atlas, list.wall_mid!.x, list.wall_mid!.y, T, T);

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
const props: Record<string, { frames: Image[]; note: string; anchor: 'wall' | 'floor' | 'centre'; fps: number; loop: boolean; light?: string }> = {
  torch_wall: { frames: [0, 1, 2, 3].map(torch), note: 'Antorcha de pared', anchor: 'wall', fps: 8, loop: true, light: '#ffb060' },
  brazier: { frames: [0, 1, 2, 3].map(brazier), note: 'Brasero de hierro', anchor: 'floor', fps: 8, loop: true, light: '#ff9a4a' },
  blood_1: { frames: [bloodSplat(1)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  blood_2: { frames: [bloodSplat(7)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  blood_3: { frames: [bloodSplat(13)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  fx_hit_spark: { frames: [0, 1, 2, 3].map(hitSpark), note: 'Chispa de impacto', anchor: 'centre', fps: 20, loop: false },
  fx_dust: { frames: [0, 1, 2, 3, 4].map(dustPuff), note: 'Polvareda (pasos, caídas)', anchor: 'floor', fps: 12, loop: false },
};

// Sheet: row 0 = tiles, then one row per prop.
const cols = Math.max(tiles.length, ...Object.values(props).map((p) => p.frames.length));
const rows = 1 + Object.keys(props).length;
const sheet = blank(cols * T, rows * T);
const names: string[] = [];
tiles.forEach(([name, img], i) => {
  blit(sheet, img, i * T, 0);
  names.push(`${name} ${i * T} 0 ${T} ${T}`);
});
const manifestProps: Record<string, unknown> = {};
Object.entries(props).forEach(([id, p], r) => {
  const y = (r + 1) * T;
  const frames = p.frames.map((img, f) => {
    blit(sheet, img, f * T, y);
    names.push(`${id}_f${f} ${f * T} ${y} ${T} ${T}`);
    return { x: f * T, y, w: T, h: T };
  });
  manifestProps[id] = { url: `assets/${preset}/extra.png`, frames, fps: p.fps, loop: p.loop, anchor: p.anchor, ...(p.light ? { light: p.light } : {}) };
});

const genDir = join(root, 'art-src', 'generated');
mkdirSync(genDir, { recursive: true });
const base = `${game}-${preset}-extra`;
writePng(join(genDir, `${base}.png`), sheet);
writeFileSync(join(genDir, `${base}.txt`), names.join('\n') + '\n');
const outDir = join(gameDir, 'public', 'assets', preset);
mkdirSync(outDir, { recursive: true });
copyFileSync(join(genDir, `${base}.png`), join(outDir, 'extra.png'));

const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.props = manifestProps;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${preset} extra art: ${tiles.length} tiles, ${Object.keys(props).length} props -> art-src/generated/${base}.png`);

