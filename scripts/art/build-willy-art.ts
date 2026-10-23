// Draws Willy el mazmorrero's environment art in its own bright palette: Castro Sumergido
// (floor 1) and the Camerino tiles, Camerino furniture, rarity card frames, and (P2, from
// willy-show-art.ts) stage props, surfaces, objects, effects and HUD icons.
//   node scripts/art/build-willy-art.ts [game=willy] [preset=ninja]
// Output:
//   art-src/generated/<game>-<preset>-extra.png + .txt (tiles by name, read by tiles.json);
//   content/<game>/public/assets/<preset>/extra.png and the manifest's 'props', 'surfaces', 'ui'
//   and object 'sprites' (barril, barril-explosivo, carrito).
// Deterministic (seeded RNG).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, writePng } from './png.ts';
import { type Rgb, hexToRgb, mix } from './color.ts';
import { bayer, rng, valueNoise } from './pixel.ts';
import * as env from './environment-art.ts';
import * as show from './willy-show-art.ts';
import { applyFxTable } from './fx-table.ts';
import * as markers from './markers.ts';

const [game = 'willy', preset = 'ninja'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const T = 16;

const P = {
  out: '#1e1c24',
  // Castro: wet stone, sea, ochre plaster, red roof tiles.
  st0: '#4a5562', st1: '#66727e', st2: '#86929e', st3: '#a8b6c2', wet: '#cfe2ee', joint: '#343c46',
  sea0: '#1e5a6a', sea1: '#2e7a88', sea2: '#4aa0a8', foam: '#d8f0ee',
  och0: '#9a6e40', och1: '#c0904e', och2: '#dcb070', och3: '#f0d090',
  tile0: '#8a3020', tile1: '#b0482c', tile2: '#d06a40',
  slab0: '#8a7c64', slab1: '#aa9a7c', slab2: '#c8b896',
  weed: '#3a7a40', weed1: '#58a04a',
  lonja0: '#a8b0b4', lonja1: '#d0d8dc', lonja2: '#eef2f4', scale: '#9ad0e0',
  chk0: '#8a4a2a', chk1: '#d8c098',
  wood0: '#4a2c1c', wood1: '#6e4428', wood2: '#8e5e34', wood3: '#b07a44',
  // Camerino: velvet, studio purple, neon, gold.
  vel0: '#5a0e1e', vel1: '#8a1a2e', vel2: '#b02a3e', gold0: '#a8781e', gold1: '#e8b830', gold2: '#fff0a0',
  stu0: '#1e1430', stu1: '#2e2048', stu2: '#44306a', stu3: '#5a4488', neon0: '#ff4fa0', neon1: '#4fe8ff', neon2: '#ffe04f',
  glass: '#a8d8f0', glass1: '#e0f4ff', bulb: '#fff4c0', bulbOff: '#8a7a50', metal0: '#5a5e66', metal1: '#8a9098', metal2: '#c0c6ce',
  screen: '#203a50', screen1: '#4fe8ff', red: '#e0302a', green: '#40c060',
  white: '#f4f4f0', paper: '#e8e0c8',
};
type K = keyof typeof P;
const c = (k: K | string): Rgb => hexToRgb(k in P ? P[k as K] : k);

function px(img: Image, x: number, y: number, col: Rgb | null): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  if (!col) return void (img.data[i + 3] = 0);
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [col[0], col[1], col[2], 255];
}
function fill(img: Image, x: number, y: number, w: number, h: number, k: K | string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(img, xx, yy, c(k));
}
function frameRect(img: Image, x: number, y: number, w: number, h: number, k: K | string): void {
  for (let i = 0; i < w; i++) (px(img, x + i, y, c(k)), px(img, x + i, y + h - 1, c(k)));
  for (let i = 0; i < h; i++) (px(img, x, y + i, c(k)), px(img, x + w - 1, y + i, c(k)));
}
/** ASCII drawing with a char -> palette key/hex legend; '.' leaves pixels as they are. */
function ascii(img: Image, x0: number, y0: number, rows: string[], legend: Record<string, K | string>): void {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === ' ') return;
    const k = legend[ch];
    if (!k) throw new Error(`no colour for "${ch}"`);
    px(img, x0 + x, y0 + y, c(k));
  }));
}

// --- Castro Sumergido -------------------------------------------------------------------

/** Wet cobbles: irregular stones with dark joints and glossy highlights. */
function wetStone(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, 'joint');
  // Stones on a jittered grid (tiles seamlessly: rows of 4px with offset).
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    let x = row % 2 ? -2 : 0;
    while (x < T) {
      const w = 3 + Math.floor(r() * 3);
      const tone: K = (['st1', 'st2', 'st2', 'st1'] as K[])[Math.floor(r() * 4)]!;
      for (let yy = y0; yy < y0 + 3; yy++) for (let xx = x; xx < x + w; xx++) px(img, (xx + T) % T, yy, c(tone));
      px(img, (x + T) % T, y0, c('st3'));
      if (r() < 0.35) px(img, (x + 1 + T) % T, y0, c('wet'));
      px(img, (x + w - 1 + T) % T, y0 + 2, c('st0'));
      x += w + 1;
    }
  }
  return img;
}

/** Ankle-deep water over the cobbles: teal tint, ripple lines and foam specks. */
function shallowWater(seed: number, frame: number): Image {
  const img = wetStone(seed);
  const n = valueNoise(seed + 7, 16, 8);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4;
    const base: Rgb = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
    const t = 0.55 + 0.15 * n(x, y);
    let col = mix(base, c('sea1'), t);
    // Ripples drift one pixel per frame.
    if ((x + y * 2 + frame * 2) % 11 === 0 && n(x, y) > 0.4) col = c('sea2');
    if ((x * 3 + y + frame * 3) % 37 === 0) col = c('foam');
    px(img, x, y, col);
  }
  return img;
}

/** Quay slabs: big sandstone flags with a mooring ring. */
function quaySlab(seed: number, ring: boolean): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, 'slab1');
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (r() < 0.08) px(img, x, y, c(r() < 0.5 ? 'slab0' : 'slab2'));
  fill(img, 0, 7, T, 1, 'slab0');
  fill(img, 7, 0, 1, 7, 'slab0');
  fill(img, 11, 8, 1, 8, 'slab0');
  fill(img, 0, 0, T, 1, 'slab2');
  if (ring) ascii(img, 3, 9, ['.kkk.', 'k...k', 'k...k', '.kkk.'], { k: 'metal0' });
  return img;
}

/** Quay face: wet sea wall with a green tide line and weed (the drop to the water). */
function quayFace(): Image {
  const img = blank(T, T);
  const r = rng(41);
  fill(img, 0, 0, T, T, 'slab0');
  for (let y = 0; y < T; y += 4) {
    fill(img, 0, y, T, 1, 'joint');
    const off = (y / 4) % 2 ? 4 : 0;
    for (let x = off; x < T; x += 8) fill(img, x, y, 1, 4, 'joint');
  }
  fill(img, 0, 0, T, 2, 'slab2');
  for (let x = 0; x < T; x++) {
    const h = 9 + Math.floor(r() * 3);
    for (let y = h; y < T; y++) px(img, x, y, c(y === h ? 'weed1' : r() < 0.6 ? 'weed' : 'sea0'));
  }
  return img;
}

/** Arcade floor: worn chequered tiles. */
function arcadeFloor(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const dark = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
    px(img, x, y, c(dark ? 'chk0' : 'chk1'));
    if (r() < 0.05) px(img, x, y, c('och0'));
  }
  for (let i = 0; i < T; i += 4) (fill(img, i, 0, 1, T, 'och0'), fill(img, 0, i, T, 1, 'och0'));
  return img;
}

/** Fish market floor: white tiles, a drain and stray fish scales. */
function lonjaFloor(seed: number, drain: boolean): Image {
  const img = blank(T, T);
  const r = rng(seed);
  fill(img, 0, 0, T, T, 'lonja1');
  for (let i = 0; i < T; i += 8) (fill(img, i, 0, 1, T, 'lonja0'), fill(img, 0, i, T, 1, 'lonja0'));
  for (let i = 1; i < T; i += 8) (fill(img, i, 1, 6, 1, 'lonja2'));
  for (let n = 0; n < 4; n++) px(img, Math.floor(r() * T), Math.floor(r() * T), c('scale'));
  if (drain) ascii(img, 5, 5, ['kkkkkk', 'k.k.kk', 'kk.k.k', 'k.k.kk', 'kkkkkk'], { k: 'metal0' });
  return img;
}

/** Roof seen from above (wall top): red clay tiles in rows. */
function roofTop(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const row = Math.floor(y / 4), off = row % 2 ? 2 : 0;
    const inTile = (x + off) % 4;
    const k: K = y % 4 === 3 ? 'tile0' : inTile === 0 ? 'tile0' : y % 4 === 0 ? 'tile2' : 'tile1';
    px(img, x, y, c(k));
    if (r() < 0.03) px(img, x, y, c('och0'));
  }
  fill(img, 0, T - 2, T, 2, 'tile0');
  return img;
}

/** House wall face: ochre plaster with a small green-shuttered window band. */
function plasterFace(window: boolean): Image {
  const img = blank(T, T);
  const r = rng(window ? 51 : 52);
  fill(img, 0, 0, T, T, 'och1');
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (r() < 0.07) px(img, x, y, c(r() < 0.5 ? 'och0' : 'och2'));
  fill(img, 0, 0, T, 1, 'och3');
  if (window) {
    fill(img, 4, 3, 8, 8, 'out');
    fill(img, 5, 4, 6, 6, 'sea0');
    fill(img, 5, 4, 2, 6, 'weed1');
    fill(img, 9, 4, 2, 6, 'weed1');
    fill(img, 4, 11, 8, 1, 'och3');
  }
  return img;
}

/** Arcade face: a round arch opening onto darkness. */
function archFace(): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, 'och1');
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const dx = x - 7.5, dy = y - 7;
    if ((y >= 7 && x >= 2 && x <= 13) || (y < 7 && dx * dx + dy * dy <= 30)) px(img, x, y, c('out'));
    else if ((y >= 7 && (x === 1 || x === 14)) || (y < 7 && dx * dx + dy * dy <= 42)) px(img, x, y, c('och2'));
  }
  fill(img, 0, 0, T, 1, 'och3');
  return img;
}

// --- Camerino ----------------------------------------------------------------------------

function carpet(seed: number): Image {
  const img = blank(T, T);
  const n = valueNoise(seed, 16, 4);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, c(n(x, y) > 0.6 ? 'vel2' : n(x, y) < 0.3 ? 'vel0' : 'vel1'));
  // Gold diamond pattern.
  for (let i = 0; i < T; i++) {

    if (Math.abs(i - 7.5) < 8) {
      const a = Math.abs(i - 8);
      px(img, i, a, c('gold0'));
      px(img, i, T - 1 - a, c('gold0'));
    }
  }
  px(img, 8, 0, c('gold1'));
  px(img, 0, 8, c('gold1'));
  return img;
}

function stageBoards(seed: number): Image {
  const img = blank(T, T);
  const r = rng(seed);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) px(img, x, y, c(x % 4 === 3 ? 'wood0' : r() < 0.1 ? 'wood2' : 'wood1'));
  for (let x = 0; x < T; x += 4) px(img, x + 1, Math.floor(r() * T), c('wood3'));
  // Gaffer tape mark.
  if (r() < 0.6) {
    const y = 4 + Math.floor(r() * 8);
    fill(img, 3, y, 6, 1, 'neon2');
    fill(img, 3, y, 1, 3, 'neon2');
  }
  return img;
}

/** Top of the studio walls: near-black with the diagonal hatch that means "solid", seamless, so it
 *  can't be read as the (also dark) studio floor. */
function studioWallTop(): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, '#0e0a16');
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x + y) % 4 === 0) px(img, x, y, c('stu1'));
  return img;
}

function studioWallFace(neon: boolean): Image {
  const img = blank(T, T);
  fill(img, 0, 0, T, T, 'stu2');
  for (let x = 0; x < T; x += 8) fill(img, x, 0, 1, T, 'stu1');
  fill(img, 0, 0, T, 1, 'stu3');
  if (neon) (fill(img, 0, 5, T, 1, 'neon0'), fill(img, 0, 4, T, 1, 'stu3'), fill(img, 0, 6, T, 1, 'stu3'));
  return img;
}

// --- Camerino furniture (props, drawn over the floor; anchor floor/wall) -------------------

function mirror(on: boolean): Image {
  const img = blank(T, T);
  fill(img, 1, 1, 14, 13, 'gold0');
  fill(img, 3, 3, 10, 9, 'glass');
  for (let i = 0; i < 4; i++) px(img, 5 + i, 4 + i, c('glass1'));
  frameRect(img, 0, 0, 16, 15, 'out');
  const bulbs = [[2, 1], [6, 1], [10, 1], [13, 1], [1, 5], [1, 9], [14, 5], [14, 9]];
  bulbs.forEach(([x, y], i) => px(img, x!, y!, c(on || i % 2 ? 'bulb' : 'bulbOff')));
  return img;
}

function counterShop(): Image {
  const img = blank(32, 20);
  fill(img, 0, 6, 32, 14, 'wood2');
  fill(img, 0, 6, 32, 2, 'wood3');
  fill(img, 0, 19, 32, 1, 'wood0');
  for (let x = 4; x < 32; x += 8) fill(img, x, 9, 4, 8, 'wood1');
  // Goods on top: tortilla, water bucket, jar, bottle.
  ascii(img, 2, 0, ['.kkkk.', 'kYYYYk', 'kyyyyk', '.kkkk.'], { k: 'out', Y: '#f0c860', y: '#d09a40' });
  ascii(img, 10, 0, ['kkkk', 'kBBk', 'kBBk', 'kkkk'], { k: 'out', B: '#4a90d8' });
  ascii(img, 17, 1, ['.kk.', 'kGGk', 'kGGk'], { k: 'out', G: P.green });
  ascii(img, 24, -1, ['.k.', '.k.', 'kRk', 'kRk', 'kRk'], { k: 'out', R: P.red });
  frameRect(img, 0, 6, 32, 14, 'out');
  return img;
}

function barCounter(): Image {
  const img = blank(32, 20);
  fill(img, 0, 6, 32, 14, 'wood1');
  fill(img, 0, 6, 32, 2, 'metal2');
  for (let x = 2; x < 32; x += 6) fill(img, x, 10, 3, 6, 'wood0');
  // Beer taps and a coffee machine.
  ascii(img, 4, 0, ['k.k.k', 'k.k.k', 'MkMkM', 'kkkkk'], { k: 'out', M: P.metal2 });
  ascii(img, 18, -2, ['kkkkkkk', 'kMMMMMk', 'kMRMMMk', 'kMMMMMk', 'kkkkkkk', '..kWk..'], { k: 'out', M: P.metal1, R: P.red, W: P.white });
  frameRect(img, 0, 6, 32, 14, 'out');
  return img;
}

function productionDesk(): Image {
  const img = blank(32, 22);
  fill(img, 0, 10, 32, 8, 'metal1');
  fill(img, 0, 10, 32, 1, 'metal2');
  fill(img, 2, 18, 2, 4, 'metal0');
  fill(img, 28, 18, 2, 4, 'metal0');
  // Two monitors with the audience graph, and a clipboard.
  for (const x0 of [3, 15]) {
    fill(img, x0, 0, 11, 8, 'out');
    fill(img, x0 + 1, 1, 9, 6, 'screen');
    for (let i = 0; i < 9; i++) px(img, x0 + 1 + i, 6 - Math.round(i / 2), c('screen1'));
    fill(img, x0 + 4, 8, 3, 2, 'metal0');
  }
  ascii(img, 26, 4, ['kkkk', 'kWWk', 'kWWk', 'kkkk'], { k: 'out', W: P.paper });
  frameRect(img, 0, 10, 32, 8, 'out');
  return img;
}

/** Service lift doors, 16x32: closed / open, with the floor indicator. */
function lift(open: boolean): Image {
  const img = blank(T, 32);
  fill(img, 0, 0, T, 32, 'metal0');
  fill(img, 1, 6, 14, 26, 'out');
  if (open) {
    fill(img, 2, 7, 12, 25, 'stu0');
    fill(img, 2, 7, 2, 25, 'metal1');
    fill(img, 12, 7, 2, 25, 'metal1');
  } else {
    fill(img, 2, 7, 6, 25, 'metal1');
    fill(img, 8, 7, 6, 25, 'metal1');
    fill(img, 7, 7, 2, 25, 'metal0');
    fill(img, 2, 7, 1, 25, 'metal2');
    fill(img, 8, 7, 1, 25, 'metal2');
  }
  fill(img, 4, 1, 8, 4, 'out');
  ascii(img, 6, 1, ['.R.', 'RRR'], { R: open ? P.green : P.red });
  frameRect(img, 0, 0, T, 32, 'out');
  return img;
}

// --- UI: card frames by rarity (9-slice: 8 px corners) -------------------------------------

function cardFrame(rarity: 'bronce' | 'plata' | 'oro' | 'legendaria'): Image {
  const S = 24;
  const img = blank(S, S);
  const cols: Record<string, [string, string, string]> = {
    bronce: ['#6a4022', '#c07a45', '#e8b080'],
    plata: ['#5a646e', '#c9d1d9', '#ffffff'],
    oro: ['#8a5a10', '#f2c14e', '#fff4b0'],
    legendaria: ['#4a1a8a', '#b45cff', '#4fe8ff'],
  };
  const [d, m, l] = cols[rarity]!;
  fill(img, 0, 0, S, S, '#1a1622');
  frameRect(img, 0, 0, S, S, P.out);
  frameRect(img, 1, 1, S - 2, S - 2, d);
  frameRect(img, 2, 2, S - 4, S - 4, m);
  for (let i = 3; i < S - 3; i++) (px(img, i, 2, c(l)), px(img, 2, i, c(l)));
  // Corner ornaments, richer with rarity.
  const corner = rarity === 'bronce' ? ['mm', 'm.'] : rarity === 'plata' ? ['lm.', 'mm.', '...'] : rarity === 'oro' ? ['lmm', 'mdm', 'mm.'] : ['lml', 'mdm', 'lm.'];
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    corner.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const X = fx ? S - 4 - x : 3 + x, Y = fy ? S - 4 - y : 3 + y;
      px(img, X, Y, c(ch === 'l' ? l : ch === 'm' ? m : d));
    }));
  }
  if (rarity === 'legendaria') for (let i = 6; i < S - 6; i += 3) (px(img, i, 1, c(P.neon0)), px(img, i, S - 2, c(P.neon0)));
  void bayer;
  return img;
}

// --- Build -----------------------------------------------------------------------------------

const tiles: [string, Image][] = [
  ['piedra_mojada_1', wetStone(3)], ['piedra_mojada_2', wetStone(9)], ['piedra_mojada_3', wetStone(15)],
  ['agua_1', shallowWater(3, 0)], ['agua_2', shallowWater(9, 1)],
  ['muelle_1', quaySlab(21, false)], ['muelle_2', quaySlab(22, true)], ['muelle_cara', quayFace()],
  ['soportal_1', arcadeFloor(31)], ['soportal_2', arcadeFloor(32)], ['soportal_cara', archFace()],
  ['lonja_1', lonjaFloor(41, false)], ['lonja_2', lonjaFloor(42, true)],
  ['tejado_1', roofTop(51)], ['tejado_2', roofTop(52)], ['fachada', plasterFace(false)], ['fachada_ventana', plasterFace(true)],
  ['moqueta_1', carpet(61)], ['moqueta_2', carpet(62)],
  ['tarima_1', stageBoards(71)], ['tarima_2', stageBoards(72)],
  ['escalon_piedra', show.stairFace(['#343c46', '#4a5562', '#86929e', '#cfe2ee'])],
  ['escalon_madera', show.stairFace(['#4a2c1c', '#6e4428', '#8e5e34', '#d0a060'])],
  ['escalon_baldosa', show.stairFace(['#6a7a88', '#a8b6c2', '#d8e0e8', '#ffffff'])],
  ['escalon_plato', show.stairFace(['#1e1430', '#2e2048', '#5a4488', '#4fe8ff'])],
  ['plato_muro_techo', studioWallTop()], ['plato_muro_cara', studioWallFace(false)], ['plato_muro_neon', studioWallFace(true)],
  // Floor 5 arena
  ['plato_suelo_1', show.studioFloor(81)], ['plato_suelo_2', show.studioFloor(82)],
  ...([['roja', '#e0302a'], ['azul', '#3a8fd9'], ['verde', '#40c060'], ['amarilla', '#ffe04f']] as const).flatMap(([n, col]) => [
    [`baldosa_${n}`, show.answerTile(col, false)] as [string, Image], [`baldosa_${n}_luz`, show.answerTile(col, true)] as [string, Image],
  ]),
  ['trampilla_abierta', show.trapdoorOpen()], ['gradas_1', show.bleachers(91)], ['gradas_2', show.bleachers(92)],
  // Floor 2: Hipermercado Eterno
  ['hiper_suelo_1', show.hyperFloor(101)], ['hiper_suelo_2', show.hyperFloor(102)], ['hiper_oferta', show.saleAisle()],
  ['estanteria_techo_1', show.shelfTop(103)], ['estanteria_techo_2', show.shelfTop(104)], ['estanteria_cara', show.shelfFace()],
  ['cinta_1', show.conveyor(0)], ['cinta_2', show.conveyor(2)],
  // Floor 3: La Verbena Sin Fin
  ['verbena_suelo_1', show.fiestaSquare(111)], ['verbena_suelo_2', show.fiestaSquare(112)], ['verbena_suelo_3', show.fiestaSquare(113)],
  ['escenario_1', show.bandStage(114)], ['escenario_2', show.bandStage(115)], ['escenario_cara', show.bandStageFace()],
  ['tejado_banderines_1', show.buntingRoof(116)], ['tejado_banderines_2', show.buntingRoof(117)], ['fachada_encalada', show.whiteFacade()],
  // Floor 4: Balneario Glaciar
  ['azulejo_1', show.poolTiles(121)], ['azulejo_2', show.poolTiles(122)],
  ['piscina_1', show.poolWater(0)], ['piscina_2', show.poolWater(3)],
  ['hielo_1', show.icyTiles(123)], ['hielo_2', show.icyTiles(124)],
  ['nieve_techo_1', show.snowTop(125)], ['nieve_techo_2', show.snowTop(126)], ['balneario_pared', show.spaWall()],
  // Floor-collapse clock (every floor): the sunken pit left once a room falls.
  ['hundido_1', show.sunkenPit(991)], ['hundido_2', show.sunkenPit(992)], ['hundido_cara', show.sunkenPitFace()],
];
type Anchor = 'wall' | 'floor' | 'centre';
const props: Record<string, { frames: Image[]; fps: number; loop: boolean; anchor: Anchor; light?: string }> = {
  // Camerino furniture
  'espejo-bombillas': { frames: [mirror(true), mirror(false)], fps: 2, loop: true, anchor: 'wall', light: '#fff0c0' },
  'mostrador-maripuri': { frames: [counterShop()], fps: 0, loop: false, anchor: 'floor' },
  'barra-paco': { frames: [barCounter()], fps: 0, loop: false, anchor: 'floor' },
  'mesa-xelda': { frames: [productionDesk()], fps: 0, loop: false, anchor: 'floor', light: '#4fe8ff' },
  'ascensor-servicio': { frames: [lift(false), lift(true)], fps: 0, loop: false, anchor: 'wall' },
  // Stage props (every floor)
  'foco-movil': { frames: [0, 1, 2, 1].map(show.spotlight), fps: 2, loop: true, anchor: 'floor', light: '#fff4c8' },
  'cono-de-luz': { frames: [show.lightCone()], fps: 0, loop: false, anchor: 'floor' },
  'camara-dron': { frames: [0, 1].map(show.cameraDrone), fps: 10, loop: true, anchor: 'centre', light: '#ff3030' },
  'cartel-en-directo': { frames: [show.liveSign(true), show.liveSign(false)], fps: 1, loop: true, anchor: 'wall', light: '#ff3030' },
  'parrilla-de-focos': { frames: [0, 1, 2].map(show.lightingRig), fps: 3, loop: true, anchor: 'wall', light: '#ffffff' },
  // Effects
  'fx-arco-voltaico': { frames: [0, 1, 2, 3].map(show.voltaicArc), fps: 16, loop: true, anchor: 'centre', light: '#4fe8ff' },
  ...Object.fromEntries([5, 6, 7, 8, 9, 10].map((g) => {
    const n = g === 5 ? 3 : g === 10 ? 8 : 5;
    return [`fx-onda-${g}g`, { frames: Array.from({ length: n }, (_, f) => show.gWave(g, f, n)), fps: g === 5 ? 4 : 12, loop: false, anchor: 'centre' as Anchor, ...(g >= 8 ? { light: '#4fe8ff' } : {}) }];
  })),
  'fx-impreso-volador': { frames: [0, 1, 2, 3].map(show.flyingForm), fps: 10, loop: true, anchor: 'centre' },
  'fx-balon-estela': { frames: [0, 1, 2, 3].map(show.ballTrail), fps: 14, loop: true, anchor: 'centre' },
  'fx-confeti': { frames: [0, 1, 2, 3, 4].map(show.confetti), fps: 12, loop: false, anchor: 'centre' },
  'fx-vapor': { frames: env.steam(), fps: 10, loop: false, anchor: 'floor' },
  'fx-explosion': { frames: env.explosion(), fps: 14, loop: false, anchor: 'centre', light: '#ffb060' },
  'fx-explosion-bombona': { frames: show.bottleBlast(), fps: 14, loop: false, anchor: 'centre', light: '#ffb060' },
  'fx-bombona-volando': { frames: [0, 1, 2, 3].map(show.flyingBottle), fps: 14, loop: true, anchor: 'centre' },
  'fx-mate-impacto': { frames: show.dunkImpact(), fps: 14, loop: false, anchor: 'floor', light: '#ffb040' },
  'fx-papeleo': { frames: [0, 1, 2, 3, 4, 5].map(show.paperStorm), fps: 10, loop: false, anchor: 'floor' },
  'fx-sello': { frames: [0, 1, 2, 3, 4].map(show.stampThump), fps: 12, loop: false, anchor: 'centre' },
  'fx-chispazo': { frames: [0, 1, 2, 3, 4].map(show.zapImpact), fps: 16, loop: false, anchor: 'centre', light: '#4fe8ff' },
  // Golden ring drawn under elite enemies (the sprite is the <id>--elite recolour).
  'aura-elite': { frames: [0, 1, 2, 3].map(show.eliteAura), fps: 8, loop: true, anchor: 'floor', light: '#ffc440' },
  // Death feedback (played directly by MapScene, not through the ability fx table; Intereses-style id)
  fx_eliminado: { frames: [0, 1, 2, 3, 4].map(show.eliminatedBanner), fps: 8, loop: false, anchor: 'centre' },
  // Xelda's office: the contract, drawn over the desk
  contrato: { frames: [show.contractStack()], fps: 0, loop: false, anchor: 'floor' },
  // Floor-collapse clock
  'fx-polvo-derrumbe': { frames: [0, 1, 2, 3, 4, 5].map(show.collapseDust), fps: 10, loop: false, anchor: 'floor' },
  'fx-cascotes': { frames: [0, 1, 2, 3, 4].map(show.fallingRubble), fps: 10, loop: false, anchor: 'floor' },
  // Ability FX of the 21 new floor enemies (content/willy/art/ninja/fx.json)
  'fx-tentaculo': { frames: [0, 1, 2].map(show.tentacleLash), fps: 10, loop: false, anchor: 'centre' },
  'fx-percebe': { frames: [0, 1, 2].map(show.barnacleShot), fps: 10, loop: false, anchor: 'centre' },
  'fx-chispa-mini': { frames: [0, 1, 2].map(show.eelZapBead), fps: 14, loop: true, anchor: 'centre' },
  'fx-descarga-charco': { frames: [0, 1, 2, 3].map(show.puddleShock), fps: 10, loop: false, anchor: 'floor', light: '#4fe8ff' },
  'fx-a-reponer': { frames: [0, 1, 2, 3].map(show.restockRing), fps: 10, loop: false, anchor: 'floor' },
  'fx-placaje': { frames: [0, 1, 2].map(show.tackleHit), fps: 12, loop: false, anchor: 'centre' },
  'fx-corcho': { frames: [0, 1, 2].map(show.corkShot), fps: 10, loop: false, anchor: 'centre' },
  'fx-linea-bingo': { frames: [0, 1, 2, 3].map(show.bingoShout), fps: 10, loop: false, anchor: 'floor' },
  'fx-bajo-carpa': { frames: [0, 1, 2, 3].map(show.bassThump), fps: 10, loop: false, anchor: 'floor' },
  'fx-llave': { frames: [0, 1, 2].map(show.lockHold), fps: 12, loop: false, anchor: 'centre' },
  'fx-lodo-curativo': { frames: [0, 1, 2, 3].map(show.mudHeal), fps: 8, loop: false, anchor: 'floor' },
  'fx-barro-cara': { frames: [0, 1, 2].map(show.mudSlap), fps: 10, loop: false, anchor: 'centre' },
  'fx-pregunta-trampa': { frames: [0, 1, 2].map(show.trickQuestion), fps: 8, loop: false, anchor: 'centre' },
  'fx-retoque': { frames: [0, 1, 2, 3].map(show.makeupPuff), fps: 10, loop: false, anchor: 'floor' },
  'fx-claqueta-llamada': { frames: [0, 1, 2].map(show.clapperCall), fps: 12, loop: false, anchor: 'centre' },
  'fx-foco-cegador': { frames: [0, 1, 2].map(show.blindingCone), fps: 8, loop: false, anchor: 'centre', light: '#ffffff' },
  'fx-nube-colonia': { frames: [0, 1, 2].map(show.perfumeCloud), fps: 8, loop: false, anchor: 'centre' },
  // Generic ability FX shared by several class/companion/rival abilities (fx.json audit)
  'fx-estudio': { frames: [0, 1, 2].map(show.studyFlash), fps: 12, loop: false, anchor: 'centre' },
  'fx-bloqueo': { frames: [0, 1, 2, 3].map(show.lockdownPulse), fps: 8, loop: false, anchor: 'floor' },
  'fx-aura-curativa': { frames: [0, 1, 2, 3].map(show.healAura), fps: 8, loop: false, anchor: 'floor' },
  'fx-grito-aoe': { frames: [0, 1, 2, 3].map(show.rallyShout), fps: 8, loop: false, anchor: 'floor' },
  'fx-ola': { frames: [0, 1, 2, 3].map(show.tidalWave), fps: 8, loop: false, anchor: 'floor', light: '#3a8fd9' },
  'fx-silbato': { frames: [0, 1, 2].map(show.whistleBlast), fps: 8, loop: false, anchor: 'centre' },
  'fx-cuerda': { frames: [0, 1, 2].map(show.invisibleTug), fps: 10, loop: false, anchor: 'centre' },
  // Exit markers (same ids as Intereses, so the client needs no per-game names).
  exit_open: { frames: [0, 1, 2, 3].map((f) => markers.exitOpen(f, '#4fe8ff', '#2a8aa8')), fps: 6, loop: true, anchor: 'centre', light: '#4fe8ff' },
  exit_closed: { frames: [markers.exitClosed()], fps: 0, loop: false, anchor: 'centre' },
  // Floor 5 arena
  'atril-rojo': { frames: [show.podium('#e0302a', false), show.podium('#e0302a', true)], fps: 0, loop: false, anchor: 'floor' },
  'atril-azul': { frames: [show.podium('#3a8fd9', false), show.podium('#3a8fd9', true)], fps: 0, loop: false, anchor: 'floor' },
  'atril-verde': { frames: [show.podium('#40c060', false), show.podium('#40c060', true)], fps: 0, loop: false, anchor: 'floor' },
  'panel-de-preguntas': { frames: [0, 1, 2, 3].map(show.questionBoard), fps: 0, loop: false, anchor: 'wall', light: '#b45cff' },
  // Biome props (decor drawn by the client, not entities)
  farolillo: { frames: [show.paperLantern(0), show.paperLantern(1)], fps: 2, loop: true, anchor: 'wall', light: '#ffb040' },
  banderines: { frames: [show.bunting()], fps: 0, loop: false, anchor: 'wall' },
  'escalera-piscina': { frames: [show.poolLadder()], fps: 0, loop: false, anchor: 'floor' },
  'puerta-sauna': { frames: [0, 1].map(show.saunaDoor), fps: 3, loop: true, anchor: 'wall' },
  cables: { frames: [show.cables()], fps: 0, loop: false, anchor: 'floor' },
  claqueta: { frames: [show.clapperboard()], fps: 0, loop: false, anchor: 'floor' },
};
/** Surface overlays (manifest 'surfaces'), with the ids of Willy's ruleset (RULESET.md → Superficies). */
const surfaces: Record<string, { frames: Image[]; fps: number; loop: boolean }> = {
  agua: { frames: env.water(), fps: 5, loop: true },
  aceite: { frames: env.oil(), fps: 0, loop: false },
  fuego: { frames: env.fire(), fps: 8, loop: true },
  hielo: { frames: env.ice(), fps: 0, loop: false },
  vapor: { frames: [0, 1, 2, 3].map(show.steamCloud), fps: 4, loop: true },
  toxico: { frames: [0, 1, 2, 3].map(show.toxic), fps: 6, loop: true },
  electrificada: { frames: env.electrified(), fps: 12, loop: true },
  canicas: { frames: [show.marbles()], fps: 0, loop: false },
  red: { frames: [show.net()], fps: 0, loop: false },
  expedientes: { frames: [show.expedientes(null)], fps: 0, loop: false },
  'expedientes-ardiendo': { frames: [0, 1, 2, 3].map((f) => show.expedientes(f)), fps: 8, loop: true },
  // Floor-collapse clock: cracks during the 1-round warning before a room falls.
  grieta: { frames: [0, 1, 2].map(show.crackedFloor), fps: 4, loop: true },
};
/** Objects (manifest 'sprites', kind 'frames'): idle (+ broken). */
const objects: Record<string, Record<string, Image[]>> = {
  barril: { idle: [env.barrel()], broken: [env.barrelBroken()] },
  'barril-explosivo': { idle: [env.barrelOil()], broken: [env.barrelOilBroken()] },
  carrito: { idle: [show.cart()] },
  'jefe-presentador-murcielagos': { idle: [0, 1, 2, 3].map(show.batSwarm), move: [0, 1, 2, 3].map(show.batSwarm) },
  // Biome props as objects (they stand on a tile and can be pushed or broken)
  'estanteria-hiper': { idle: [show.shelfUnit(false)], broken: [show.shelfUnit(true)] },
  'caja-registradora': { idle: [show.checkout()] },
  'cesta-ofertas': { idle: [show.bargainBin()] },
  'altavoz-verbena': { idle: [show.speaker()] },
  'caseta-feria': { idle: [show.fairStall()] },
  tumbona: { idle: [show.lounger()] },
  flotador: { idle: [show.swimRing()] },
  sombrilla: { idle: [show.parasol()] },
  'camara-estudio': { idle: [show.studioCamera(true), show.studioCamera(false)] },
  'monitor-escenario': { idle: [show.floorMonitor()] },
  'silla-director': { idle: [show.directorChair()] },
  // Xelda's office (Planta 5)
  'retrato-ganador-1': { idle: [show.winnerPortrait(0)] },
  'retrato-ganador-2': { idle: [show.winnerPortrait(1)] },
  'retrato-ganador-3': { idle: [show.winnerPortrait(2)] },
  'vitrina-trofeos': { idle: [show.trophyCabinet()] },
  archivador: { idle: [show.archiveShelf()] },
};
const ui: Record<string, Image> = {
  'carta-bronce': cardFrame('bronce'), 'carta-plata': cardFrame('plata'), 'carta-oro': cardFrame('oro'), 'carta-legendaria': cardFrame('legendaria'),
  ...Object.fromEntries(show.hudIcons().map(([id, img]) => [`icono-${id}`, img])),
};

// Sheet: tiles row (named for build-tiles), then one row per prop / surface / object, then the UI row.
const rows: { name: string; frames: Image[] }[] = [
  ...Object.entries(props).map(([name, p]) => ({ name, frames: p.frames })),
  ...Object.entries(surfaces).map(([name, sf]) => ({ name: `surface_${name}`, frames: sf.frames })),
  ...Object.entries(objects).map(([name, o]) => ({ name: `object_${name}`, frames: Object.values(o).flat() })),
  { name: 'ui', frames: Object.values(ui) },
];
const width = Math.max(tiles.length * T, ...rows.map((r) => r.frames.reduce((w, f) => w + f.width, 0)));
const height = T + rows.reduce((h, r) => h + Math.max(...r.frames.map((f) => f.height)), 0);
const sheet = blank(width, height);
const names: string[] = [];
tiles.forEach(([name, img], i) => (blit(sheet, img, i * T, 0), names.push(`${name} ${i * T} 0 ${T} ${T}`)));
const layout = new Map<string, { x: number; y: number; w: number; h: number }[]>();
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
manifest.props = Object.fromEntries(Object.entries(props).map(([id, p]) => [id, { url, frames: layout.get(id)!, fps: p.fps, loop: p.loop, anchor: p.anchor, ...(p.light ? { light: p.light } : {}) }]));
manifest.surfaces = Object.fromEntries(Object.entries(surfaces).map(([id, sf]) => [id, { url, frames: layout.get(`surface_${id}`)!, fps: sf.fps, loop: sf.loop }]));
for (const [id, o] of Object.entries(objects)) {
  const rects = layout.get(`object_${id}`)!;
  let i = 0;
  const animations = Object.fromEntries(Object.entries(o).map(([a, imgs]) => [a, imgs.map(() => rects[i++]!)]));
  manifest.sprites[id] = { kind: 'frames', url, facing: 'right', animations };
}
const uiRects = layout.get('ui')!;
manifest.ui = Object.fromEntries(Object.keys(ui).map((id, i) => [id, { url, ...uiRects[i]!, ...(id.startsWith('carta-') ? { slice: 8 } : {}) }]));
applyFxTable(manifest, gameDir, preset);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${game} ${preset} art: ${tiles.length} tiles, ${Object.keys(props).length} props, ${Object.keys(surfaces).length} surfaces, ${Object.keys(objects).length} objects, ${Object.keys(ui).length} ui -> art-src/generated/${base}.png`);
