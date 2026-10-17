// Builds recoloured character variants from a packed atlas (e.g. 0x72 DungeonTileset II).
//   node scripts/art/build-palette-variants.ts <game> <preset>
//   node scripts/art/build-palette-variants.ts <game> <preset> --dump <prefix>...   (print a base's colours)
// Reads content/<game>/art/<preset>/palettes.json, recolours every frame of each
// base sprite (exact colour map first, then optional HSV adjustments for the
// remaining colours), packs them into public/assets/<preset>/<output> and writes
// 'frames' sprite entries into content/<game>/assets/<preset>.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';
import { type Rect, readSpriteList } from './sprite-list.ts';
import { type Rgb, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './color.ts';

/** HSV adjustment for colours not in the explicit map; optionally limited to a hue range. */
interface Adjust {
  /** Only colours whose hue (degrees) is in [from, to] (wraps past 360) and that are not grey. */
  hue?: [number, number];
  /** Hue shift in degrees. */
  h?: number;
  /** Saturation and value multipliers. */
  s?: number;
  v?: number;
}

interface Variant {
  /** Sprite prefix in the atlas list, e.g. "doc" for doc_idle_anim_f0. */
  base: string;
  /** What this is, for the catalogue and the preview. */
  note?: string;
  /** Exact colour replacements, "#rrggbb" -> "#rrggbb". */
  map?: Record<string, string>;
  adjust?: Adjust[];
  /**
   * Remove pixels of this (outline) colour that no longer touch any other opaque colour,
   * e.g. the outline left behind after mapping a prop of the sprite to "transparent".
   */
  prune?: string;
  /** Targeted replacements applied after map/prune (e.g. only inner pixels, or a band of rows). */
  rules?: Rule[];
}

interface Rule {
  from: string;
  to: string;
  /** Only pixels whose 4 neighbours are all opaque (keeps the outline intact). */
  interior?: boolean;
  /** Only rows [first, last] counted from the top of the frame's opaque area. */
  rows?: [number, number];
}

interface Spec {
  atlas: string;
  tileList: string;
  facing: 'left' | 'right';
  animations: Record<string, string>;
  /** Output sheet name, written to public/assets/<preset>/. */
  output: string;
  variants: Record<string, Variant>;
  /** Extra sprite ids that reuse a variant's art (e.g. older placeholder ids). */
  aliases?: Record<string, string>;
}

const args = process.argv.slice(2);
const [game = 'intereses', preset = '0x72'] = args;
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'palettes.json'), 'utf8')) as Spec;
const list = readSpriteList(join(root, 'art-src', spec.tileList));
const atlas = readPng(join(root, 'art-src', spec.atlas));

/** Every frame rect of a base sprite, grouped by logical animation. */
function framesOf(prefix: string): Record<string, Rect[]> {
  const out: Record<string, Rect[]> = {};
  for (const [anim, suffix] of Object.entries(spec.animations)) {
    const frames: Rect[] = [];
    for (let f = 0; list[`${prefix}_${suffix}_f${f}`]; f++) frames.push(list[`${prefix}_${suffix}_f${f}`]!);
    // Some 0x72 monsters have a single "<name>_anim" loop instead of idle/run.
    if (frames.length === 0 && anim !== 'hit') for (let f = 0; list[`${prefix}_anim_f${f}`]; f++) frames.push(list[`${prefix}_anim_f${f}`]!);
    if (frames.length > 0) out[anim] = frames;
  }
  if (!out.idle) throw new Error(`no idle frames for prefix "${prefix}"`);
  return out;
}

if (args[2] === '--dump') {
  for (const prefix of args.slice(3)) {
    const counts = new Map<string, number>();
    for (const rects of Object.values(framesOf(prefix))) {
      for (const r of rects) {
        const img = crop(atlas, r.x, r.y, r.w, r.h);
        for (let i = 0; i < img.data.length; i += 4) {
          if (img.data[i + 3] === 0) continue;
          const hex = rgbToHex([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]);
          counts.set(hex, (counts.get(hex) ?? 0) + 1);
        }
      }
    }
    console.log(`${prefix}: ${[...counts].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}(${n})`).join(' ')}`);
  }
  process.exit(0);
}

function inHue(h: number, [from, to]: [number, number]): boolean {
  return from <= to ? h >= from && h <= to : h >= from || h <= to;
}

const TRANSPARENT = 'transparent';

function recolour(img: Image, v: Variant): Image {
  const map = new Map(Object.entries(v.map ?? {}).map(([k, val]) => [k.toLowerCase(), val === TRANSPARENT ? null : hexToRgb(val)]));
  const out = blank(img.width, img.height);
  img.data.copy(out.data);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= out.width || y >= out.height ? -1 : (y * out.width + x) * 4);
  const opaque = (x: number, y: number) => at(x, y) >= 0 && out.data[at(x, y) + 3]! > 0;
  const hexAt = (x: number, y: number) => rgbToHex([out.data[at(x, y)]!, out.data[at(x, y) + 1]!, out.data[at(x, y) + 2]!]);

  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const rgb: Rgb = [out.data[i]!, out.data[i + 1]!, out.data[i + 2]!];
    const hex = rgbToHex(rgb);
    if (map.get(hex) === null) {
      out.data[i + 3] = 0;
      continue;
    }
    let next = map.get(hex) ?? undefined;
    if (!next && v.adjust) {
      let [h, s, val] = rgbToHsv(rgb);
      for (const a of v.adjust) {
        if (a.hue && (s < 0.12 || !inHue(h, a.hue))) continue;
        h = (h + (a.h ?? 0) + 360) % 360;
        s = Math.min(1, s * (a.s ?? 1));
        val = Math.min(1, val * (a.v ?? 1));
      }
      next = hsvToRgb([h, s, val]);
    }
    if (next) [out.data[i], out.data[i + 1], out.data[i + 2]] = next;
  }

  if (v.prune) {
    const outline = v.prune.toLowerCase();
    const drop: number[] = [];
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        if (!opaque(x, y) || hexAt(x, y) !== outline) continue;
        let touches = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx || dy) && opaque(x + dx, y + dy) && hexAt(x + dx, y + dy) !== outline) touches = true;
          }
        }
        if (!touches) drop.push(at(x, y));
      }
    }
    for (const i of drop) out.data[i + 3] = 0;
  }

  if (v.rules) {
    const rowHasPixels = (y: number) => {
      for (let x = 0; x < out.width; x++) if (opaque(x, y)) return true;
      return false;
    };
    let top = 0;
    while (top < out.height && !rowHasPixels(top)) top++;
    const writes: [number, Rgb][] = [];
    for (const r of v.rules) {
      const from = r.from.toLowerCase();
      const to = hexToRgb(r.to);
      for (let y = 0; y < out.height; y++) {
        if (r.rows && (y - top < r.rows[0] || y - top > r.rows[1])) continue;
        for (let x = 0; x < out.width; x++) {
          if (!opaque(x, y) || hexAt(x, y) !== from) continue;
          if (r.interior && !(opaque(x - 1, y) && opaque(x + 1, y) && opaque(x, y - 1) && opaque(x, y + 1))) continue;
          writes.push([at(x, y), to]);
        }
      }
    }
    for (const [i, rgb] of writes) [out.data[i], out.data[i + 1], out.data[i + 2]] = rgb;
  }
  return out;
}

// Layout: one row per variant, frames left to right in animation order.
const rows = Object.entries(spec.variants).map(([id, v]) => ({ id, v, anims: framesOf(v.base) }));
const width = Math.max(...rows.map((r) => Object.values(r.anims).flat().reduce((w, f) => w + f.w, 0)));
const height = rows.reduce((h, r) => h + Math.max(...Object.values(r.anims).flat().map((f) => f.h)), 0);
const sheet = blank(width, height);
const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const url = `assets/${preset}/${spec.output}`;

let y = 0;
for (const { id, v, anims } of rows) {
  let x = 0;
  const animations: Record<string, Rect[]> = {};
  for (const [anim, rects] of Object.entries(anims)) {
    animations[anim] = rects.map((r) => {
      blit(sheet, recolour(crop(atlas, r.x, r.y, r.w, r.h), v), x, y);
      const placed = { x, y, w: r.w, h: r.h };
      x += r.w;
      return placed;
    });
  }
  manifest.sprites[id] = { kind: 'frames', url, facing: spec.facing, animations };
  console.log(`${id} (${v.base}): ${Object.entries(animations).map(([a, f]) => `${a}(${f.length})`).join(', ')}`);
  y += Math.max(...Object.values(anims).flat().map((f) => f.h));
}

for (const [alias, target] of Object.entries(spec.aliases ?? {})) {
  if (alias.startsWith('$')) continue;
  if (!manifest.sprites[target]) throw new Error(`alias ${alias}: unknown variant "${target}"`);
  manifest.sprites[alias] = manifest.sprites[target];
  console.log(`${alias} -> ${target}`);
}

const outDir = join(gameDir, 'public', 'assets', preset);
mkdirSync(outDir, { recursive: true });
writePng(join(outDir, spec.output), sheet);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${preset} variants: ${rows.length} sprites -> ${url} (${width}x${height})`);
