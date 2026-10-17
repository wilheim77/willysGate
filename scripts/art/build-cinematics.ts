// Builds the intro cinematic of a game: low-resolution pixel-art panels composed from
// the packs in art-src/ plus procedural backgrounds and hand-drawn ASCII sprites.
//   node scripts/art/build-cinematics.ts <game>
// Reads  content/<game>/cinematics/intro.spec.json
// Writes content/<game>/public/assets/cinematics/<panel id>.png,
//        content/<game>/cinematics/intro.json (panels: image, lines, durationMs, effect...)
//        docs/art-previews/<game>-intro.png (contact sheet).
// Panels are drawn without colour grade: the client applies it at runtime.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';
import { type Rgb, hexToRgb, mix } from './color.ts';
import { drawText, textWidth } from './font.ts';
import { readSpriteList } from './sprite-list.ts';

const [game = 'intereses'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'cinematics', 'intro.spec.json'), 'utf8')) as Spec;

interface AsciiSprite {
  legend: Record<string, string>;
  rows: string[];
}
interface Spec {
  size: [number, number];
  palette: Record<string, string>;
  atlases: Record<string, { png: string; list?: string; grid?: number }>;
  ascii: Record<string, AsciiSprite>;
  panels: Panel[];
}
interface Panel {
  id: string;
  lines: string[];
  durationMs: number;
  effect?: string;
  effectParams?: Record<string, unknown>;
  voice?: string;
  /** Wider or taller canvas for pans; defaults to spec.size. */
  size?: [number, number];
  draw: Op[];
}
// Ops are loose JSON objects; each handler reads the fields it needs.
type Op = { op: string } & Record<string, any>;

// --- Colours -------------------------------------------------------------------
const colour = (c: string): Rgb => hexToRgb(spec.palette[c] ?? c);

function plot(img: Image, x: number, y: number, c: Rgb, alpha = 1): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  if (alpha >= 1 || img.data[i + 3] === 0) {
    [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [c[0], c[1], c[2], 255];
    return;
  }
  const cur: Rgb = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
  [img.data[i], img.data[i + 1], img.data[i + 2]] = mix(cur, c, alpha);
}
function add(img: Image, x: number, y: number, c: Rgb, k: number): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  for (let ch = 0; ch < 3; ch++) img.data[i + ch] = Math.min(255, img.data[i + ch]! + Math.round(c[ch]! * k));
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const bayer = (x: number, y: number) => (BAYER[y & 3]![x & 3]! + 0.5) / 16;

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

// --- Sprite sources -------------------------------------------------------------
const atlasCache = new Map<string, { img: Image; list: Record<string, { x: number; y: number; w: number; h: number }> }>();
function atlas(name: string) {
  if (!atlasCache.has(name)) {
    const a = spec.atlases[name];
    if (!a) throw new Error(`unknown atlas "${name}"`);
    const path = a.png.startsWith('content/') ? join(root, a.png) : join(root, 'art-src', a.png);
    atlasCache.set(name, { img: readPng(path), list: a.list ? readSpriteList(join(root, 'art-src', a.list)) : {} });
  }
  return atlasCache.get(name)!;
}
const manifestCache = new Map<string, any>();

/** Resolves a sprite reference of an op to an image. */
function source(op: Op): Image {
  if (op.ascii) {
    const s = spec.ascii[op.ascii];
    if (!s) throw new Error(`unknown ascii sprite "${op.ascii}"`);
    const w = Math.max(...s.rows.map((r) => r.length));
    const img = blank(w, s.rows.length);
    s.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const c = s.legend[ch];
      if (!c) throw new Error(`${op.ascii}: no colour for "${ch}"`);
      plot(img, x, y, colour(c));
    }));
    return img;
  }
  if (op.manifest) {
    // A sprite of this game's art manifest, e.g. { manifest: "0x72", id: "cobrador", anim: "idle", frame: 0 }.
    if (!manifestCache.has(op.manifest)) manifestCache.set(op.manifest, JSON.parse(readFileSync(join(gameDir, 'assets', `${op.manifest}.json`), 'utf8')));
    const art = manifestCache.get(op.manifest).sprites[op.id];
    if (!art) throw new Error(`unknown manifest sprite "${op.id}"`);
    const r = art.animations[op.anim ?? 'idle'][op.frame ?? 0];
    return crop(readPng(join(gameDir, 'public', art.url)), r.x, r.y, r.w, r.h);
  }
  const a = atlas(op.atlas);
  if (op.sprite) {
    const r = a.list[op.sprite];
    if (!r) throw new Error(`unknown sprite "${op.sprite}" in ${op.atlas}`);
    return crop(a.img, r.x, r.y, r.w, r.h);
  }
  const g = spec.atlases[op.atlas]!.grid ?? 16;
  const [cx, cy, cw = 1, ch = 1] = op.cell as number[];
  return crop(a.img, cx! * g, cy! * g, cw * g, ch * g);
}

function transform(img: Image, op: Op): Image {
  let out = img;
  if (op.map || op.silhouette) {
    const map = new Map(Object.entries((op.map ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), colour(v)]));
    const sil = op.silhouette ? colour(op.silhouette) : null;
    out = blank(img.width, img.height);
    img.data.copy(out.data);
    for (let i = 0; i < out.data.length; i += 4) {
      if (!out.data[i + 3]) continue;
      const hex = '#' + [0, 1, 2].map((c) => out.data[i + c]!.toString(16).padStart(2, '0')).join('');
      const next = sil ?? map.get(hex);
      if (next) [out.data[i], out.data[i + 1], out.data[i + 2]] = next;
    }
  }
  const rot = ((op.rotate ?? 0) / 90) & 3;
  for (let r = 0; r < rot; r++) {
    const next = blank(out.height, out.width);
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const s = (y * out.width + x) * 4;
      out.data.copy(next.data, (x * next.width + (out.height - 1 - y)) * 4, s, s + 4);
    }
    out = next;
  }
  if (op.flip) {
    const next = blank(out.width, out.height);
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const s = (y * out.width + x) * 4;
      out.data.copy(next.data, (y * out.width + (out.width - 1 - x)) * 4, s, s + 4);
    }
    out = next;
  }
  const k = op.scale ?? 1;
  if (k !== 1) {
    const next = blank(out.width * k, out.height * k);
    for (let y = 0; y < next.height; y++) for (let x = 0; x < next.width; x++) {
      const s = (Math.floor(y / k) * out.width + Math.floor(x / k)) * 4;
      out.data.copy(next.data, (y * next.width + x) * 4, s, s + 4);
    }
    out = next;
  }
  if (op.alpha !== undefined) for (let i = 3; i < out.data.length; i += 4) out.data[i] = Math.round(out.data[i]! * op.alpha);
  return out;
}

// --- Ops -----------------------------------------------------------------------------
function inPoly(x: number, y: number, pts: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!, [xj, yj] = pts[j]!;
    if ((yi! > y) !== (yj! > y) && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

const OPS: Record<string, (img: Image, op: Op) => void> = {
  /** Vertical gradient through several colours, with ordered dither between steps. */
  gradient(img, op) {
    const cols = (op.colors as string[]).map(colour);
    const x0 = op.x ?? 0, w = op.w ?? img.width, y0 = op.y ?? 0, h = op.h ?? img.height - y0;
    for (let y = y0; y < y0 + h; y++) {
      const t = ((y - y0) / Math.max(1, h - 1)) * (cols.length - 1);
      for (let x = x0; x < x0 + w; x++) {
        const i = Math.min(cols.length - 2, Math.floor(t));
        const f = t - i;
        plot(img, x, y, f > bayer(x, y) ? cols[i + 1]! : cols[i]!);
      }
    }
  },
  rect(img, op) {
    const c = colour(op.color);
    for (let y = op.y; y < op.y + op.h; y++) for (let x = op.x; x < op.x + op.w; x++) {
      if (op.dither && bayer(x, y) > op.dither) continue;
      plot(img, x, y, c, op.alpha ?? 1);
    }
  },
  ellipse(img, op) {
    const c = colour(op.color);
    for (let y = Math.floor(op.cy - op.ry); y <= op.cy + op.ry; y++) for (let x = Math.floor(op.cx - op.rx); x <= op.cx + op.rx; x++) {
      if (((x - op.cx) / op.rx) ** 2 + ((y - op.cy) / op.ry) ** 2 > 1) continue;
      if (op.dither && bayer(x, y) > op.dither) continue;
      plot(img, x, y, c, op.alpha ?? 1);
    }
  },
  poly(img, op) {
    const c = colour(op.color);
    const pts = op.points as number[][];
    const xs = pts.map((p) => p[0]!), ys = pts.map((p) => p[1]!);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
      if (!inPoly(x + 0.5, y + 0.5, pts)) continue;
      if (op.dither && bayer(x, y) > op.dither) continue;
      plot(img, x, y, c, op.alpha ?? 1);
    }
  },
  line(img, op) {
    const c = colour(op.color);
    const n = Math.max(Math.abs(op.x1 - op.x0), Math.abs(op.y1 - op.y0), 1);
    for (let i = 0; i <= n; i++) for (let t = 0; t < (op.width ?? 1); t++) plot(img, op.x0 + ((op.x1 - op.x0) * i) / n + t, op.y0 + ((op.y1 - op.y0) * i) / n, c, op.alpha ?? 1);
  },
  /** Fills an area with a tile (or any sprite) repeated. */
  tiles(img, op) {
    const tile = transform(source(op), op);
    for (let y = op.y; y < op.y + op.h; y += tile.height) for (let x = op.x; x < op.x + op.w; x += tile.width) {
      blit(img, crop(tile, 0, 0, Math.min(tile.width, op.x + op.w - x), Math.min(tile.height, op.y + op.h - y)), x, y);
    }
  },
  /** One sprite; (x, y) is its top-left unless anchor is "bottom" (feet at y, centred on x). */
  sprite(img, op) {
    const s = transform(source(op), op);
    const x = op.anchor === 'bottom' ? op.x - Math.floor(s.width / 2) : op.x;
    const y = op.anchor === 'bottom' ? op.y - s.height : op.y;
    blit(img, s, x, y);
  },
  text(img, op) {
    const scale = op.scale ?? 1;
    const w = textWidth(op.text, scale);
    const x = op.align === 'center' ? Math.round(op.x - w / 2) : op.x;
    if (op.shadow) drawText(img, op.text, x + scale, op.y + scale, colour(op.shadow), scale);
    drawText(img, op.text, x, op.y, colour(op.color), scale);
  },
  rain(img, op) {
    const r = rng(op.seed ?? 1), c = colour(op.color);
    for (let n = 0; n < op.count; n++) {
      const x = Math.floor(r() * img.width), y = Math.floor(r() * img.height);
      for (let i = 0; i < (op.len ?? 3); i++) plot(img, x + Math.round(i * (op.dx ?? -0.3)), y + i, c, op.alpha ?? 0.6);
    }
  },
  stars(img, op) {
    const r = rng(op.seed ?? 2), cols = (op.colors as string[]).map(colour);
    for (let n = 0; n < op.count; n++) plot(img, Math.floor(r() * img.width), (op.y0 ?? 0) + Math.floor(r() * ((op.y1 ?? img.height) - (op.y0 ?? 0))), cols[n % cols.length]!);
  },
  /** Additive radial light in a few quantised steps, ordered-dithered between steps (pixel-art friendly). */
  glow(img, op) {
    const c = colour(op.color);
    const ry = op.ry ?? op.r;
    const steps = op.steps ?? 5;
    for (let y = Math.floor(op.cy - ry); y <= op.cy + ry; y++) for (let x = Math.floor(op.cx - op.r); x <= op.cx + op.r; x++) {
      const d = Math.sqrt(((x - op.cx) / op.r) ** 2 + ((y - op.cy) / ry) ** 2);
      if (d >= 1) continue;
      const v = (1 - d) ** 1.6 * steps;
      const k = (Math.floor(v) + (v - Math.floor(v) > bayer(x, y) ? 1 : 0)) / steps;
      add(img, x, y, c, k * (op.strength ?? 0.5));
    }
  },
  shade(img, op) {
    const c = colour(op.color);
    for (let y = op.y ?? 0; y < (op.y ?? 0) + (op.h ?? img.height); y++) for (let x = op.x ?? 0; x < (op.x ?? 0) + (op.w ?? img.width); x++) plot(img, x, y, c, op.alpha ?? 0.5);
  },
  vignette(img, op) {
    const c = colour(op.color ?? '#000000');
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const d = Math.sqrt(((x - img.width / 2) / (img.width / 2)) ** 2 + ((y - img.height / 2) / (img.height / 2)) ** 2);
      const t = Math.max(0, (d - (op.from ?? 0.6)) / (1.42 - (op.from ?? 0.6)));
      if (t > bayer(x, y)) plot(img, x, y, c, op.alpha ?? 0.7);
    }
  },
  /** Ridge line from 1D value noise, filled down to the bottom. */
  mountains(img, op) {
    const r = rng(op.seed ?? 3), c = colour(op.color);
    const step = op.step ?? 24;
    const pts = Array.from({ length: Math.ceil(img.width / step) + 2 }, () => r());
    for (let x = 0; x < img.width; x++) {
      const i = Math.floor(x / step), f = (x % step) / step;
      const s = f * f * (3 - 2 * f);
      let h = pts[i]! + (pts[i + 1]! - pts[i]!) * s;
      h = op.y - h * op.amp + Math.round((r() - 0.5) * (op.rough ?? 1));
      for (let y = Math.floor(h); y < (op.bottom ?? img.height); y++) plot(img, x, y, c);
      if (op.edge) plot(img, x, Math.floor(h), colour(op.edge));
    }
  },
  /** Row of houses with pitched roofs and a few lit windows. */
  skyline(img, op) {
    const r = rng(op.seed ?? 4), c = colour(op.color), win = op.windows ? colour(op.windows) : null;
    let x = op.x0 ?? 0;
    while (x < (op.x1 ?? img.width)) {
      const w = op.minW + Math.floor(r() * (op.maxW - op.minW));
      const h = op.minH + Math.floor(r() * (op.maxH - op.minH));
      const top = op.y - h;
      for (let yy = top; yy < op.y; yy++) for (let xx = x; xx < x + w; xx++) plot(img, xx, yy, c);
      const roof = Math.floor(w / 2);
      for (let k = 0; k < roof; k++) for (let xx = x + k; xx < x + w - k; xx++) plot(img, xx, top - k, c);
      if (win) for (let n = 0; n < 2; n++) if (r() < (op.lit ?? 0.4)) {
        const wx = x + 1 + Math.floor(r() * Math.max(1, w - 3)), wy = top + 2 + Math.floor(r() * Math.max(1, h - 5));
        plot(img, wx, wy, win);
        plot(img, wx, wy + 1, win);
      }
      x += w + (op.gap ?? 1);
    }
  },
  /** Grid lines every `size` pixels (top and left edge of each cell). */
  grid(img, op) {
    const c = colour(op.color);
    for (let y = op.y; y < op.y + op.h; y++) for (let x = op.x; x < op.x + op.w; x++) {
      if ((x - op.x) % op.size === 0 || (y - op.y) % op.size === 0) plot(img, x, y, c, op.alpha ?? 1);
    }
  },
  noise(img, op) {
    const r = rng(op.seed ?? 5), c = colour(op.color);
    const x0 = op.x ?? 0, y0 = op.y ?? 0, w = op.w ?? img.width, h = op.h ?? img.height;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (r() < op.density) plot(img, x, y, c, op.alpha ?? 1);
  },
  /** Audience silhouettes: heads and shoulders, some with antennae or tentacles. */
  crowd(img, op) {
    const r = rng(op.seed ?? 6), c = colour(op.color), acc = op.accent ? colour(op.accent) : c;
    for (let row = 0; row < (op.rows ?? 1); row++) {
      const y = op.y + row * (op.rowGap ?? 12);
      for (let x = op.x + (row % 2) * 5; x < op.x + op.w; x += 7 + Math.floor(r() * 4)) {
        const hr = 2 + Math.floor(r() * 2);
        for (let yy = -hr; yy <= hr; yy++) for (let xx = -hr; xx <= hr; xx++) if (xx * xx + yy * yy <= hr * hr + 1) plot(img, x + xx, y + yy, c);
        for (let yy = hr; yy < hr + 10; yy++) for (let xx = -hr - 2; xx <= hr + 2; xx++) plot(img, x + xx, y + yy, c);
        const kind = r();
        if (kind < 0.35) {
          plot(img, x - 1, y - hr - 1, c); plot(img, x - 2, y - hr - 2, c); plot(img, x - 2, y - hr - 3, acc);
          plot(img, x + 1, y - hr - 1, c); plot(img, x + 2, y - hr - 2, c); plot(img, x + 2, y - hr - 3, acc);
        } else if (kind < 0.55) {
          for (let k = 0; k < 4; k++) plot(img, x + hr + 1 + (k % 2), y - k, c);
        } else if (kind < 0.7 && op.eyes) {
          plot(img, x - 1, y, colour(op.eyes)); plot(img, x + 1, y, colour(op.eyes));
        }
      }
    }
  },
};

function render(p: Panel): Image {
  const [w, h] = p.size ?? spec.size;
  const img = blank(w, h);
  for (const op of p.draw) {
    const fn = OPS[op.op];
    if (!fn) throw new Error(`${p.id}: unknown op "${op.op}"`);
    fn(img, op);
  }
  // Panels are opaque.
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  return img;
}

// --- Build -----------------------------------------------------------------------------
const outDir = join(gameDir, 'public', 'assets', 'cinematics');
mkdirSync(outDir, { recursive: true });
const rendered: [Panel, Image][] = [];
for (const p of spec.panels) {
  const img = render(p);
  writePng(join(outDir, `${p.id}.png`), img);
  rendered.push([p, img]);
}

const intro = {
  $comment: `Generated by scripts/art/build-cinematics.ts from intro.spec.json. Images are under public/assets/cinematics/ (${spec.size.join('x')}, scale with nearest-neighbour). Do not edit by hand.`,
  size: spec.size,
  panels: spec.panels.map((p) => ({
    id: p.id,
    image: `${p.id}.png`,
    lines: p.lines,
    durationMs: p.durationMs,
    ...(p.effect ? { effect: p.effect } : {}),
    ...(p.effectParams ? { effectParams: p.effectParams } : {}),
    ...(p.voice ? { voice: p.voice } : {}),
  })),
};
writeFileSync(join(gameDir, 'cinematics', 'intro.json'), JSON.stringify(intro, null, 2) + '\n');

// Contact sheet: 3 columns at 1x with the panel number.
const [W, H] = spec.size;
const cols = 3, pad = 4;
const sheet = blank(cols * (W + pad) + pad, Math.ceil(rendered.length / cols) * (H + pad + 9) + pad);
for (let i = 0; i < sheet.data.length; i += 4) [sheet.data[i], sheet.data[i + 1], sheet.data[i + 2], sheet.data[i + 3]] = [20, 18, 22, 255];
rendered.forEach(([p, img], i) => {
  const x = pad + (i % cols) * (W + pad), y = pad + Math.floor(i / cols) * (H + pad + 9);
  drawText(sheet, `${i + 1}. ${p.id} (${p.durationMs / 1000} S${p.effect ? ', ' + p.effect : ''})`, x, y, [200, 196, 186]);
  blit(sheet, crop(img, 0, 0, Math.min(W, img.width), Math.min(H, img.height)), x, y + 8);
});
const previewDir = join(root, 'docs', 'art-previews');
if (!existsSync(previewDir)) mkdirSync(previewDir, { recursive: true });
writePng(join(previewDir, `${game}-intro.png`), sheet);
const total = spec.panels.reduce((s, p) => s + p.durationMs, 0) / 1000;
console.log(`${game} intro: ${spec.panels.length} panels, ${total} s -> content/${game}/cinematics/intro.json`);
