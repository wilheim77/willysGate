// Tactical-environment art (Phase 3): surface overlays, barrels and crates, explosion
// and steam. Drawn pixel by pixel in 0x72's palette; used by build-extra-art.ts.
import { type Image, blank, blit } from './png.ts';
import { FLAMES, FLAME_LEGEND, type Key, T, ascii, bayer, rgb, rng, set, valueNoise } from './pixel.ts';

// --- Surfaces (16x16 overlays drawn over the floor) -----------------------------------

/** Ragged puddle mask covering most of the tile (0-2 px uneven border, rounded corners). */
function puddle(seed: number, rough = 2.4): boolean[][] {
  const n = valueNoise(seed, 16, 4);
  return Array.from({ length: T }, (_, y) => Array.from({ length: T }, (_, x) => {
    const d = Math.min(x, y, T - 1 - x, T - 1 - y);
    const corner = Math.min(x, T - 1 - x) + Math.min(y, T - 1 - y);
    return d >= n(x, y) * rough && corner >= 2;
  }));
}
const isEdge = (m: boolean[][], x: number, y: number) =>
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !m[y + dy!]?.[x + dx!]);

export function oil(): Image[] {
  const m = puddle(21), n = valueNoise(22, 16, 4), img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!m[y]![x]) continue;
    const v = n(x, y);
    let k: Key = 'oil1', a = 235;
    if (isEdge(m, x, y)) a = 150;
    else if (v > 0.68) k = 'oil0';
    else if (Math.abs(v - 0.45) < 0.025) k = (x + y) % 2 ? 'sheen0' : 'sheen1'; // rainbow sheen on the slick
    set(img, x, y, rgb(k), a);
  }
  for (const [x, y] of [[4, 4], [5, 4], [11, 9]]) if (m[y]![x] && !isEdge(m, x, y)) set(img, x, y, rgb('glint'), 220);
  return [img];
}

export function grease(): Image[] {
  const m = puddle(31, 2.8), n = valueNoise(32, 16, 4), r = rng(33), img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!m[y]![x]) continue;
    const v = n(x, y);
    const k: Key = isEdge(m, x, y) ? 'gr0' : v > 0.66 ? 'gr2' : v < 0.3 ? 'gr0' : 'gr1';
    set(img, x, y, rgb(isEdge(m, x, y) ? 'gr1' : k), isEdge(m, x, y) ? 120 : 190);
  }
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
    if (m[y]![x]) set(img, x, y, rgb('gr3'), 230);
  }
  return [img];
}

/** Shallow water: translucent pool with ripples that spread over 4 frames. */
export function water(dark = false): Image[] {
  const m = puddle(41), n = valueNoise(42, 16, 8);
  return [0, 1, 2, 3].map((f) => {
    const img = blank(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (!m[y]![x]) continue;
      let k: Key = dark ? 'wa0' : n(x, y) > 0.6 ? 'wa2' : 'wa1';
      let a = dark ? 200 : 150;
      if (isEdge(m, x, y)) (k = dark ? 'wa0' : 'wa1'), (a = 110);
      for (const [cx, cy, ph] of [[5, 6, 0], [11, 11, 2]] as const) {
        const rad = ((f + ph) % 4) * 1.5 + 1;
        const d = Math.hypot((x - cx) * 0.8, y - cy);
        if (Math.abs(d - rad) < 0.5 && !isEdge(m, x, y)) (k = 'wa3'), (a = 200);
      }
      set(img, x, y, rgb(k), a);
    }
    const sx = 3 + ((f * 3) % 9), sy = 9 - f;
    if (m[sy]?.[sx]) set(img, sx, sy, rgb('wa4'), 230);
    return img;
  });
}

export function ice(): Image[] {
  const m = puddle(51, 1.6), n = valueNoise(52, 16, 4), r = rng(53), img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!m[y]![x]) continue;
    const edge = isEdge(m, x, y);
    const lit = edge && (!m[y - 1]?.[x] || !m[y]![x - 1]);
    const k: Key = edge ? (lit ? 'ic3' : 'ic0') : n(x, y) > 0.62 ? 'ic2' : 'ic1';
    set(img, x, y, rgb(k), edge ? 170 : 225);
  }
  // Cracks: short random walks from a few points.
  for (let c = 0; c < 3; c++) {
    let x = 3 + Math.floor(r() * 10), y = 3 + Math.floor(r() * 10);
    for (let s = 0; s < 7; s++) {
      if (m[y]?.[x]) set(img, x, y, rgb('ic0'), 255);
      x += Math.round(r() * 2 - 1) || 1;
      y += r() < 0.5 ? 1 : 0;
    }
  }
  return [img];
}

/** Water with crackling bolts that jump around (4 frames, fast). */
export function electrified(): Image[] {
  return water(true).map((img, f) => {
    const r = rng(60 + f);
    for (let b = 0; b < 2; b++) {
      let x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 4);
      const len = 6 + Math.floor(r() * 6);
      for (let s = 0; s < len && y < T - 1; s++) {
        set(img, x, y, rgb(s % 3 === 0 ? 'el2' : 'el0'), 255);
        for (const [dx, dy] of [[1, 0], [-1, 0]]) if (r() < 0.3) set(img, x + dx!, y + dy!, rgb('el1'), 140);
        x += r() < 0.5 ? -1 : 1;
        y += 1;
        x = Math.max(1, Math.min(T - 2, x));
      }
    }
    return img;
  });
}

export function bloodPool(): Image[] {
  const m = puddle(71, 3), n = valueNoise(72, 16, 4), img = blank(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!m[y]![x]) continue;
    const edge = isEdge(m, x, y);
    const k: Key = edge ? 'b1' : n(x, y) > 0.65 ? 'b2' : n(x, y) < 0.3 ? 'b0' : 'b1';
    set(img, x, y, rgb(k), edge ? 150 : 235);
  }
  for (const [x, y] of [[5, 5], [6, 5]]) if (m[y]![x]) set(img, x, y, rgb('b3'), 255);
  return [img];
}

/** Loose stones and grit: difficult terrain, opaque rocks on a transparent tile. */
export function rubble(): Image[] {
  const r = rng(81), img = blank(T, T);
  const rock = new Set<string>();
  const rocks = [[4, 5, 2.6, 1.8], [11, 4, 2, 1.5], [8, 10, 3, 2.1], [3, 12, 1.6, 1.2], [13, 12, 2.2, 1.6], [8, 3, 1.2, 1]];
  for (const [cx, cy, rx, ry] of rocks) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = ((x - cx!) / rx!) ** 2 + ((y - cy!) / ry!) ** 2;
      if (d > 1) continue;
      rock.add(`${x},${y}`);
      const lit = x - cx! + (y - cy!) < -0.5, dark = x - cx! + (y - cy!) > 1;
      set(img, x, y, rgb(lit ? 's2' : dark ? 's0' : 's1'));
    }
    set(img, Math.round(cx! - rx! / 2), Math.round(cy! - ry! / 2), rgb('s3'));
  }
  // Outline around the stones, below/right first (they sit on the floor).
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (rock.has(`${x},${y}`)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => rock.has(`${x + dx!},${y + dy!}`))) set(img, x, y, rgb('out'));
  }
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T);
    if (!rock.has(`${x},${y}`)) set(img, x, y, rgb(r() < 0.5 ? 's0' : 'd0'), 200);
  }
  return [img];
}

/** Burning ground: embers and three flame tongues out of phase (4 frames). */
export function fire(): Image[] {
  const m = puddle(91, 3), n = valueNoise(92, 16, 4);
  return [0, 1, 2, 3].map((f) => {
    const img = blank(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (!m[y]![x]) continue;
      const v = n(x + f, y);
      if (v > 0.7) set(img, x, y, rgb('f2'), 220);
      else if (v > 0.5) set(img, x, y, rgb('f1'), 170);
      else set(img, x, y, rgb('f0'), 110);
    }
    const tongue = (x: number, y: number, phase: number) => ascii(img, x, y, FLAMES[(f + phase) % 4]!, FLAME_LEGEND);
    tongue(0, 5, 0);
    tongue(8, 3, 2);
    tongue(4, 8, 1);
    const r = rng(95 + f);
    for (let i = 0; i < 2; i++) set(img, 2 + Math.floor(r() * 12), Math.floor(r() * 4), rgb('f4'));
    return img;
  });
}

// --- Objects (frame size 16x20, feet at the bottom) ------------------------------------

const BARREL: string[] = [
  '...kkkkkk...',
  '.kkLLLLLLkk.',
  'kLllllllllLk',
  'kkLLLLLLLLkk',
  'kIIIIIIIIiik',
  'kiiiiiiiiiik',
  'khWwwWwwWwdk',
  'khWwwWwwWwdk',
  'khWwwWwwWwdk',
  'kIIIIIIIIiik',
  'kiiiiiiiiiik',
  'khWwwWwwWwdk',
  'khWwwWwwWwdk',
  'kIIIIIIIIiik',
  'khWwwWwwWwdk',
  '.kkkkkkkkkk.',
];
const BARREL_OIL: string[] = [
  '...kkkkkk...',
  '.kkLLLLLLkk.',
  'kLlllOOlllLk',
  'kkLLLOLLLLkk',
  'kiiiiOiiiiik',
  'khPPPOPPPPdk',
  'khPPmOPPPPdk',
  'khPmmmPPPPdk',
  'khPmMmPPPPdk',
  'kYkYkYkYkYkk',
  'kkYkYkYkYkYk',
  'khPPPPPPPPdk',
  'khPPPPPPPPdk',
  'kiiiiiiiiiik',
  'khPPPPPPPPdk',
  '.kkkkkkkkkk.',
];
const OBJ_LEGEND: Record<string, Key> = {
  k: 'out', L: 'w3', l: 'w4', I: 'i1', i: 'i0', h: 'w4', W: 'w2', w: 'w3', d: 'w1',
  P: 'paint', O: 'oil0', m: 'warn', M: 'f2', Y: 'warn',
};

function frame(): Image {
  return blank(T, 20);
}

export function barrel(): Image {
  const img = frame();
  ascii(img, 2, 4, BARREL, OBJ_LEGEND);
  return img;
}

/** Explosive oil barrel: red-painted staves, hazard band, flame mark, oil dripping from the bung. */
export function barrelOil(): Image {
  const img = frame();
  for (let x = 1; x < 15; x++) for (let y = 18; y < 20; y++) if (Math.abs(x - 7.5) / 7 + Math.abs(y - 18.5) / 1.6 < 1) set(img, x, y, rgb(y === 18 ? 'oil1' : 'oil0'));
  ascii(img, 2, 4, BARREL_OIL, { ...OBJ_LEGEND, h: 'paint1', d: 'b0' });
  set(img, 13, 16, rgb('oil0'));
  set(img, 13, 17, rgb('oil0'));
  set(img, 9, 7, rgb('glint'));
  return img;
}

function stave(img: Image, x0: number, y0: number, x1: number, y1: number, k: Key, k2: Key): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push([Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)]);
  for (const [x, y] of pts) for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [1, 1], [0, 2]]) set(img, x + dx!, y + dy!, rgb('out'));
  for (const [x, y] of pts) {
    set(img, x, y, rgb(k));
    set(img, x, y + 1, rgb(k2));
  }
}

function brokenBase(k: Key, k2: Key, hoop: Key): Image {
  const img = frame();
  for (let x = 1; x < 15; x++) for (let y = 15; y < 20; y++) {
    const d = ((x - 7.5) / 6) ** 2 + ((y - 17) / 2) ** 2;
    if (d <= 1 && d >= 0.45) set(img, x, y, rgb(hoop));
    else if (d > 1 && d < 1.5) set(img, x, y, rgb('out'));
  }
  stave(img, 2, 12, 5, 17, k, k2);
  stave(img, 12, 11, 14, 16, k, k2);
  stave(img, 6, 15, 10, 15, k, k2);
  stave(img, 8, 10, 9, 13, k, k2);
  return img;
}

export function barrelBroken(): Image {
  return brokenBase('w3', 'w2', 'i1');
}

export function barrelOilBroken(): Image {
  const img = frame();
  for (let x = 0; x < 16; x++) for (let y = 13; y < 20; y++) if (((x - 7.5) / 8) ** 2 + ((y - 16.5) / 3.4) ** 2 <= 1) set(img, x, y, rgb('oil1'), 240);
  blit(img, brokenBase('paint', 'b0', 'i0'), 0, 0);
  set(img, 4, 16, rgb('sheen0'));
  set(img, 5, 16, rgb('sheen1'));
  return img;
}

/** Smashed crate in 0x72's crate colours (#8f4029 / #62232f / #ee8e2e). */
export function crateBroken(): Image {
  const img = frame();
  stave(img, 1, 16, 6, 14, 'f1', 'f0');
  stave(img, 9, 17, 14, 15, 'f1', 'f0');
  stave(img, 4, 11, 4, 15, 'f1', 'f0');
  stave(img, 10, 10, 12, 14, 'f1', 'f0');
  stave(img, 6, 18, 9, 18, 'f1', 'f0');
  set(img, 5, 13, rgb('f3'));
  set(img, 11, 12, rgb('f3'));
  set(img, 7, 18, rgb('s2'));
  return img;
}

// --- Effects --------------------------------------------------------------------------

/** 32x32 explosion: white flash, fireball, smoke ring with embers, fading smoke (7 frames). */
export function explosion(): Image[] {
  const S = 32, c = 15.5;
  const steps: { R: number; ramp: [number, Key][]; dither?: number; hollow?: number; sparks?: number }[] = [
    { R: 4, ramp: [[0.6, 'f5'], [1, 'f4']] },
    { R: 8, ramp: [[0.35, 'f5'], [0.65, 'f4'], [0.85, 'f3'], [1, 'f2']] },
    { R: 12, ramp: [[0.3, 'f4'], [0.55, 'f3'], [0.8, 'f2'], [1, 'f1']], sparks: 6 },
    { R: 14, ramp: [[0.25, 'f3'], [0.5, 'f2'], [0.72, 'f1'], [0.88, 'sm1'], [1, 'sm0']], sparks: 10 },
    { R: 15, ramp: [[0.2, 'f2'], [0.4, 'f1'], [0.7, 'sm1'], [1, 'sm0']], sparks: 8 },
    { R: 15, ramp: [[0.6, 'sm2'], [1, 'sm1']], hollow: 0.45, dither: 0.35, sparks: 4 },
    { R: 15, ramp: [[0.7, 'sm2'], [1, 'sm0']], hollow: 0.6, dither: 0.7 },
  ];
  return steps.map((s, f) => {
    const img = blank(S, S);
    const n = valueNoise(200 + f, 32, 6);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = (Math.hypot(x - c, (y - c) * 1.1) / s.R) * (0.85 + 0.3 * n(x, y));
      if (d > 1) continue;
      if (s.hollow && d < s.hollow) continue;
      if (s.dither && bayer(x, y) < s.dither) continue;
      const k = s.ramp.find(([t]) => d <= t)![1];
      set(img, x, y, rgb(k));
    }
    const r = rng(300 + f);
    for (let i = 0; i < (s.sparks ?? 0); i++) {
      const a = r() * Math.PI * 2, d = s.R + 1 + r() * 3;
      set(img, Math.round(c + Math.cos(a) * d), Math.round(c + Math.sin(a) * d), rgb(r() < 0.5 ? 'f4' : 'f3'));
    }
    return img;
  });
}

/** Steam puff (water meets fire): pale balls that rise and thin out (5 frames). */
export function steam(): Image[] {
  return [0, 1, 2, 3, 4].map((f) => {
    const img = blank(T, T);
    const grow = [2, 3, 3.8, 4.4, 4.8][f]!, rise = f * 1.6;
    const balls = [[7.5, 11, 1], [4.5, 9, 0.7], [10.5, 8, 0.75]] as const;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let inside = false, top = false;
      for (const [bx, by, s] of balls) {
        const rad = grow * s, dy = y - (by - rise);
        if ((x - bx) ** 2 + dy ** 2 <= rad * rad) {
          inside = true;
          if (dy < -rad * 0.3) top = true;
        }
      }
      if (!inside || bayer(x, y) < [0, 0.1, 0.25, 0.5, 0.75][f]!) continue;
      set(img, x, y, rgb(top ? 'st2' : f > 2 ? 'st0' : 'st1'), 230);
    }
    return img;
  });
}
