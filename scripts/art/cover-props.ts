// Tactical cover props for Intereses (0x72 palette): carts, a market stall, sacks, rubble, broken
// pillars, dead trees, ore piles, tombstones and sarcophagi, plus the low wall and balcony tiles.
// Every prop is drawn standing on the bottom row of its image (anchor 'floor') with a dark outline
// and a contact shadow, so it reads as a solid obstacle at phone size. Used by build-extra-art.ts.
import { type Image, blank } from './png.ts';
import { type Rgb, hexToRgb } from './color.ts';
import { T, bayer, get, rgb, rng, set, valueNoise } from './pixel.ts';

const OUT: Rgb = hexToRgb('#222222');
const h = (hex: string): Rgb => hexToRgb(hex);

function fillRect(img: Image, x: number, y: number, w: number, hgt: number, c: Rgb): void {
  for (let yy = y; yy < y + hgt; yy++) for (let xx = x; xx < x + w; xx++) set(img, xx, yy, c);
}
function disc(img: Image, cx: number, cy: number, rx: number, ry: number, c: Rgb): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(img, x, y, c);
  }
}
function lineTo(img: Image, x0: number, y0: number, x1: number, y1: number, c: Rgb): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) set(img, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

/** Outline everything opaque, then lay a soft contact shadow on the ground row under it. */
function finish(img: Image, shadow = true): Image {
  const out = blank(img.width, img.height);
  img.data.copy(out.data);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (get(img, x, y)) continue;
    if (get(img, x + 1, y) || get(img, x - 1, y) || get(img, x, y + 1) || get(img, x, y - 1)) set(out, x, y, OUT);
  }
  if (shadow) {
    const yb = img.height - 1;
    let x0 = img.width, x1 = -1;
    for (let x = 0; x < img.width; x++) for (let y = img.height - 4; y < img.height; y++) if (get(out, x, y)) (x0 = Math.min(x0, x), x1 = Math.max(x1, x));
    for (let x = x0 - 1; x <= x1 + 1; x++) if (!get(out, x, yb)) set(out, x, yb, h('#000000'), 110);
  }
  return out;
}

// --- Cover ---------------------------------------------------------------------------------------

/** Two-wheeled wooden cart with a load of sacks or hay (32x16). */
export function cart(load: 'hay' | 'sacks'): Image {
  const img = blank(32, 16);
  // Shafts to the left.
  lineTo(img, 0, 8, 6, 9, rgb('w2'));
  lineTo(img, 0, 9, 6, 10, rgb('w1'));
  // Load.
  if (load === 'hay') {
    const n = valueNoise(301, 32, 3);
    for (let y = 1; y < 6; y++) for (let x = 7; x < 30; x++) {
      if (y === 1 && (x < 9 || x > 27)) continue;
      set(img, x, y, rgb(n(x, y) > 0.6 ? 'gr3' : n(x, y) > 0.35 ? 'gr2' : 'gr1'));
    }
  } else {
    for (const [cx, cy] of [[11, 4], [17, 3], [23, 4], [27, 4]]) {
      disc(img, cx!, cy!, 3, 2.5, rgb('d2'));
      set(img, cx! - 1, cy! - 1, rgb('d3'));
      set(img, cx!, cy! - 2, rgb('d1'));
    }
  }
  // Bed: planks with dark seams.
  fillRect(img, 6, 6, 25, 5, rgb('w3'));
  for (let x = 6; x < 31; x++) (set(img, x, 6, rgb('w4')), set(img, x, 10, rgb('w1')));
  for (const x of [12, 19, 26]) for (let y = 7; y < 10; y++) set(img, x, y, rgb('w1'));
  // Wheels.
  for (const cx of [10, 24]) {
    disc(img, cx, 12, 3.6, 3.6, rgb('w1'));
    disc(img, cx, 12, 2.4, 2.4, rgb('w2'));
    for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) set(img, cx + dx!, 12 + dy!, rgb('w1'));
    set(img, cx, 12, rgb('i2'));
  }
  return finish(img);
}

/** Market stall (16x24): grimy striped awning on two posts, a counter with goods. */
export function marketStall(): Image {
  const img = blank(T, 24);
  for (let x = 0; x < T; x++) for (let y = 1; y < 6; y++) set(img, x, y, rgb(Math.floor(x / 3) % 2 ? 's3' : 'b2'));
  for (let x = 0; x < T; x += 3) set(img, x + 1, 6, rgb('b2'));
  for (const x of [1, 14]) for (let y = 6; y < 22; y++) set(img, x, y, rgb('w2'));
  fillRect(img, 0, 14, T, 7, rgb('w3'));
  for (let x = 0; x < T; x++) (set(img, x, 14, rgb('w4')), set(img, x, 20, rgb('w1')));
  for (const x of [5, 10]) for (let y = 15; y < 20; y++) set(img, x, y, rgb('w1'));
  // Goods: cabbages, a jug, loaves.
  disc(img, 4, 12, 1.6, 1.4, rgb('#5a7a3a'));
  disc(img, 7, 12, 1.6, 1.4, rgb('#6a8a44'));
  fillRect(img, 10, 10, 2, 4, rgb('f1'));
  disc(img, 13, 13, 1.6, 1, rgb('d3'));
  return finish(img);
}

/** A heap of three burlap sacks (16x16), one tied at the top. */
export function sacks(): Image {
  const img = blank(T, T);
  // Dark burlap, so the heap stands out from dirt and cobbles.
  for (const [cx, cy, rx, ry] of [[4.5, 11, 4.4, 4], [11.5, 11, 4.4, 4], [8, 5.5, 4.2, 4]] as const) {
    disc(img, cx, cy, rx, ry, rgb('w1'));
    disc(img, cx - 1, cy - 1, rx - 1.4, ry - 1.4, rgb('w2'));
    set(img, cx - 2, cy - 2, rgb('w3'));
    for (let x = Math.round(cx - rx + 2); x < cx + rx - 1; x += 2) set(img, x, Math.round(cy + 1), rgb('w0'));
  }
  set(img, 8, 1, rgb('w0'));
  set(img, 7, 2, rgb('w0'));
  set(img, 9, 2, rgb('w0'));
  set(img, 8, 2, rgb('gr2'));
  return finish(img);
}

/** Pile of broken masonry (16x16), three variants. */
export function rubblePile(seed: number): Image {
  const img = blank(T, T);
  const r = rng(320 + seed);
  // A dark mound of broken mortar under the blocks, so the pile has mass at phone size.
  const peak = 3 + Math.floor(r() * 3);
  for (let y = peak; y < 15; y++) for (let x = 0; x < T; x++) {
    if (Math.hypot((x - 7.5) / 7.8, (y - 15) / (15 - peak)) > 1) continue;
    set(img, x, y, rgb(r() < 0.25 ? 'i0' : 's0'));
  }
  for (let i = 0; i < 9; i++) {
    const w = 3 + Math.floor(r() * 3), hh = 2 + Math.floor(r() * 2);
    const x = 1 + Math.floor(r() * (14 - w));
    const y = Math.max(peak, 13 - hh - Math.floor(r() * (13 - peak - hh)));
    fillRect(img, x, y, w, hh, rgb(r() < 0.5 ? 's2' : 's1'));
    for (let xx = x; xx < x + w; xx++) set(img, xx, y, rgb('s3'));
    set(img, x + w - 1, y + hh - 1, rgb('s0'));
  }
  return finish(img);
}

/** Broken pillar (16x24): a fluted stub with a jagged top and a fallen drum beside it. */
export function pillarBroken(): Image {
  const img = blank(T, 24);
  const top = [6, 4, 5, 3, 6, 5, 7, 4];
  for (let x = 3; x < 11; x++) {
    for (let y = top[x - 3]!; y < 21; y++) set(img, x, y, rgb(x === 3 ? 's3' : x === 10 ? 's0' : x % 2 ? 's2' : 's1'));
    set(img, x, top[x - 3]!, rgb('s3'));
  }
  fillRect(img, 2, 20, 10, 2, rgb('s1'));
  for (let x = 2; x < 12; x++) set(img, x, 20, rgb('s3'));
  // Fallen drum.
  disc(img, 12.5, 19, 3, 2.5, rgb('s2'));
  disc(img, 13.5, 19, 1.6, 1.4, rgb('s1'));
  for (let i = 0; i < 3; i++) set(img, 5 + i * 2, 10 + i * 3, rgb('s0'));
  return finish(img);
}

/** Dead tree (24x32), three variants: a bare, twisted trunk with crooked branches. */
export function deadTree(seed: number): Image {
  const img = blank(24, 32);
  const r = rng(340 + seed);
  // Trunk, leaning a little.
  const lean = [-3, 2.5, 0.5][seed % 3]! + (r() - 0.5);
  for (let y = 10; y < 31; y++) {
    const t = (31 - y) / 21, cx = 11 + lean * t, w = 3.5 - t * 1.6;
    for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) set(img, x, y, rgb(x <= cx - w + 1 ? 'w3' : x >= cx + w - 1 ? 'w0' : 'w1'));
  }
  // Roots.
  lineTo(img, 7, 31, 10, 28, rgb('w1'));
  lineTo(img, 16, 31, 13, 28, rgb('w1'));
  // Branches: recursive forks.
  const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    lineTo(img, Math.round(x), Math.round(y), Math.round(x1), Math.round(y1), rgb(depth > 1 ? 'w1' : 'w2'));
    if (depth > 1) lineTo(img, Math.round(x) + 1, Math.round(y), Math.round(x1) + 1, Math.round(y1), rgb('w1'));
    if (depth <= 0) return;
    branch(x1, y1, ang - 0.5 - r() * 0.4, len * 0.65, depth - 1);
    branch(x1, y1, ang + 0.4 + r() * 0.4, len * 0.6, depth - 1);
  };
  // Each variant has its own crown: lopsided left, lopsided right, or a broken stump with one limb.
  if (seed % 3 === 1) {
    branch(11 + lean, 12, -Math.PI / 2 - 0.9, 8, 2);
    branch(11 + lean, 15, -Math.PI / 2 + 0.4, 4, 1);
  } else if (seed % 3 === 2) {
    branch(11 + lean, 12, -Math.PI / 2 + 0.8, 8, 2);
    branch(11 + lean, 14, -Math.PI / 2 - 0.5, 5, 1);
    branch(11 + lean, 11, -Math.PI / 2, 5, 1);
  } else {
    branch(11 + lean, 18, -Math.PI / 2 - 1.1, 7, 2);
    for (let x = 9; x < 15; x++) set(img, x, 10 + (x % 2), OUT); // snapped top
  }
  // A knot hole.
  set(img, Math.round(11 + lean * 0.5), 20, rgb('ink'));
  return finish(img);
}

/** Ore pile (16x16): dark broken rock with copper and silver glints. */
export function orePile(): Image {
  const img = blank(T, T);
  const r = rng(360);
  for (let y = 4; y < 15; y++) for (let x = 1; x < 15; x++) {
    const d = Math.hypot((x - 7.5) / 7, (y - 14) / 10);
    if (d > 1) continue;
    set(img, x, y, rgb(r() < 0.3 ? 'i0' : r() < 0.5 ? 's0' : 'cap'));
  }
  for (let i = 0; i < 6; i++) set(img, 3 + Math.floor(r() * 10), 7 + Math.floor(r() * 7), rgb(i % 2 ? 'f2' : 'i2'));
  set(img, 7, 5, rgb('s1'));
  set(img, 8, 5, rgb('s1'));
  return finish(img);
}

/** Tombstone (16x16): a rounded slab with a cross, leaning slightly, with weeds at its foot. */
export function tombstone(): Image {
  const img = blank(T, T);
  for (let y = 3; y < 14; y++) for (let x = 4; x < 12; x++) {
    if (y < 6 && Math.hypot(x - 7.5, y - 6) > 3.8) continue;
    set(img, x, y, rgb(x === 4 ? 's3' : x === 11 ? 's0' : 's2'));
  }
  for (let y = 6; y < 11; y++) set(img, 8, y, rgb('s0'));
  for (let x = 6; x < 11; x++) set(img, x, 7, rgb('s0'));
  for (const x of [3, 5, 11, 12]) set(img, x, 13, rgb('#4a5a34'));
  set(img, 4, 12, rgb('#5a6a3a'));
  return finish(img);
}

/** Crypt sarcophagus (16x24) seen from above at 3/4: a stone lid with an effigy, short front face. */
export function sarcophagus(): Image {
  const img = blank(T, 24);
  // Lid.
  for (let y = 2; y < 17; y++) for (let x = 2; x < 14; x++) set(img, x, y, rgb(x === 2 || y === 2 ? 's3' : x === 13 ? 's0' : 's2'));
  // Effigy: head, folded hands, feet.
  for (const [x, y, c] of [[7, 4, 's3'], [8, 4, 's3'], [7, 5, 's1'], [8, 5, 's1']] as const) set(img, x, y, rgb(c));
  for (let y = 6; y < 14; y++) (set(img, 6, y, rgb('s1')), set(img, 9, y, rgb('s1')));
  set(img, 7, 9, rgb('s3'));
  set(img, 8, 9, rgb('s3'));
  // Front face.
  for (let y = 17; y < 22; y++) for (let x = 2; x < 14; x++) set(img, x, y, rgb(y === 17 ? 's0' : 's1'));
  for (let x = 4; x < 12; x += 3) set(img, x, 19, rgb('s0'));
  return finish(img);
}

// --- Terrain tiles ---------------------------------------------------------------------------------

/** Low stone wall seen from above: big coping stones, light top edge (16x16, seamless across). */
export function lowWallTop(seed: number): Image {
  const img = blank(T, T);
  const r = rng(380 + seed);
  fillRect(img, 0, 0, T, T, rgb('s1'));
  let x = 0;
  while (x < T) {
    const w = 5 + Math.floor(r() * 3);
    for (let y = 2; y < 14; y++) for (let xx = x; xx < Math.min(T, x + w - 1); xx++) set(img, xx, y, rgb(y === 2 ? 's3' : y > 11 ? 's1' : 's2'));
    x += w;
  }
  for (let xx = 0; xx < T; xx++) (set(img, xx, 0, rgb('s0')), set(img, xx, 15, rgb('s0')));
  for (let i = 0; i < 4; i++) set(img, Math.floor(r() * T), 4 + Math.floor(r() * 8), rgb('#5a6a3a'));
  return img;
}

/** Low wall face: two courses of rough stones (the renderer shows only its top rows for height 1). */
export function lowWallFace(): Image {
  const img = blank(T, T);
  const r = rng(390);
  fillRect(img, 0, 0, T, T, rgb('s0'));
  for (let row = 0; row < 4; row++) {
    let x = row % 2 ? -3 : 0;
    while (x < T) {
      const w = 4 + Math.floor(r() * 3);
      for (let y = row * 4; y < row * 4 + 3; y++) for (let xx = x; xx < x + w - 1; xx++) set(img, (xx + T) % T, y, rgb(r() < 0.1 ? 's2' : 's1'));
      x += w;
    }
  }
  return img;
}

/** Balcony boards from above: planks running east-west, nail heads. */
export function balconyTop(seed: number): Image {
  const img = blank(T, T);
  const r = rng(400 + seed);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) set(img, x, y, rgb(y % 4 === 3 ? 'w1' : r() < 0.08 ? 'w2' : 'w3'));
  for (let y = 1; y < T; y += 4) (set(img, 2, y, rgb('i1')), set(img, 13, y, rgb('i1')));
  return img;
}

/** Balcony railing (a rim strip at the south edge): posts and a handrail, then the shadow under it. */
export function balconyRail(): Image {
  const img = blank(T, T);
  for (let x = 0; x < T; x++) {
    set(img, x, 0, rgb('w4'));
    set(img, x, 1, rgb('w1'));
    if (x % 4 === 1) for (let y = 2; y < 6; y++) set(img, x, y, rgb('w2'));
    set(img, x, 6, rgb('out'));
    if (bayer(x, 7) < 0.5) set(img, x, 7, h('#000000'), 90);
  }
  return img;
}

/** Balcony face: dark beams and brackets under the boards. */
export function balconyFace(): Image {
  const img = blank(T, T);
  fillRect(img, 0, 0, T, T, rgb('w0'));
  for (let x = 0; x < T; x++) (set(img, x, 0, rgb('w2')), set(img, x, 1, rgb('w1')));
  for (const x of [2, 13]) for (let y = 2; y < T; y++) set(img, x, y, rgb('w2'));
  for (let i = 0; i < 4; i++) (set(img, 3 + i, 2 + i, rgb('w2')), set(img, 12 - i, 2 + i, rgb('w2')));
  return img;
}
