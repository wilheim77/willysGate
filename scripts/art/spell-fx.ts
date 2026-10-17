// Spell and ability VFX for Intereses (0x72 palette family): projectiles (pointing right; the
// client rotates them along the flight), impacts, a tileable beam, per-tile flames, rings and
// auras. Used by build-extra-art.ts; how each one is played is in docs/ART_CATALOG.md.
import { type Image, blank } from './png.ts';
import { type Rgb, hexToRgb } from './color.ts';
import { T, bayer, rng, set, valueNoise } from './pixel.ts';

type Ramp = string[]; // dark -> bright
export const FIRE: Ramp = ['#62232f', '#8f4029', '#c56025', '#ee8e2e', '#facb3e', '#fdf7ed'];
export const FROST: Ramp = ['#2e4a5e', '#6f8ea0', '#9ab8c8', '#c4dce6', '#eef6f8', '#ffffff'];
export const SHOCK: Ramp = ['#3f6363', '#4a8aa8', '#a0e8ff', '#d0f4ff', '#fff8a0', '#ffffff'];
export const ARCANE: Ramp = ['#2a1440', '#4e2a7a', '#7a4ac0', '#a880f0', '#d8c4ff', '#ffffff'];
export const RADIANT: Ramp = ['#6e5426', '#a8873a', '#d8b85a', '#f4dc8a', '#fff4c8', '#ffffff'];
export const HEAL: Ramp = ['#2e5a34', '#4a8a4a', '#7ac062', '#b0e08a', '#e4f8c4', '#ffffff'];

const col = (r: Ramp, t: number): Rgb => hexToRgb(r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))]!);

/** Projectile pointing right (16x16): bright head, tapering flickering trail. */
export function bolt(ramp: Ramp, frame: number, opts: { head?: number; len?: number; thin?: boolean } = {}): Image {
  const img = blank(T, T);
  const head = opts.head ?? 2.6, len = opts.len ?? 10, hx = 12, cy = 7.5;
  const n = valueNoise(500 + frame * 7, 16, 3);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const dh = Math.hypot(x - hx, (y - cy) * (opts.thin ? 1.6 : 1));
    let t = -1;
    if (dh <= head) t = 1 - dh / head * 0.45;
    else if (x < hx && x >= hx - len) {
      const k = (hx - x) / len; // 0 at head, 1 at tail end
      const w = head * (1 - k) * (opts.thin ? 0.6 : 1) + 0.3;
      const dy = Math.abs(y - cy + Math.sin(x * 1.3 + frame * 1.7) * 0.6 * k);
      if (dy <= w && n(x, y) > k * 0.75) t = (1 - k) * 0.85 - dy / (w + 1) * 0.3;
    }
    if (t < 0) continue;
    set(img, x, y, col(ramp, t));
  }
  // Sparks shed behind.
  const r = rng(520 + frame);
  for (let i = 0; i < 3; i++) set(img, Math.floor(r() * 7), Math.round(cy + (r() - 0.5) * 6), col(ramp, 0.6 + r() * 0.4));
  return img;
}

/** Magic missile dart: an arrowhead of force with a short trail. */
export function dart(frame: number): Image {
  const img = blank(T, T);
  const rows = ['.......xx...', '......xXXx..', 'oooooXWWWXx.', '......xXXx..', '.......xx...'];
  const legend: Record<string, number> = { o: 0.35, x: 0.5, X: 0.75, W: 1 };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    if (ch === 'o' && (x + frame) % 3 === 0) return;
    set(img, x + 3, y + 6, col(ARCANE, legend[ch]!));
  }));
  set(img, 1 + (frame % 2), 7 + (frame % 3) - 1, col(ARCANE, 0.8));
  return img;
}

/** Radial burst: grows, then hollows out and dithers away. size = canvas, R = max radius. */
export function burst(ramp: Ramp, size: number, frames: number, seed: number, opts: { sparks?: number; smoke?: boolean } = {}): Image[] {
  const c = (size - 1) / 2, Rmax = size / 2 - 1;
  return Array.from({ length: frames }, (_, f) => {
    const img = blank(size, size);
    const p = (f + 1) / frames;
    const R = Rmax * Math.min(1, 0.3 + p * 1.1);
    const hollow = p > 0.5 ? (p - 0.5) * 1.6 : 0;
    const fade = p > 0.6 ? (p - 0.6) * 2.2 : 0;
    const n = valueNoise(seed + f, size, Math.max(3, size / 6));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = (Math.hypot(x - c, (y - c) * 1.05) / R) * (0.85 + 0.3 * n(x, y));
      if (d > 1 || d < hollow) continue;
      if (fade && bayer(x, y) < fade) continue;
      let t = 1 - d * (0.6 + p * 0.5);
      if (opts.smoke && p > 0.55 && d > 0.6) {
        set(img, x, y, hexToRgb(d > 0.85 ? '#3a3436' : '#5a5254'));
        continue;
      }
      set(img, x, y, col(ramp, Math.max(0, t)));
    }
    const r = rng(seed * 3 + f);
    for (let i = 0; i < (opts.sparks ?? 0) * (p < 0.9 ? 1 : 0); i++) {
      const a = r() * Math.PI * 2, d = R + 1 + r() * 3;
      set(img, Math.round(c + Math.cos(a) * d), Math.round(c + Math.sin(a) * d), col(ramp, 0.7 + r() * 0.3));
    }
    return img;
  });
}

/** Frost impact: a small burst with ice shards that stay a frame longer. */
export function frostImpact(): Image[] {
  const base = burst(FROST, T, 5, 610, { sparks: 4 });
  const shards = [[3, 4, 1, 1], [12, 3, -1, 1], [2, 12, 1, -1], [13, 12, -1, -1]];
  return base.map((img, f) => {
    if (f >= 1 && f <= 4) for (const [x, y, dx, dy] of shards) for (let i = 0; i < 3 - Math.max(0, f - 2); i++) set(img, x! + dx! * i, y! + dy! * i, col(FROST, 0.9 - i * 0.2));
    return img;
  });
}

/** Ray of frost segment (16x16, tiles horizontally): white core, icy glow, drifting motes. */
export function frostBeam(frame: number): Image {
  const img = blank(T, T);
  const r = rng(630 + frame);
  for (let x = 0; x < T; x++) {
    const wob = Math.round(Math.sin((x + frame * 5) * 0.8) * 0.6);
    for (let y = 4; y <= 11; y++) {
      const d = Math.abs(y - 7.5 - wob);
      if (d > 3.6) continue;
      if (d > 2.4 && bayer(x, y) > 0.5) continue;
      set(img, x, y, col(FROST, 1 - d / 4));
    }
  }
  for (let i = 0; i < 5; i++) set(img, Math.floor(r() * T), 2 + Math.floor(r() * 12), col(FROST, 0.9));
  return img;
}

/** Shocking grasp: forking arcs around the target (16x16). */
export function shock(frame: number): Image {
  const img = blank(T, T);
  const r = rng(640 + frame * 13);
  if (frame === 4) {
    for (let i = 0; i < 5; i++) set(img, Math.floor(r() * T), Math.floor(r() * T), col(SHOCK, 0.5));
    return img;
  }
  const arcs = 3 + (frame % 2);
  for (let a = 0; a < arcs; a++) {
    let x = 7.5, y = 7.5;
    const ang = r() * Math.PI * 2;
    for (let s = 0; s < 7; s++) {
      x += Math.cos(ang) * 1.1 + (r() - 0.5) * 1.6;
      y += Math.sin(ang) * 1.1 + (r() - 0.5) * 1.6;
      set(img, Math.round(x), Math.round(y), col(SHOCK, s < 3 ? 1 : 0.7));
    }
  }
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) set(img, 7 + dx!, 7 + dy!, col(SHOCK, frame < 2 ? 1 : 0.8));
  return img;
}

/** One tile of a flame wash (burning hands, the fireball's ground fire): licks up and dies out. */
export function flameTile(frame: number, seed = 650): Image {
  const img = blank(T, T);
  const h = [5, 11, 14, 12, 8, 4][frame]!;
  const n = valueNoise(seed + frame, 16, 3);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const up = T - 1 - y;
    const tongue = h * (0.55 + 0.6 * n(x, 0)) * (1 - Math.abs(x - 7.5) / 11);
    if (up > tongue) continue;
    const t = 1 - up / (tongue + 0.01);
    if (frame >= 4 && bayer(x, y) < (frame - 3) * 0.3) continue;
    set(img, x, y, col(FIRE, 0.25 + t * 0.75 - (frame >= 4 ? 0.25 : 0)));
  }
  if (frame >= 3) for (let i = 0; i < 3; i++) set(img, 3 + i * 4, T - h - 2 - i, col(FIRE, 0.8));
  return img;
}

/** Expanding ring (thunderwave, turn undead): `size` canvas, hollow band with optional spokes. */
export function ring(ramp: Ramp, size: number, frames: number, opts: { spokes?: number; ripple?: boolean } = {}): Image[] {
  const c = (size - 1) / 2;
  return Array.from({ length: frames }, (_, f) => {
    const img = blank(size, size);
    const p = (f + 1) / frames;
    const R = (size / 2 - 1) * (0.25 + p * 0.75), w = 2.5 + p * 2;
    const fade = p > 0.65 ? (p - 0.65) * 2.6 : 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const k = Math.abs(d - R) / w;
      if (k > 1) {
        if (opts.ripple && d < R - w && Math.abs(d - (R - w) * 0.6) < 0.8 && bayer(x, y) > 0.5 + fade) set(img, x, y, col(ramp, 0.4));
        continue;
      }
      if (fade && bayer(x, y) < fade) continue;
      if (k > 0.6 && bayer(x, y) < 0.4) continue;
      set(img, x, y, col(ramp, 1 - k * 0.7 - p * 0.2));
    }
    if (opts.spokes) for (let s = 0; s < opts.spokes; s++) {
      const a = (Math.PI * 2 * s) / opts.spokes + f * 0.08;
      for (let d = R * 0.3; d < R - w; d += 1) if (bayer(Math.round(d), s) > fade) set(img, Math.round(c + Math.cos(a) * d), Math.round(c + Math.sin(a) * d), col(ramp, 0.5 + (d / R) * 0.4));
    }
    return img;
  });
}

/** Sacred flame (16x32, feet at the bottom): a column of light drops, flares and burns white-gold. */
export function sacredFlame(frame: number): Image {
  const img = blank(T, 32);
  const n = valueNoise(670 + frame, 16, 3);
  const beamTop = [0, 0, 8, 16, 22, 26][frame]!, beamBot = [14, 31, 31, 31, 31, 31][frame]!;
  for (let y = beamTop; y <= beamBot; y++) for (let x = 5; x <= 10; x++) {
    const d = Math.abs(x - 7.5) / 2.8;
    if (d > 1 || (frame >= 3 && bayer(x, y) < (frame - 2) * 0.25)) continue;
    set(img, x, y, col(RADIANT, 1 - d * 0.6));
  }
  if (frame >= 1) {
    const h = [0, 8, 13, 11, 8, 4][frame]!;
    for (let y = 31 - h; y < 32; y++) for (let x = 0; x < T; x++) {
      const up = 31 - y, tongue = h * (0.5 + 0.7 * n(x, 0)) * (1 - Math.abs(x - 7.5) / 9);
      if (up > tongue) continue;
      if (frame >= 4 && bayer(x, y) < 0.4) continue;
      set(img, x, y, col(RADIANT, 0.35 + (1 - up / (tongue + 0.01)) * 0.65));
    }
  }
  return img;
}

/** Healing (16x24, feet at the bottom): green-gold motes and crosses rising around the body. */
export function healing(frame: number): Image {
  const img = blank(T, 24);
  const motes = [[3, 22, 0], [12, 21, 1], [7, 23, 2], [5, 20, 3], [10, 23, 1], [2, 19, 2], [13, 22, 3]];
  for (const [x, y0, delay] of motes) {
    const age = frame - delay!;
    if (age < 0 || age > 3) continue;
    const y = y0! - age * 5;
    const t = 1 - age * 0.2;
    set(img, x!, y, col(HEAL, t));
    if (age < 2) set(img, x!, y + 1, col(HEAL, t - 0.3));
  }
  const crosses = [[8, 17, 1], [4, 12, 2], [11, 9, 3]];
  for (const [x, y, at] of crosses) {
    if (frame < at! || frame > at! + 2) continue;
    const t = frame === at! + 1 ? 1 : 0.65;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) set(img, x! + dx!, y! - (frame - at!) * 2 + dy!, col(HEAL, dx || dy ? t - 0.2 : t));
  }
  // Soft ground glow at the feet on the first frames.
  if (frame < 4) for (let x = 3; x <= 12; x++) if (bayer(x, 23) > 0.3 + frame * 0.15) set(img, x, 23, col(HEAL, 0.55));
  return img;
}

/** Bless (16x24, loop): a halo of golden sparkles circling over the head. */
export function bless(frame: number): Image {
  const img = blank(T, 24);
  const cx = 7.5, cy = 3, rx = 6, ry = 2;
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16;
    if (bayer(i, frame) > 0.6) continue;
    set(img, Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), col(RADIANT, 0.5));
  }
  for (let k = 0; k < 3; k++) {
    const a = ((frame + k * 4 / 3) / 4) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    set(img, x, y, col(RADIANT, 1));
    if (Math.sin(a) > 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(img, x + dx!, y + dy!, col(RADIANT, 0.75));
  }
  const r = rng(690 + frame);
  for (let i = 0; i < 2; i++) set(img, 2 + Math.floor(r() * 12), 7 + Math.floor(r() * 14), col(RADIANT, 0.8));
  return img;
}

/** Holy symbol flash held up by the caster (16x16): a sunburst that blooms and fades. */
export function holySymbol(frame: number): Image {
  const img = blank(T, T);
  const s = [0.4, 0.8, 1, 1, 0.7, 0.4][frame]!;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const ray = Math.abs(Math.cos(a * 4)) > 0.92 ? 7.5 * s : 3 * s;
    if (d > ray) continue;
    if (frame >= 4 && bayer(x, y) < 0.35) continue;
    set(img, x, y, col(RADIANT, 1 - d / 9));
  }
  return img;
}
