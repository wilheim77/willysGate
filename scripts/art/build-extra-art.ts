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
import { type Rgb, hexToRgb } from './color.ts';
import { type Rect, readSpriteList } from './sprite-list.ts';
import { FLAMES, FLAME_LEGEND, type Key, T, ascii, get, rect, rgb, rng, set } from './pixel.ts';
import * as env from './environment-art.ts';
import * as fx from './spell-fx.ts';
import { applyFxTable } from './fx-table.ts';
import * as markers from './markers.ts';

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

/** Solid top for walls and rock masses: big dark capstones under a faint diagonal hatch, seamless,
 *  with no lit edge of its own (the renderer outlines blocked ground), so a large wall mass reads as
 *  solid at phone size instead of as a striped floor. */
function wallTop(seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('cap'));
  // Irregular capstones, 8 px courses offset by half a tile so the pattern wraps.
  for (const y of [0, 8]) {
    for (let x = 0; x < T; x++) set(img, x, y, rgb('out'));
    let x = y ? 4 : 0;
    while (x < T + 4) {
      for (let yy = y; yy < y + 8; yy++) set(img, x % T, yy, rgb('out'));
      set(img, (x + 1) % T, y + 1, rgb('s0')); // chipped corner catches a little light
      x += 6 + Math.floor(r() * 3);
    }
  }
  // Diagonal hatch: the universal "solid, you can't stand here" mark.
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x + y) % 4 === 0 && !get(img, x, y)?.every((v, i) => v === rgb('out')[i])) set(img, x, y, rgb('ink'));
  for (let n = 0; n < 4; n++) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb('s0'));
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
/** Wooden door in a stone frame, as the face of a closed-door tile (planks, iron bands, ring). */
function doorFace(): Image {
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('s0'));
  rect(img, 0, 0, 2, T, rgb('s1'));
  rect(img, 14, 0, 2, T, rgb('s1'));
  rect(img, 0, 0, T, 2, rgb('s2'));
  rect(img, 0, 2, T, 1, rgb('out'));
  rect(img, 2, 3, 12, 13, rgb('w2'));
  for (let x = 2; x < 14; x += 3) {
    rect(img, x, 3, 1, 13, rgb('w0'));
    rect(img, x + 1, 3, 1, 13, rgb('w3'));
  }
  for (const y of [5, 12]) {
    rect(img, 2, y, 12, 1, rgb('i1'));
    rect(img, 2, y - 1, 12, 1, rgb('i2'));
    set(img, 3, y, rgb('i0'));
    set(img, 12, y, rgb('i0'));
  }
  ascii(img, 9, 7, ['.kk.', 'k..k', '.kk.'], { k: 'i2' });
  rect(img, 1, 3, 1, 13, rgb('out'));
  rect(img, 14, 3, 1, 13, rgb('out'));
  return img;
}

/** Top of a closed-door tile: a wooden lintel between two capstones. */
function doorTop(): Image {
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('cap'));
  rect(img, 3, 2, 10, 12, rgb('w2'));
  for (let y = 2; y < 14; y += 4) (rect(img, 3, y, 10, 1, rgb('w3')), rect(img, 3, y + 3, 10, 1, rgb('w1')));
  rect(img, 2, 1, 12, 1, rgb('out'));
  rect(img, 2, 14, 12, 1, rgb('out'));
  rect(img, 2, 1, 1, 14, rgb('out'));
  rect(img, 13, 1, 1, 14, rgb('out'));
  rect(img, 0, 13, T, 3, rgb('s2'));
  rect(img, 0, 15, T, 1, rgb('s3'));
  return img;
}

/** Top of an open-door tile: floor with a worn threshold and the leaf swung against the jamb. */
function doorOpenTop(floor: Image): Image {
  const img = blank(T, T);
  blit(img, floor, 0, 0);
  rect(img, 0, 13, T, 3, rgb('w2'));
  rect(img, 0, 13, T, 1, rgb('w3'));
  rect(img, 0, 15, T, 1, rgb('w0'));
  rect(img, 0, 0, 3, 13, rgb('w2'));
  rect(img, 1, 0, 1, 13, rgb('w3'));
  rect(img, 3, 0, 1, 13, rgb('out'));
  set(img, 1, 4, rgb('i2'));
  set(img, 1, 9, rgb('i2'));
  return img;
}

/** Face under a raised open doorway: a dark opening framed in stone. */
function doorOpenFace(): Image {
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('void'));
  rect(img, 0, 0, 2, T, rgb('s1'));
  rect(img, 14, 0, 2, T, rgb('s1'));
  rect(img, 0, 0, T, 2, rgb('s2'));
  rect(img, 0, 2, T, 1, rgb('out'));
  return img;
}

/** Trap marker overlay from 0x72's floor spikes: armed (spikes up, glinting) or disarmed (dim). */
function trapFrame(atlas: Image, list: Record<string, Rect>, frame: number, disarmed = false): Image {
  const r = list[`floor_spikes_anim_f${frame}`]!;
  const img = crop(atlas, r.x, r.y, T, T);
  if (disarmed) {
    for (let i = 0; i < img.data.length; i += 4) for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(img.data[i + c]! * 0.7);
    ascii(img, 0, 0, ['k..............k', '.k............k.'], { k: 's1' });
  }
  return img;
}

/** Tapestry with the Mazo crest (a gold mallet); the 'crossbow' variant shows the bolt tip and stock peeking out. */
function tapestry(crossbow: boolean): Image {
  const img = blank(T, 24);
  rect(img, 1, 0, 14, 1, rgb('w1'));
  rect(img, 0, 1, 16, 1, rgb('w2'));
  rect(img, 2, 2, 12, 20, rgb('b1'));
  rect(img, 2, 2, 1, 20, rgb('b0'));
  rect(img, 13, 2, 1, 20, rgb('b0'));
  for (let y = 3; y < 21; y += 2) (set(img, 3, y, rgb('f4')), set(img, 12, y, rgb('f4')));
  ascii(img, 5, 6, ['kkkkkk', 'kYYYYk', 'kkYYkk', '..YY..', '..YY..', '..YY..', '..Yk..'], { k: 'out', Y: 'f4' });
  for (let x = 2; x < 14; x += 2) (set(img, x, 22, rgb('b1')), set(img, x + 1, 23, rgb('b0')));
  if (crossbow) {
    ascii(img, 14, 14, ['k.', 'Ik', 'kk'], { k: 'out', I: 'i2' });
    ascii(img, 12, 21, ['kOk', '.k.'], { k: 'out', O: 'w3' });
  }
  return img;
}

/** Gallows of the Torre del Cepo square: post, beam, brace and the noose. */
function gallows(): Image {
  const img = blank(T, 32);
  rect(img, 2, 2, 3, 30, rgb('w2'));
  rect(img, 2, 2, 1, 30, rgb('w3'));
  rect(img, 2, 2, 13, 3, rgb('w2'));
  rect(img, 2, 2, 13, 1, rgb('w3'));
  for (let i = 0; i < 6; i++) set(img, 5 + i, 10 - i, rgb('w1'));
  rect(img, 12, 5, 1, 6, rgb('d2'));
  ascii(img, 11, 11, ['.k.', 'k.k', 'k.k', '.k.'], { k: 'd2' });
  rect(img, 0, 30, 8, 2, rgb('s0'));
  return img;
}

/** Camp fire: a ring of stones, logs and a 4-frame flame. */
function campfire(frame: number): Image {
  const img = blank(T, T);
  ascii(img, 3, 3, FLAMES[frame]!, FLAME_LEGEND);
  ascii(img, 4, 2, FLAMES[(frame + 2) % 4]!.slice(0, 5), FLAME_LEGEND);
  ascii(img, 1, 10, [
    '..kWWk.kWk....',
    '.kWwwWkWwWk...',
    'kSkkWWWWkkSk..',
    'kSSkkkkkkSSk..',
    '.kkSSkkSSkk...',
    '...kk..kk.....',
  ], { k: 'out', W: 'w3', w: 'w1', S: 's2' });
  return img;
}

/** The Sinpaga oil cart: a two-wheeled cart loaded with dripping oil barrels (32x20). */
function oilCart(): Image {
  const img = blank(32, 20);
  rect(img, 2, 9, 26, 5, rgb('w2'));
  rect(img, 2, 9, 26, 1, rgb('w3'));
  rect(img, 2, 13, 26, 1, rgb('w0'));
  rect(img, 26, 11, 6, 1, rgb('w1'));
  for (const x of [4, 12, 20]) {
    rect(img, x, 1, 7, 8, rgb('paint'));
    rect(img, x, 1, 7, 1, rgb('w4'));
    rect(img, x, 3, 7, 1, rgb('i0'));
    rect(img, x, 6, 7, 1, rgb('i0'));
    set(img, x + 3, 4, rgb('warn'));
  }
  rect(img, 15, 9, 1, 3, rgb('oil0'));
  for (const cx of [7, 22]) {
    ascii(img, cx - 3, 13, ['.kkkkk.', 'kWkWkWk', 'kkWkWkk', 'kWkWkWk', '.kkkkk.'], { k: 'out', W: 'w3' });
  }
  return outlined(img);
}

/** The Pozo del Ahorcado: a stone well with a crossbeam, a frayed rope and no bucket (16x24). */
function well(): Image {
  const img = blank(T, 24);
  rect(img, 2, 1, 2, 14, rgb('w2'));
  rect(img, 12, 1, 2, 14, rgb('w2'));
  rect(img, 1, 1, 14, 2, rgb('w3'));
  rect(img, 7, 3, 1, 7, rgb('d2'));
  set(img, 7, 10, rgb('d1'));
  set(img, 6, 11, rgb('d1'));
  rect(img, 1, 14, 14, 9, rgb('s1'));
  for (let y = 14; y < 23; y += 3) {
    rect(img, 1, y, 14, 1, rgb('out'));
    for (let x = (y / 3) % 2 ? 1 : 4; x < 15; x += 6) rect(img, x, y, 1, 3, rgb('out'));
  }
  rect(img, 1, 14, 14, 2, rgb('s2'));
  rect(img, 3, 15, 10, 1, rgb('void'));
  return outlined(img);
}

/** Bear trap (cepo): open jaws when armed, shut and harmless when disarmed. */
function bearTrap(armed: boolean): Image {
  const img = blank(T, T);
  if (armed) {
    ascii(img, 1, 4, [
      '.kkkkkkkkkkkk.',
      'kIkIkIkIkIkIkk',
      'kIIIIIIIIIIIIk',
      'kI....kk....Ik',
      'kI...kIIk...Ik',
      'kI....kk....Ik',
      'kIIIIIIIIIIIIk',
      'kIkIkIkIkIkIkk',
      '.kkkkkkkkkkkk.',
    ], { k: 'out', I: 'i1' });
  } else {
    ascii(img, 1, 6, [
      '.kkkkkkkkkkkk.',
      'kIIIIIIIIIIIIk',
      'kIkIkIkIkIkIkk',
      'kIIIIIIIIIIIIk',
      '.kkkkkkkkkkkk.',
    ], { k: 'out', I: 'i0' });
  }
  return img;
}

/** A tripwire across the tile, between two stakes. */
function tripwire(): Image {
  const img = blank(T, T);
  ascii(img, 0, 6, ['kk', 'kW', 'kk'], { k: 'out', W: 'w3' });
  ascii(img, 14, 6, ['kk', 'Wk', 'kk'], { k: 'out', W: 'w3' });
  rect(img, 2, 7, 12, 1, rgb('s3'));
  return img;
}

/** Pressure plate with dart holes (poisoned dart trap). */
function dartPlate(): Image {
  const img = blank(T, T);
  ascii(img, 3, 3, ['kkkkkkkkkk', 'kSSSSSSSSk', 'kSkSSSSkSk', 'kSSSSSSSSk', 'kSSSkkSSSk', 'kSSSkkSSSk', 'kSSSSSSSSk', 'kSkSSSSkSk', 'kSSSSSSSSk', 'kkkkkkkkkk'], { k: 'out', S: 's1' });
  set(img, 8, 8, rgb('#97da3f'));
  return img;
}

// --- Mine and vault (scene 5 and 6) -----------------------------------------------------------

/** Mine rails over the stone floor: wooden sleepers and two iron rails, horizontal or vertical. */
function rails(vertical: boolean, seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('s0'));
  for (let i = 0; i < 18; i++) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb(r() < 0.5 ? 'ink' : 's1'));
  for (let k = 1; k < T; k += 5) {
    if (vertical) (rect(img, 2, k, 12, 2, rgb('w2')), rect(img, 2, k, 12, 1, rgb('w3')));
    else (rect(img, k, 2, 2, 12, rgb('w2')), rect(img, k, 2, 1, 12, rgb('w3')));
  }
  for (const o of [4, 11]) {
    if (vertical) (rect(img, o, 0, 1, T, rgb('i2')), rect(img, o + 1, 0, 1, T, rgb('i0')));
    else (rect(img, 0, o, T, 1, rgb('i2')), rect(img, 0, o + 1, T, 1, rgb('i0')));
  }
  return img;
}

/** Floor of the vault: pale ancient slabs inlaid with veins of living silver. */
function vaultFloor(seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('#5a5866'));
  rect(img, 0, 0, T, 1, rgb('#3a3844'));
  rect(img, 0, 0, 1, T, rgb('#3a3844'));
  rect(img, 1, 1, 14, 1, rgb('#6e6c7a'));
  let x = Math.floor(r() * 12) + 2, y = 2;
  while (y < 15) {
    set(img, x, y, rgb('#c8d8ff'));
    if (r() < 0.4) set(img, x + 1, y, rgb('#8aa0d8'));
    x = Math.max(2, Math.min(13, x + Math.round(r() * 2 - 1)));
    y++;
  }
  return img;
}

/** Carved vault wall: the face under the vault floor, with a band of elvish runes. */
function vaultFace(): Image {
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('#44424e'));
  rect(img, 0, 0, T, 2, rgb('#6e6c7a'));
  rect(img, 0, 2, T, 1, rgb('out'));
  for (let x = 1; x < T; x += 3) (set(img, x, 6, rgb('#8aa0d8')), set(img, x + 1, 7, rgb('#8aa0d8')), set(img, x, 8, rgb('#8aa0d8')));
  rect(img, 0, 12, T, 1, rgb('#2e2c36'));
  return img;
}

/** Mine wagon (16x16), empty or loaded with ore glinting with living silver; broken: tipped over. */
function mineWagon(load: 'empty' | 'ore' | 'broken'): Image {
  const img = blank(T, T);
  if (load === 'broken') {
    ascii(img, 0, 6, [
      '..kkkkkkkkk.....',
      '.kIIIIIIIIIk....',
      'kIiiiiiiiiIk....',
      'kIiiiiiiiiIkSsS.',
      '.kkkkkkkkkk.sSsS',
      '..kWk..kWk......',
      '...k....k.......',
    ], { k: 'out', I: 'i2', i: 'i1', W: 'w3', S: 's1', s: '#c8d8ff' });
    return img;
  }
  if (load === 'ore') ascii(img, 2, 2, ['..SsS.S..', '.SSsSSsS.', 'SsSSSsSSS'], { S: 's1', s: '#c8d8ff' });
  ascii(img, 1, 5, [
    'kkkkkkkkkkkkkk',
    'kIIIIIIIIIIIIk',
    'kIiikiiiikiiIk',
    'kIiikiiiikiiIk',
    'kIiiiiiiiiiiIk',
    '.kIIIIIIIIIIk.',
    '..kkkkkkkkkk..',
    '..kWWk..kWWk..',
    '..kWWk..kWWk..',
    '...kk....kk...',
  ], { k: 'out', I: 'i2', i: 'i1', W: 'w3' });
  return img;
}

/** Powder keg: small, dark, banded, with a "PÓLVORA" skull mark; broken: split staves and black powder. */
function powderKeg(broken: boolean): Image {
  const img = blank(T, T);
  if (broken) {
    ascii(img, 1, 8, ['..k...k..k....', '.kWk.kWk.kWk..', 'kWWk.kWWk.kWk.', '.bbbbbbbbbbbb.', 'bbbbbbbbbbbbbb'], { k: 'out', W: 'w2', b: '#2a2628' });
    return img;
  }
  ascii(img, 3, 3, [
    '..kkkkkk..',
    '.kWWWWWWk.',
    'kIIIIIIIIk',
    'kWWwkkwWWk',
    'kWwkWWkwWk',
    'kWWwkkwWWk',
    'kWWwkwkWWk',
    'kIIIIIIIIk',
    'kWWWWWWWWk',
    'kIIIIIIIIk',
    '.kWWWWWWk.',
    '..kkkkkk..',
  ], { k: 'out', W: 'w1', w: 's3', I: 'i0' });
  ascii(img, 8, 1, ['k', 'Y'], { k: 'out', Y: 'f3' });
  return img;
}

/** Living-silver resonator: a tuning-fork pillar that hums (4 frames of glow); broken: snapped. */
function resonator(frame: number | 'broken'): Image {
  const img = blank(T, 24);
  const glow = ['#8aa0d8', '#a8bcf0', '#c8d8ff', '#a8bcf0'];
  if (frame === 'broken') {
    ascii(img, 3, 12, [
      '.kk..kk...',
      'kSk.kSsk..',
      'kSkkSk....',
      'kSSSSk....',
      '.kSSk.....',
      '.kSSk.....',
      'kkkkkk....',
      'kAAAAk....',
      'kkkkkkk...',
      '.kSs.sSk..',
    ], { k: 'out', S: '#8a90a0', s: '#c8d8ff', A: 's0' });
    return img;
  }
  const g = glow[frame]!;
  ascii(img, 3, 0, [
    'kk......kk',
    'kSk....kSk',
    'kSk....kSk',
    'kSk....kSk',
    'kSsk..ksSk',
    '.kSskksSk.',
    '..kSSSSk..',
    '...kSSk...',
    '...kSsk...',
    '...kSsk...',
    '...kSsk...',
    '...kSsk...',
    '..kkSSkk..',
    '.kAAAAAAk.',
    'kAAAAAAAAk',
    'kAaAaAaAAk',
    'kAAAAAAAAk',
    'kkkkkkkkkk',
  ], { k: 'out', S: '#a8b0c0', s: g, A: 's0', a: g });
  for (const [x, y] of [[2, 2], [13, 3], [1, 8], [14, 7]] as const) if ((frame + x) % 2 === 0) set(img, x, y, rgb(g));
  return img;
}

/** The fuse Garrán laid: blasting charges against the rock and a coiled fuse (16x16). */
function fuseCharges(): Image {
  const img = blank(T, T);
  ascii(img, 6, 1, ['kkkkkkkk', 'kRRkRRRk', 'kRRkRRRk', 'kRRkRRRk', 'kkkkkkkk', '.k.k.k..'], { k: 'out', R: 'paint1' });
  rect(img, 7, 7, 1, 3, rgb('s3'));
  ascii(img, 1, 9, ['...kkkkk..', '..k.....k.', '.k..kkk..k', '.k.k...k.k', '..k.kkk.k.', '...k...k..', '....kkk...'], { k: 's2' });
  return img;
}

/** The forty's remains: bones, a miner's helmet, a broken pick and the baron's payroll sheet. */
function remainsForty(): Image {
  const img = blank(T, T);
  ascii(img, 0, 3, [
    '....kkk.........',
    '...kBBBk...kk...',
    '...kBkBk..kWk...',
    '....kBk...kWk...',
    '..kkkkk..kWWWk..',
    '.kBBBBBk.kWkWk..',
    'kBkBkBkBk.kkk...',
    '.kkkkkkk..kkkk..',
    'kHHHk..kPPPPPk..',
    'kHHHHk.kPpPpPk.I',
    '.kkkk..kPPPPPkkI',
    '.......kkkkkk.kI',
  ], { k: 'out', B: 's3', W: 's2', H: 'w3', P: '#e8e0c8', p: '#8a7a60', I: 'i1' });
  set(img, 10, 13, rgb('f4'));
  return img;
}

/** Pulley and chains on the vault wall, with the ore bucket hanging from them (16x32). */
function pulley(): Image {
  const img = blank(T, 32);
  ascii(img, 4, 0, ['kkkkkkkk', 'kIIIIIIk', '.kkiikk.', '..kiik..', '...kk...'], { k: 'out', I: 'i2', i: 'i1' });
  for (let y = 5; y < 22; y++) (set(img, 6, y, rgb(y % 2 ? 'i2' : 'i0')), set(img, 9, y, rgb(y % 2 ? 'i0' : 'i2')));
  ascii(img, 3, 22, ['kkkkkkkkkk', 'kWWWWWWWWk', 'kSsSSsSSWk', 'kWWWWWWWWk', 'kWWWWWWWWk', '.kWWWWWWk.', '..kkkkkk..'], { k: 'out', W: 'w2', S: 's1', s: '#c8d8ff' });
  return img;
}

/** The elvish inscription carved in the vault wall (lit runes). */
function inscription(): Image {
  const img = blank(T, T);
  rect(img, 1, 2, 14, 12, rgb('#44424e'));
  rect(img, 1, 2, 14, 1, rgb('#6e6c7a'));
  const runes = ['.k.k.kk.k.k.', 'kk.k..k.kk.k', '.k.kk.k..k.k', 'k..k.k.kk.k.', '.kk.k..k.k.k'];
  ascii(img, 2, 5, runes.map((r) => r.replace(/k/g, 'R')), { R: '#8ab0e8' });
  return outlined(img);
}

/** A rotten plank on a walkway (detected trap): cracked, dark and sagging. */
function rottenPlank(): Image {
  const img = blank(T, T);
  ascii(img, 0, 5, ['kkkkkkkkkkkkkkkk', 'WWwWWWWkkWWWWwWW', 'wWWWwkk..kkWWWWw', 'WWWkk......kkWWW', 'kkkkkkkkkkkkkkkk'], { k: 'out', W: 'w1', w: 'w0' });
  return img;
}

// --- Exteriors: the road, Hondonegra and the Escorial (dry, cold, overcast) ---------------------

const EXT = {
  grass: ['#1e1c18', '#2e2c22', '#3e3a2a', '#524a32', '#6a5e3e'] as const,
  earth: ['#241e1a', '#33291f', '#433528', '#544433', '#685440'] as const,
  mud: ['#14110f', '#1e1915', '#2a221c', '#352b23'] as const,
  rock: ['#1c1a1c', '#2c2a2c', '#3e3a3a', '#524c4a', '#6a6260'] as const,
  river: ['#1a2024', '#26302f', '#34403e', '#4a5654', '#6e7a76'] as const,
};
const hex = (s: string) => s as unknown as Key;

/** Dry scrub: dead olive-brown grass over earth, a few low tufts (kept low-contrast so it tiles quietly). */
function scrub(seed: number): Image {
  const r = rng(seed);
  const n = valueNoiseLocal(seed, 4);
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = n(x, y);
    set(img, x, y, rgb(hex(v > 0.6 ? EXT.grass[3] : v > 0.35 ? EXT.grass[2] : EXT.earth[2])));
  }
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(r() * 14), y = 2 + Math.floor(r() * 12);
    set(img, x, y, rgb(hex(EXT.grass[4])));
    set(img, x - 1, y + 1, rgb(hex(EXT.grass[3])));
    set(img, x + 1, y + 1, rgb(hex(EXT.grass[3])));
    set(img, x, y + 1, rgb(hex(EXT.grass[1])));
  }
  if (r() < 0.5) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb(hex(EXT.rock[3])));
  return img;
}

/** Packed dirt road with two wheel ruts (horizontal, or vertical) and loose stones. */
function road(seed: number, vertical: boolean): Image {
  const r = rng(seed);
  const n = valueNoiseLocal(seed, 4);
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = n(x, y);
    set(img, x, y, rgb(hex(v > 0.66 ? EXT.earth[4] : v > 0.4 ? EXT.earth[3] : EXT.earth[2])));
  }
  for (const o of [4, 11]) for (let i = 0; i < T; i++) {
    const [x, y] = vertical ? [o + (r() < 0.15 ? 1 : 0), i] : [i, o + (r() < 0.15 ? 1 : 0)];
    set(img, x, y, rgb(hex(EXT.earth[1])));
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T);
    set(img, x, y, rgb(hex(EXT.rock[3])));
    set(img, x + 1, y + 1, rgb(hex(EXT.earth[0])));
  }
  return img;
}

/** Ditch mud: dark wet earth with standing water that catches the light. */
function mud(seed: number): Image {
  const r = rng(seed);
  const n = valueNoiseLocal(seed, 4);
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = n(x, y);
    set(img, x, y, rgb(hex(v > 0.7 ? EXT.river[2] : v > 0.45 ? EXT.mud[3] : v > 0.25 ? EXT.mud[2] : EXT.mud[1])));
  }
  for (let i = 0; i < 4; i++) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb(hex(EXT.river[4])));
  return img;
}

/** Rocky outcrop seen from above: fractured grey-brown rock with lichen. */
function rockTop(seed: number): Image {
  const r = rng(seed);
  const n = valueNoiseLocal(seed, 5);
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = n(x, y);
    set(img, x, y, rgb(hex(v > 0.68 ? EXT.rock[4] : v > 0.45 ? EXT.rock[3] : EXT.rock[2])));
  }
  for (let c = 0; c < 2; c++) {
    let x = Math.floor(r() * T), y = 0;
    while (y < T) (set(img, x, y, rgb(hex(EXT.rock[0]))), (x = (x + Math.round(r() * 2 - 1) + T) % T), (y += 1));
  }
  for (let i = 0; i < 3; i++) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb(hex('#5a6040')));
  return img;
}

/** Worn cobbles of the village square, grey, with dark joints and mud in the cracks. */
function cobbles(seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb(hex(EXT.mud[2])));
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    let x = row % 2 ? -2 : 0;
    while (x < T) {
      const w = 3 + Math.floor(r() * 2);
      const k = r() < 0.5 ? EXT.rock[3] : EXT.rock[2];
      for (let yy = y0; yy < y0 + 3; yy++) for (let xx = x; xx < x + w; xx++) set(img, (xx + T) % T, yy, rgb(hex(k)));
      set(img, (x + T) % T, y0, rgb(hex(EXT.rock[4])));
      set(img, (x + w - 1 + T) % T, y0 + 2, rgb(hex(EXT.rock[1])));
      x += w + 1;
    }
  }
  return img;
}

/** Roof seen from above: dark slate shingles in staggered rows, ridge at the top. */
function slateRoof(seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  const shades = ['#2a2c34', '#30323a', '#363840', '#2e2a2a', '#3a3632'];
  for (let row = 0; row < 6; row++) {
    const y0 = row * 3 - 1;
    let x = (row % 2) * 2 - 2;
    while (x < T) {
      const w = 3 + Math.floor(r() * 2);
      const k = shades[Math.floor(r() * shades.length)]!;
      for (let yy = y0; yy < y0 + 3; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && xx < T && yy >= 0 && yy < T) set(img, xx, yy, rgb(hex(k)));
      for (let yy = y0; yy < y0 + 3; yy++) if (x + w - 1 >= 0 && yy >= 0) set(img, x + w - 1, yy, rgb(hex('#1a1a20')));
      if (r() < 0.2) set(img, Math.max(0, x + 1), Math.max(0, y0 + 1), rgb(hex('#4a5034')));
      x += w;
    }
    if (y0 + 2 < T) for (let xx = 0; xx < T; xx++) if (r() < 0.7) set(img, xx, y0 + 2, rgb(hex('#1a1a20')));
  }
  rect(img, 0, T - 2, T, 1, rgb(hex('#1a1a20')));
  rect(img, 0, T - 1, T, 1, rgb(hex(EXT.rock[2])));
  return img;
}

/** Half-timbered house face: grey-ochre plaster between dark posts and a brace, a small shuttered window. */
function timberFace(window: boolean): Image {
  const r = rng(window ? 71 : 72);
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb(hex('#6e6452')));
  for (let i = 0; i < 20; i++) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb(hex(r() < 0.5 ? '#5e5544' : '#7e7462')));
  const beam = rgb(hex('#2c1e18'));
  rect(img, 0, 0, T, 1, beam);
  rect(img, 0, 0, 1, T, beam);
  rect(img, 15, 0, 1, T, beam);
  rect(img, 0, 12, T, 1, beam);
  if (window) {
    rect(img, 6, 4, 5, 5, beam);
    rect(img, 7, 5, 3, 3, rgb(hex('#14100e')));
    set(img, 7, 5, rgb(hex('#b08848')));
    rect(img, 5, 4, 1, 5, rgb(hex('#3e2c22')));
    rect(img, 11, 4, 1, 5, rgb(hex('#3e2c22')));
    rect(img, 6, 9, 5, 1, rgb(hex('#4a3a2e')));
  } else {
    for (let i = 0; i < 11; i++) set(img, 2 + i, 1 + i, beam);
  }
  return img;
}

/** Clay roof seen from above (teja árabe): warm terracotta channels in overlapping courses, so a
 *  roof can't be mistaken for the grey cobbles or the brown road. `ridge` adds the ridge capping. */
function clayRoof(seed: number, ridge: boolean): Image {
  const r = rng(seed);
  const img = blank(T, T);
  const base = ['#7a3420', '#9a4428', '#b85a34', '#d27a4a'];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const col = x % 4; // a channel: lit left edge, body, shadowed right edge
    const course = (y + (Math.floor(x / 4) % 2) * 2) % 5; // tiles overlap every 5 rows, staggered
    let k = col === 0 ? 3 : col === 3 ? 0 : 2;
    if (course === 4) k = 0; // the dark lower lip of each tile
    else if (course === 0 && col !== 3) k = Math.min(3, k + 1);
    if (r() < 0.06) k = Math.max(0, k - 1); // weathering
    set(img, x, y, rgb(hex(base[k]!)));
  }
  for (let i = 0; i < 3; i++) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb(hex('#5a6a3a'))); // moss
  if (ridge) {
    rect(img, 0, 0, T, 3, rgb(hex('#6a2c1a')));
    for (let x = 0; x < T; x += 4) (set(img, x, 1, rgb(hex('#c86a40'))), set(img, x + 1, 1, rgb(hex('#c86a40'))));
  }
  return img;
}

/** Eaves along a roof's south edge (a rim strip): rounded tile ends, a dark soffit and the shadow
 *  they cast on the wall below. Drawn by the renderer at the top of the wall face. */
function eavesRim(): Image {
  const img = blank(T, T);
  for (let x = 0; x < T; x++) {
    const end = x % 4;
    set(img, x, 0, rgb(hex(end === 3 ? '#5a2418' : '#b85a34')));
    set(img, x, 1, rgb(hex(end === 0 ? '#d27a4a' : end === 3 ? '#3a160e' : '#9a4428')));
    set(img, x, 2, rgb(hex(end === 1 || end === 2 ? '#7a3420' : '#3a160e')));
    set(img, x, 3, rgb('out'));
    set(img, x, 4, rgb(hex('#000000')), 110);
    if ((x + 1) % 2) set(img, x, 5, rgb(hex('#000000')), 60);
  }
  return img;
}

/** Stair face for walkable one-level steps: treads every 3 rows (two steps per level), so the drop
 *  reads as "you can go up here" instead of a wall. Kinds: cut stone, wood, earth with log risers, rock. */
function stairFace(kind: 'stone' | 'wood' | 'earth' | 'rock'): Image {
  const img = blank(T, T);
  const r = rng({ stone: 81, wood: 82, earth: 83, rock: 84 }[kind]);
  const pal = {
    stone: ['#3e3432', '#6a5852', '#aa8d7a', '#d3bfa9'],
    wood: ['#2c1d1b', '#4a2e27', '#7d5536', '#a8784a'],
    earth: ['#3a2a1e', '#5a4030', '#7d5536', '#a8784a'],
    rock: ['#2e2a2a', '#4e4846', '#7a726c', '#a8a098'],
  }[kind];
  for (let y = 0; y < T; y++) {
    const step = y % 3; // 0: tread nose (lit), 1: riser, 2: riser in shadow
    for (let x = 0; x < T; x++) {
      let k = step === 0 ? 3 : step === 1 ? 2 : 1;
      if (kind === 'earth' && step !== 0) k = step === 1 ? 2 : 1; // log risers
      if (kind === 'rock' && r() < 0.18) k = Math.max(0, k - 1);
      if (kind === 'stone' && step !== 0 && (x + Math.floor(y / 3) * 5) % 8 === 0) k = 0; // joints
      if (kind === 'wood' && step === 0 && x % 8 === 3) k = 1; // nails / plank ends
      set(img, x, y, rgb(hex(pal[k]!)));
    }
    if (step === 2) for (let x = 0; x < T; x++) if (kind !== 'rock' || r() < 0.8) set(img, x, y, rgb(hex(pal[0]!)));
  }
  if (kind === 'earth') for (let y = 1; y < T; y += 3) for (const x of [0, 15]) set(img, x, y, rgb(hex(pal[0]!))); // stake ends
  return img;
}

/** Rough stone masonry face (village walls, the abbey's outer walls). */
function masonryFace(): Image {
  const img = blank(T, T);
  const r = rng(61);
  rect(img, 0, 0, T, T, rgb(hex(EXT.mud[3])));
  for (let row = 0; row < 4; row++) {
    let x = row % 2 ? -3 : 0;
    while (x < T) {
      const w = 4 + Math.floor(r() * 3);
      const k = r() < 0.5 ? EXT.rock[3] : EXT.rock[2];
      for (let yy = row * 4; yy < row * 4 + 3; yy++) for (let xx = x; xx < x + w - 1; xx++) set(img, (xx + T) % T, yy, rgb(hex(k)));
      set(img, (x + T) % T, row * 4, rgb(hex(EXT.rock[4])));
      x += w;
    }
  }
  rect(img, 0, 0, T, 1, rgb(hex(EXT.rock[4])));
  return img;
}

/** Wooden fence seen from above: two rails and three posts across the tile over scrub. */
function fenceTop(ground: Image): Image {
  const img = blank(T, T);
  blit(img, ground, 0, 0);
  rect(img, 0, 6, T, 1, rgb('w2'));
  rect(img, 0, 9, T, 1, rgb('w1'));
  for (const x of [1, 7, 13]) ascii(img, x, 5, ['kk', 'WW', 'Ww', 'Ww', 'ww', 'kk'], { k: 'out', W: 'w3', w: 'w1' });
  return img;
}

/** Fence face: grey weathered planks with a dark gap between them. */
function fenceFace(): Image {
  const img = blank(T, T);
  rect(img, 0, 0, T, T, rgb('void'));
  for (let x = 0; x < T; x += 4) (rect(img, x, 1, 3, T - 1, rgb(hex('#5a5048'))), rect(img, x, 1, 1, T - 1, rgb(hex('#746a5e'))));
  rect(img, 0, 4, T, 1, rgb('w1'));
  rect(img, 0, 11, T, 1, rgb('w1'));
  return img;
}

/** The river Lloro: grey water clouded by the silver tailings, slow ripples. */
function river(seed: number, frame: number): Image {
  const n = valueNoiseLocal(seed, 6);
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = n(x + frame, y);
    set(img, x, y, rgb(hex(v > 0.7 ? EXT.river[3] : v > 0.42 ? EXT.river[2] : EXT.river[1])));
    if ((x + y * 3 + frame * 2) % 13 === 0 && v > 0.45) set(img, x, y, rgb(hex(EXT.river[4])));
  }
  return img;
}

/** River bank: mud with the water lapping along the north edge. */
function riverBank(seed: number, waterSide: 'n' | 'e' | 'w' | 's' = 'n'): Image {
  const img = mud(seed);
  const r = rng(seed + 5);
  for (let i = 0; i < T; i++) {
    const h = 3 + Math.floor(r() * 2);
    for (let d = 0; d < h; d++) {
      const [x, y] = waterSide === 'n' ? [i, d] : waterSide === 's' ? [i, T - 1 - d] : waterSide === 'w' ? [d, i] : [T - 1 - d, i];
      set(img, x, y, rgb(hex(d === h - 1 ? EXT.river[4] : EXT.river[2])));
    }
  }
  return img;
}

/** Slag heap ground: granular dark cinders with rusty and silvery glints. */
function slagHeap(seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = r();
    set(img, x, y, rgb(hex(v > 0.85 ? '#4a4240' : v > 0.5 ? '#2e2a2a' : v > 0.2 ? '#262222' : '#1a1818')));
  }
  for (let i = 0; i < 5; i++) set(img, Math.floor(r() * T), Math.floor(r() * T), rgb(hex(r() < 0.5 ? '#6a4030' : '#8a90a0')));
  return img;
}

/**
 * Blend fringe: the terrain's own texture cut to a ragged band along one side of the tile (or a
 * ragged blob in one corner), with a darker lip where it ends. Drawn by the renderer over a
 * lower-priority neighbour: edges.n is the fringe along that tile's north edge.
 */
type Side = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
function fringe(src: Image, side: Side, seed: number): Image {
  const r = rng(seed);
  const img = blank(T, T);
  const depth = Array.from({ length: T }, () => 2 + Math.floor(r() * 3));
  for (let i = 1; i < T - 1; i++) depth[i] = Math.round((depth[i - 1]! + depth[i]! * 2 + depth[i + 1]!) / 4);
  const keep = (x: number, y: number): boolean => {
    switch (side) {
      case 'n': return y < depth[x]!;
      case 's': return T - 1 - y < depth[x]!;
      case 'w': return x < depth[y]!;
      case 'e': return T - 1 - x < depth[y]!;
      default: {
        const cx = side.includes('e') ? T - 1 : 0, cy = side.includes('n') ? 0 : T - 1;
        return Math.hypot(x - cx, y - cy) < 3.5 + depth[(x + y) % T]! * 0.4;
      }
    }
  };
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (keep(x, y)) {
    const c = get(src, x, y);
    if (c) set(img, x, y, c);
  }
  // Darker lip along the fringe's inner border.
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!get(img, x, y)) continue;
    const border = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const xx = x + dx!, yy = y + dy!;
      return xx >= 0 && yy >= 0 && xx < T && yy < T && !get(img, xx, yy);
    });
    if (border) {
      const c = get(img, x, y)!;
      set(img, x, y, [Math.round(c[0] * 0.65), Math.round(c[1] * 0.65), Math.round(c[2] * 0.65)]);
    }
  }
  return img;
}

function blendSet(name: string, src: Image, seed: number): [string, Image][] {
  return (['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as Side[]).map((side, i) => [`${name}_blend_${side}`, fringe(src, side, seed + i)]);
}

/** Tileable smooth value noise (local copy so this file only depends on pixel.ts helpers). */
function valueNoiseLocal(seed: number, cell: number): (x: number, y: number) => number {
  const nCells = Math.round(T / cell);
  const r = rng(seed * 7 + 3);
  const grid = Array.from({ length: nCells * nCells }, () => r());
  const g = (i: number, j: number) => grid[(((j % nCells) + nCells) % nCells) * nCells + (((i % nCells) + nCells) % nCells)]!;
  return (x, y) => {
    const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g(i, j) + (g(i + 1, j) - g(i, j)) * sx, b = g(i, j + 1) + (g(i + 1, j + 1) - g(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Dark outline around everything opaque (props drawn without one). */
function outlined(img: Image): Image {
  const out = blank(img.width, img.height);
  img.data.copy(out.data);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (get(img, x, y)) continue;
    if (get(img, x + 1, y) || get(img, x - 1, y) || get(img, x, y + 1) || get(img, x, y - 1)) set(out, x, y, rgb('out'));
  }
  return out;
}

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

/** Small flame (3 frames) for candles and lamps: 3x4 at (x, y) top-left. */
function smallFlame(img: Image, x: number, y: number, frame: number): void {
  const f = [['.Y.', 'yYy', 'oyo', '.r.'], ['Y..', 'yY.', 'oyo', '.r.'], ['..Y', '.Yy', 'oyo', '.r.']][frame % 3]!;
  ascii(img, x, y, f, { Y: 'f5', y: 'f4', o: 'f3', r: 'f2' });
}

/** Cluster of tallow candles on the floor (chapel, crypt): three heights, wax drips. */
function candles(frame: number): Image {
  const img = blank(T, T);
  ascii(img, 0, 6, [
    '................',
    '.....##.........',
    '....#WW#..##....',
    '....#Ww#.#WW#...',
    '..##.Ww#.#Ww#...',
    '.#WW#Ww#.#Ww#...',
    '.#Ww#Ww#.#Ww#...',
    '.#Ww#WwW##Wwd#..',
    '.#WwddwddWWwdd#.',
    '..#dddddddddd#..',
  ], { '#': 'out', W: 's3', w: 'd3', d: 'd2' });
  smallFlame(img, 5, 3, frame);
  smallFlame(img, 10, 4, frame + 1);
  smallFlame(img, 1, 7, frame + 2);
  return img;
}

/** Oil lamp (candil) hanging from the arm of its own wooden post, so it stands anywhere. */
function oilLamp(frame: number): Image {
  const img = blank(T, T);
  ascii(img, 0, 0, [
    '...##########...',
    '..#wWWWWWWWWi#..',
    '..#Ww#####.#i#..',
    '..#Ww#.....#i#..',
    '..#Ww#.........',
    '..#Ww#....#gg#..',
    '..#Ww#...#gGGg#.',
    '..#Ww#....#gg#..',
    '..#Ww#.....##...',
    '..#Ww#..........',
    '..#Ww#..........',
    '..#Ww#..........',
    '..#Ww#..........',
    '.#wWWw#.........',
    '#wwWWww#........',
    '########........',
  ], { '#': 'out', W: 'w3', w: 'w1', i: 'i1', g: 'gr1', G: 'gr3' });
  smallFlame(img, 8, 3, frame);
  return img;
}

/** Iron lantern with horn panes standing on the ground (or a crate). */
function lantern(frame: number): Image {
  const img = blank(T, T);
  ascii(img, 0, 2, [
    '......####......',
    '.....#i..i#.....',
    '.....######.....',
    '....#IiiiiI#....',
    '....#iHHHHi#....',
    '....#iHhhHi#....',
    '....#iHhhHi#....',
    '....#iHHHHi#....',
    '....#IiiiiI#....',
    '.....#dddd#.....',
    '......####......',
  ], { '#': 'out', i: 'i1', I: 'i2', d: 'i0', H: frame === 1 ? 'f3' : 'f2', h: frame === 2 ? 'f4' : 'f5' });
  return img;
}

/** Wall lever on a stone plate: bigger and brighter than 0x72's so it reads as usable. 0 up, 1 middle, 2 down. */
function leverArt(pos: 0 | 1 | 2): Image {
  const img = blank(T, T);
  ascii(img, 0, 9, [
    '...##########...',
    '..#SsssssssSS#..',
    '..#sd######dS#..',
    '..#sssssssssS#..',
    '..#dddddddddd#..',
    '...##########...',
  ], { '#': 'out', S: 's3', s: 's2', d: 's1' });
  const handle = [
    ['.#RR#...........', '#RrRR#..........', '#RRR#...........', '.#I#............', '..#I#...........', '...#I#..........', '....#I#.........', '.....#I#........', '......##........'],
    ['.......#RR#.....', '......#RrRR#....', '......#RRR#.....', '.......#I#......', '.......#I#......', '.......#I#......', '.......#I#......', '.......#I#......', '.......##.......'],
    ['...........#RR#.', '..........#RrRR#', '...........#RRR#', '............#I#.', '...........#I#..', '..........#I#...', '.........#I#....', '........#I#.....', '........##......'],
  ][pos]!;
  ascii(img, pos === 0 ? 2 : pos === 2 ? -2 : 0, 2, handle, { '#': 'out', R: 'b3', r: 'f4', I: 'i2' });
  return img;
}

/** Faction foot ring (16x7, drawn under the feet): an ellipse outline with corner ticks; allies get a
 *  dashed ring so they read apart from the party at a glance, enemies a heavier ring. */
function factionRing(hex: string, style: 'solid' | 'dashed' | 'heavy'): Image {
  const img = blank(T, 7);
  const c = hexToRgb(hex), dark = hexToRgb(hex).map((v) => Math.round(v * 0.55)) as Rgb;
  for (let y = 0; y < 7; y++) for (let x = 0; x < T; x++) {
    const d = Math.hypot((x - 7.5) / 7.2, (y - 3) / 3.2);
    if (d > 1.05 || d < (style === 'heavy' ? 0.62 : 0.78)) continue;
    if (style === 'dashed' && Math.floor((Math.atan2(y - 3, x - 7.5) + Math.PI) / (Math.PI / 6)) % 2 === 1) continue;
    set(img, x, y, d > 0.95 ? dark : c, 220);
  }
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

const scrubTile = scrub(231);
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
  ['wall_top_1', wallTop(3)],
  ['wall_top_2', wallTop(8)],
  ['stone_face_lip', withLip(wallMid, ['s1', 's2', 's3'])],
  ['dirt_face', withLip(rampRecolour(crop(ninjaRelief, 5 * T, 6 * T, T, T), ['ink', 'out', 's0', 'd0', 'd1']), ['d0', 'd2', 'd3'])],
  ['slag_face', withLip(rampRecolour(crop(ninjaRelief, 5 * T, 1 * T, T, T), ['void', 'ink', 'cap', 'i0', 's0']), ['i0', 's0', 's1'])],
  ['rim_stone', rim(['s1', 's2', 's3'])],
  ['rim_dirt', rim(['d0', 'd2', 'd3'])],
  ['rim_wood', rim(['w2', 'w3', 'w4'])],
  ['door_closed_top', doorTop()],
  ['door_closed_face', doorFace()],
  ['door_open_top', doorOpenTop(crop(atlas, list.floor_1!.x, list.floor_1!.y, T, T))],
  ['door_open_face', doorOpenFace()],
  ['rails_h_1', rails(false, 1)],
  ['rails_h_2', rails(false, 2)],
  ['rails_v_1', rails(true, 3)],
  ['vault_1', vaultFloor(11)],
  ['vault_2', vaultFloor(12)],
  ['vault_3', vaultFloor(13)],
  ['vault_face', vaultFace()],
  // Exteriors
  ['scrub_1', scrubTile],
  ['scrub_2', scrub(232)],
  ['scrub_3', scrub(233)],
  ['scrub_4', scrub(234)],
  ['road_1', road(201, false)],
  ['road_2', road(202, false)],
  ['road_v_1', road(203, true)],
  ['road_v_2', road(204, true)],
  ['mud_1', mud(205)],
  ['mud_2', mud(206)],
  ['rock_1', rockTop(207)],
  ['rock_2', rockTop(208)],
  ['rock_face', withLip(rampRecolour(crop(ninjaRelief, 5 * T, 6 * T, T, T), ['ink', 'out', 'cap', 's0', 'i0']), ['i0', 's0', 's1'])],
  ['earth_face', withLip(rampRecolour(crop(ninjaRelief, 5 * T, 6 * T, T, T), ['ink', 'out', 'w0', 'w1', 's0']), ['w1', 's0', 'd0'])],
  ['cobble_1', cobbles(211)],
  ['cobble_2', cobbles(212)],
  ['cobble_3', cobbles(213)],
  ['roof_1', slateRoof(214)],
  ['roof_2', slateRoof(215)],
  ['roof_clay_1', clayRoof(216, false)],
  ['roof_clay_2', clayRoof(217, false)],
  ['rim_eaves', eavesRim()],
  ['stair_stone', stairFace('stone')],
  ['stair_wood', stairFace('wood')],
  ['stair_earth', stairFace('earth')],
  ['stair_rock', stairFace('rock')],
  ['timber_face', timberFace(false)],
  ['timber_face_window', timberFace(true)],
  ['masonry_face', masonryFace()],
  ['fence_top', fenceTop(scrubTile)],
  ['fence_face', fenceFace()],
  ['river_1', river(221, 0)],
  ['river_2', river(222, 2)],
  ['riverbank_1', riverBank(223)],
  ['riverbank_2', riverBank(224)],
  ['riverbank_w_1', riverBank(241, 'w')],
  ['riverbank_w_2', riverBank(242, 'w')],
  ['riverbank_e_1', riverBank(243, 'e')],
  ['riverbank_e_2', riverBank(244, 'e')],
  ['riverbank_s_1', riverBank(245, 's')],
  ['slag_heap_1', slagHeap(225)],
  ['slag_heap_2', slagHeap(226)],
  ['slag_heap_3', slagHeap(227)],
  // Blend fringes (terrain.blend): each blending terrain spilling onto a lower-priority neighbour.
  ...blendSet('scrub', scrubTile, 301),
  ...blendSet('mud', mud(205), 311),
  ...blendSet('slag_heap', slagHeap(225), 321),
  ...blendSet('cobble', cobbles(211), 331),
];
type Anchor = 'wall' | 'floor' | 'centre';
const props: Record<string, { frames: Image[]; note: string; anchor: Anchor; fps: number; loop: boolean; light?: string }> = {
  torch_wall: { frames: [0, 1, 2, 3].map(torch), note: 'Antorcha de pared', anchor: 'wall', fps: 8, loop: true, light: '#ffb060' },
  brazier: { frames: [0, 1, 2, 3].map(brazier), note: 'Brasero de hierro', anchor: 'floor', fps: 8, loop: true, light: '#ff9a4a' },
  candles: { frames: [0, 1, 2].map(candles), note: 'Velas en el suelo (capilla, cripta)', anchor: 'floor', fps: 6, loop: true, light: '#ffc070' },
  oil_lamp: { frames: [0, 1, 2].map(oilLamp), note: 'Candil colgado del brazo de su poste', anchor: 'floor', fps: 6, loop: true, light: '#ffb050' },
  exit_open: { frames: [0, 1, 2, 3].map((f) => markers.exitOpen(f, '#f4d878', '#a8873a')), note: 'Salida abierta (gira hacia el borde)', anchor: 'centre', fps: 6, loop: true, light: '#f4d878' },
  exit_closed: { frames: [markers.exitClosed()], note: 'Salida cerrada', anchor: 'centre', fps: 0, loop: false },
  marker_party: { frames: [factionRing('#e8c070', 'solid')], note: 'Aro bajo los pies: grupo', anchor: 'floor', fps: 0, loop: false },
  marker_ally: { frames: [factionRing('#6ad0a0', 'dashed')], note: 'Aro bajo los pies: aliado que lucha por el grupo (IA)', anchor: 'floor', fps: 0, loop: false },
  marker_enemy: { frames: [factionRing('#d04a3a', 'heavy')], note: 'Aro bajo los pies: enemigo', anchor: 'floor', fps: 0, loop: false },
  marker_neutral: { frames: [factionRing('#9a9aa8', 'dashed')], note: 'Aro bajo los pies: neutral', anchor: 'floor', fps: 0, loop: false },
  lantern: { frames: [0, 1, 2].map(lantern), note: 'Farol de hierro en el suelo', anchor: 'floor', fps: 5, loop: true, light: '#ffb050' },
  blood_1: { frames: [bloodSplat(1)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  blood_2: { frames: [bloodSplat(7)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  blood_3: { frames: [bloodSplat(13)], note: 'Mancha de sangre (decal)', anchor: 'floor', fps: 0, loop: false },
  fx_hit_spark: { frames: [0, 1, 2, 3].map(hitSpark), note: 'Chispa de impacto', anchor: 'centre', fps: 20, loop: false },
  fx_dust: { frames: [0, 1, 2, 3, 4].map(dustPuff), note: 'Polvareda (pasos, caídas)', anchor: 'floor', fps: 12, loop: false },
  fx_explosion: { frames: env.explosion(), note: 'Explosión (32x32, centrada)', anchor: 'centre', fps: 14, loop: false, light: '#ffb060' },
  fx_steam: { frames: env.steam(), note: 'Vapor (agua y fuego)', anchor: 'floor', fps: 10, loop: false },
  // Spell VFX (spell-fx.ts). Projectiles point right; see docs/ART_CATALOG.md for how each is played.
  fx_firebolt: { frames: [0, 1, 2, 3].map((f) => fx.bolt(fx.FIRE, f)), note: 'Proyectil de rayo de fuego', anchor: 'centre', fps: 16, loop: true, light: '#ffb060' },
  fx_firebolt_impact: { frames: fx.burst(fx.FIRE, 16, 6, 700, { sparks: 5, smoke: true }), note: 'Impacto de fuego', anchor: 'centre', fps: 16, loop: false, light: '#ffb060' },
  fx_ray_of_frost: { frames: [0, 1, 2].map(fx.frostBeam), note: 'Tramo de rayo de escarcha (se repite en horizontal)', anchor: 'centre', fps: 12, loop: true, light: '#a0d8ff' },
  fx_frost_impact: { frames: fx.frostImpact(), note: 'Impacto de escarcha', anchor: 'centre', fps: 14, loop: false, light: '#a0d8ff' },
  fx_shocking_grasp: { frames: [0, 1, 2, 3, 4].map(fx.shock), note: 'Chispazo de agarre electrizante', anchor: 'centre', fps: 18, loop: false, light: '#a0e8ff' },
  fx_magic_missile: { frames: [0, 1, 2].map(fx.dart), note: 'Dardo de proyectil mágico', anchor: 'centre', fps: 14, loop: true, light: '#b080ff' },
  fx_magic_missile_impact: { frames: fx.burst(fx.ARCANE, 16, 4, 710, { sparks: 4 }), note: 'Impacto de dardo', anchor: 'centre', fps: 16, loop: false, light: '#b080ff' },
  fx_burning_hands: { frames: [0, 1, 2, 3, 4, 5].map((f) => fx.flameTile(f)), note: 'Llamarada por casilla del cono', anchor: 'floor', fps: 14, loop: false, light: '#ffb060' },
  fx_thunderwave: { frames: fx.ring(fx.FROST, 48, 6, { ripple: true }), note: 'Onda atronadora (48x48, 3x3 casillas)', anchor: 'centre', fps: 16, loop: false, light: '#c4dce6' },
  fx_fireball_bead: { frames: [0, 1, 2, 3].map((f) => fx.bolt(fx.FIRE, f, { head: 1.8, len: 6 })), note: 'Cuenta de bola de fuego (vuela)', anchor: 'centre', fps: 16, loop: true, light: '#ffb060' },
  fx_fireball: { frames: fx.burst(fx.FIRE, 64, 7, 720, { sparks: 14, smoke: true }), note: 'Estallido de bola de fuego (64x64)', anchor: 'centre', fps: 14, loop: false, light: '#ffb060' },
  fx_guiding_bolt: { frames: [0, 1, 2, 3].map((f) => fx.bolt(fx.RADIANT, f, { head: 3, len: 11 })), note: 'Proyectil de saeta guía', anchor: 'centre', fps: 16, loop: true, light: '#fff0b0' },
  fx_guiding_bolt_impact: { frames: fx.burst(fx.RADIANT, 16, 6, 730, { sparks: 6 }), note: 'Impacto radiante', anchor: 'centre', fps: 14, loop: false, light: '#fff0b0' },
  fx_sacred_flame: { frames: [0, 1, 2, 3, 4, 5].map(fx.sacredFlame), note: 'Llama sagrada (16x32, cae sobre el objetivo)', anchor: 'floor', fps: 12, loop: false, light: '#fff0b0' },
  fx_healing: { frames: [0, 1, 2, 3, 4, 5].map(fx.healing), note: 'Curación (16x24)', anchor: 'floor', fps: 10, loop: false, light: '#a0ffb0' },
  fx_bless: { frames: [0, 1, 2, 3].map(fx.bless), note: 'Bendición (aura en bucle mientras dura)', anchor: 'floor', fps: 6, loop: true },
  fx_turn_undead: { frames: fx.ring(fx.RADIANT, 64, 6, { spokes: 12 }), note: 'Expulsar muertos vivientes (64x64)', anchor: 'centre', fps: 12, loop: false, light: '#fff0b0' },
  fx_holy_symbol: { frames: [0, 1, 2, 3, 4, 5].map(fx.holySymbol), note: 'Destello del símbolo sagrado (sobre el lanzador)', anchor: 'centre', fps: 12, loop: false, light: '#fff0b0' },
  trap_armed: { frames: [3, 3, 3, 2].map((f) => trapFrame(atlas, list, f)), note: 'Trampa visible armada (pinchos fuera)', anchor: 'floor', fps: 4, loop: true },
  trap_disarmed: { frames: [trapFrame(atlas, list, 0, true)], note: 'Trampa desarmada (pinchos retraídos, apagada)', anchor: 'floor', fps: 0, loop: false },
  tapestry: { frames: [tapestry(false)], note: 'Tapiz con el escudo de los Mazo', anchor: 'wall', fps: 0, loop: false },
  tapestry_crossbow: { frames: [tapestry(true)], note: 'Tapiz con una ballesta escondida detrás (asoma la punta)', anchor: 'wall', fps: 0, loop: false },
  gallows: { frames: [gallows()], note: 'Horca de la Torre del Cepo', anchor: 'floor', fps: 0, loop: false },
  campfire: { frames: [0, 1, 2, 3].map(campfire), note: 'Hoguera de campamento', anchor: 'floor', fps: 8, loop: true, light: '#ff9a4a' },
  oil_cart: { frames: [oilCart()], note: 'Carro de aceite de los Sinpaga (32x20)', anchor: 'floor', fps: 0, loop: false },
  well: { frames: [well()], note: 'Pozo del Ahorcado', anchor: 'floor', fps: 0, loop: false },
  trap_beartrap: { frames: [bearTrap(true)], note: 'Cepo armado', anchor: 'floor', fps: 0, loop: false },
  trap_beartrap_disarmed: { frames: [bearTrap(false)], note: 'Cepo cerrado y desarmado', anchor: 'floor', fps: 0, loop: false },
  trap_tripwire: { frames: [tripwire()], note: 'Cuerda trampa (detectada)', anchor: 'floor', fps: 0, loop: false },
  trap_dart: { frames: [dartPlate()], note: 'Placa de dardo envenenado (detectada)', anchor: 'floor', fps: 0, loop: false },
  trap_rotten_plank: { frames: [rottenPlank()], note: 'Tablón podrido de la pasarela (detectado)', anchor: 'floor', fps: 0, loop: false },
  fuse_charges: { frames: [fuseCharges()], note: 'La mecha de Garrán: cargas contra la roca y la mecha enrollada', anchor: 'floor', fps: 0, loop: false },
  remains_forty: { frames: [remainsForty()], note: 'Restos de los cuarenta: huesos, casco, pico roto y la nómina del barón', anchor: 'floor', fps: 0, loop: false },
  pulley: { frames: [pulley()], note: 'Polea y cadenas con el cubo de mineral (16x32)', anchor: 'wall', fps: 0, loop: false },
  inscription: { frames: [inscription()], note: 'Inscripción élfica tallada en la Bóveda', anchor: 'wall', fps: 0, loop: false, light: '#8ab0e8' },
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
/** Objects (manifest 'sprites', kind 'frames'): animations by name (idle, broken...). */
const objects: Record<string, Record<string, Image[]>> = {
  barrel: { idle: [env.barrel()], broken: [env.barrelBroken()] },
  barrel_oil: { idle: [env.barrelOil()], broken: [env.barrelOilBroken()] },
  crate: { idle: [crate0x72], broken: [env.crateBroken()] },
  mine_wagon: { idle: [mineWagon('empty')], broken: [mineWagon('broken')] },
  mine_wagon_ore: { idle: [mineWagon('ore')], broken: [mineWagon('broken')] },
  powder_keg: { idle: [powderKeg(false)], broken: [powderKeg(true)] },
  resonator: { idle: [0, 1, 2, 3].map((f) => resonator(f)), broken: [resonator('broken')] },
  lever: { idle: [leverArt(0)], up: [leverArt(0)], down: [leverArt(2)], pull: [leverArt(0), leverArt(1), leverArt(2)] },
};

// Sheet: one row per group of frames; each row as tall as its tallest frame.
type Row = { name: string; frames: Image[] };
const rows: Row[] = [
  ...tiles.map(([name, img]) => ({ name, frames: [img] })),
  ...Object.entries(props).map(([name, p]) => ({ name, frames: p.frames })),
  ...Object.entries(surfaces).map(([name, s]) => ({ name: `surface_${name}`, frames: s.frames })),
  ...Object.entries(objects).map(([name, o]) => ({ name: `object_${name}`, frames: Object.values(o).flat() })),
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
for (const [id, o] of Object.entries(objects)) {
  const rects = layout.get(`object_${id}`)!;
  let i = 0;
  const animations = Object.fromEntries(Object.entries(o).map(([a, imgs]) => [a, imgs.map(() => rects[i++]!)]));
  manifest.sprites[id] = { kind: 'frames', url, facing: 'right', animations };
}
applyFxTable(manifest, gameDir, preset);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${preset} extra art: ${tiles.length} tiles, ${Object.keys(props).length} props, ${Object.keys(surfaces).length} surfaces, ${Object.keys(objects).length} objects -> art-src/generated/${base}.png`);
