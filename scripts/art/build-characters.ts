// Builds LPC character spritesheets from content/<game>/art/<preset>/characters.json.
//   node scripts/art/build-characters.ts <game> <preset>
//
// Layers come from the Universal LPC Spritesheet Character Generator repository,
// pinned to the commit in the config. Needed files (sheet definitions, palettes,
// PNGs) are downloaded once into art-src/lpc-generator/ and committed, so builds
// are reproducible offline.
//
// For every character it writes:
//   content/<game>/public/assets/<preset>/characters/<id>.png   all animations stacked
// and updates the manifest's 'sprites' entry, plus CREDITS-characters.csv with the
// per-layer credits from the generator's metadata (authors, licenses, URLs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Image, blank, blit, crop, readPng, writePng } from './png.ts';

const REPO = 'LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator';
const BASE = 64;
/** Oversized weapon animations: generator custom animation -> standard animation it extends. */
const CUSTOM_TO_STANDARD: Record<string, { anim: string; frameSize: number }> = {
  slash_128: { anim: 'slash', frameSize: 128 },
  thrust_oversize: { anim: 'thrust', frameSize: 192 },
  walk_128: { anim: 'walk', frameSize: 128 },
};

interface LayerSpec {
  /** Path under sheet_definitions/ without .json, e.g. "torso/cape/cape_tattered". */
  item: string;
  /** Variant name (for items with baked colour variants) or palette colour (single recolour). */
  color?: string;
  /** Per-channel palette colours for items with several recolour channels (color_1, color_2...). */
  colors?: Record<string, string>;
}

interface CharacterSpec {
  bodyType: string;
  layers: LayerSpec[];
}

interface Config {
  generatorCommit: string;
  animations: string[];
  characters: Record<string, CharacterSpec>;
}

type Json = Record<string, unknown>;

const [game = 'intereses', preset = 'lpc'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const config = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'characters.json'), 'utf8')) as Config;
const cacheDir = join(root, 'art-src', 'lpc-generator');

// --- Source files (download once, then cached in art-src/) ----------------

async function source(path: string): Promise<Buffer | null> {
  const local = join(cacheDir, path);
  const missingMarker = `${local}.missing`;
  if (existsSync(local)) return readFileSync(local);
  if (existsSync(missingMarker)) return null;
  const url = `https://raw.githubusercontent.com/${REPO}/${config.generatorCommit}/${path}`;
  const res = await fetch(url);
  mkdirSync(dirname(local), { recursive: true });
  if (res.status === 404) {
    writeFileSync(missingMarker, ''); // remember that this layer has no such animation
    return null;
  }
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(local, buf);
  return buf;
}

async function sourceJson(path: string): Promise<Json> {
  const buf = await source(path);
  if (!buf) throw new Error(`Missing ${path} in generator commit ${config.generatorCommit}`);
  return JSON.parse(buf.toString('utf8')) as Json;
}

async function sourcePng(path: string): Promise<Image | null> {
  const buf = await source(path);
  if (!buf) return null;
  const tmp = join(cacheDir, path);
  return readPng(tmp);
}

function checkCommit(): void {
  const marker = join(cacheDir, 'COMMIT');
  if (existsSync(marker) && readFileSync(marker, 'utf8').trim() !== config.generatorCommit) {
    throw new Error(`art-src/lpc-generator was fetched from another commit; delete it to refetch for ${config.generatorCommit}`);
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(marker, config.generatorCommit + '\n');
}

// --- Palettes -------------------------------------------------------------

const paletteCache = new Map<string, Record<string, string[]>>();

/** All named colour ramps of a material (ulpc + lpcr), e.g. material 'cloth'. */
async function materialPalettes(material: string): Promise<{ base: string; ramps: Record<string, string[]> }> {
  const meta = await sourceJson(`palette_definitions/${material}/meta_${material}.json`);
  if (!paletteCache.has(material)) {
    // Base ramps and colour names resolve to the default (ulpc) version first; lpcr only adds names.
    const ramps: Record<string, string[]> = {};
    for (const version of ['lpcr', 'ulpc']) {
      const file = await source(`palette_definitions/${material}/${material}_${version}.json`);
      if (file) Object.assign(ramps, JSON.parse(file.toString('utf8')));
    }
    paletteCache.set(material, ramps);
  }
  return { base: String(meta.base), ramps: paletteCache.get(material)! };
}

const hex = (c: string): number => parseInt(c.replace('#', ''), 16);

/** Exact colour mapping from a material's base ramp to the requested ramp (how the generator recolours). */
async function recolorMap(material: string, base: string | undefined, target: string): Promise<Map<number, number>> {
  const { base: defaultBase, ramps } = await materialPalettes(material);
  const from = ramps[base ?? defaultBase];
  const to = ramps[target];
  if (!from) throw new Error(`Unknown base palette "${base ?? defaultBase}" for ${material}`);
  if (!to) throw new Error(`Unknown colour "${target}" for ${material}. Options: ${Object.keys(ramps).join(', ')}`);
  return new Map(from.map((c, i) => [hex(c), hex(to[i] ?? to[to.length - 1]!)]));
}

function applyRecolor(img: Image, maps: Map<number, number>[]): Image {
  if (maps.length === 0) return img;
  const out: Image = { ...img, data: Buffer.from(img.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    const rgb = (out.data[i]! << 16) | (out.data[i + 1]! << 8) | out.data[i + 2]!;
    for (const m of maps) {
      const to = m.get(rgb);
      if (to !== undefined) {
        out.data[i] = (to >> 16) & 255;
        out.data[i + 1] = (to >> 8) & 255;
        out.data[i + 2] = to & 255;
        break;
      }
    }
  }
  return out;
}

// --- Layers ---------------------------------------------------------------

interface ResolvedLayer {
  item: string;
  zPos: number;
  path: string;
  custom?: string;
  variant?: string;
  recolors: Map<number, number>[];
  credits: Json[];
}

async function resolveLayers(spec: CharacterSpec): Promise<ResolvedLayer[]> {
  const out: ResolvedLayer[] = [];
  for (const layer of spec.layers) {
    const def = await sourceJson(`sheet_definitions/${layer.item}.json`);
    const variants = (def.variants as string[] | undefined) ?? [];
    let variant: string | undefined;
    const recolors: Map<number, number>[] = [];
    const rc = def.recolors as Json | undefined;
    if (variants.length > 0) {
      variant = layer.color ?? variants[0];
      if (!variants.includes(variant!)) throw new Error(`${layer.item}: no variant "${variant}". Options: ${variants.join(', ')}`);
    } else if (rc && 'material' in rc) {
      if (layer.color) recolors.push(await recolorMap(String(rc.material), rc.base as string | undefined, layer.color));
    } else if (rc) {
      for (const [channel, r] of Object.entries(rc as Record<string, Json>)) {
        const color = layer.colors?.[channel] ?? (channel === 'color_1' ? layer.color : undefined);
        if (color) recolors.push(await recolorMap(String(r.material), r.base as string | undefined, color));
      }
    }
    for (let n = 1; n < 10; n++) {
      const l = def[`layer_${n}`] as Json | undefined;
      if (!l) break;
      const path = l[spec.bodyType] as string | undefined;
      if (!path) continue;
      if (path.includes('${')) throw new Error(`${layer.item}: templated layer paths are not supported (${path})`);
      out.push({
        item: layer.item,
        zPos: (l.zPos as number | undefined) ?? 100,
        path,
        custom: l.custom_animation as string | undefined,
        variant,
        recolors,
        credits: (def.credits as Json[] | undefined) ?? [],
      });
    }
  }
  return out.sort((a, b) => a.zPos - b.zPos);
}

/** The standard (64px) sheet of one animation for one layer, or null if the layer has none. */
async function standardSheet(l: ResolvedLayer, anim: string): Promise<Image | null> {
  if (l.custom) return null;
  const file = l.variant ? `${l.path}${anim}/${l.variant}.png` : `${l.path}${anim}.png`;
  const img = await sourcePng(`spritesheets/${file}`);
  return img && applyRecolor(img, l.recolors);
}

async function customSheet(l: ResolvedLayer, anim: string): Promise<{ img: Image; frameSize: number } | null> {
  const c = l.custom && CUSTOM_TO_STANDARD[l.custom];
  if (!c || c.anim !== anim) return null;
  if (!l.variant && l.path.endsWith('/')) return null;
  const img = await sourcePng(`spritesheets/${l.path}${l.variant ?? ''}.png`);
  return img && { img: applyRecolor(img, l.recolors), frameSize: c.frameSize };
}

// --- Composition ------------------------------------------------------------

interface AnimMeta {
  y: number;
  frameSize: number;
  frames: number;
  /** 4 = one row per direction (n, w, s, e); 1 = single row (hurt). */
  rows: number;
}

async function composeAnimation(layers: ResolvedLayer[], anim: string): Promise<{ img: Image; meta: Omit<AnimMeta, 'y'> } | null> {
  const std = await Promise.all(layers.map((l) => standardSheet(l, anim)));
  const custom = await Promise.all(layers.map((l) => customSheet(l, anim)));
  const body = std.find((s) => s);
  if (!body) return null;
  const rows = body.height / BASE;
  const frames = body.width / BASE;
  const frameSize = Math.max(BASE, ...custom.map((c) => c?.frameSize ?? 0));
  const offset = (frameSize - BASE) / 2;
  const img = blank(frames * frameSize, rows * frameSize);
  for (let row = 0; row < rows; row++) {
    for (let f = 0; f < frames; f++) {
      layers.forEach((_, i) => {
        const s = std[i];
        const c = custom[i];
        if (s && s.width >= (f + 1) * BASE && s.height >= (row + 1) * BASE) {
          blit(img, crop(s, f * BASE, row * BASE, BASE, BASE), f * frameSize + offset, row * frameSize + offset);
        } else if (c) {
          const cs = c.frameSize;
          if (c.img.width >= (f + 1) * cs && c.img.height >= (row + 1) * cs) {
            const off = (frameSize - cs) / 2;
            blit(img, crop(c.img, f * cs, row * cs, cs, cs), f * frameSize + off, row * frameSize + off);
          }
        }
      });
    }
  }
  return { img, meta: { frameSize, frames, rows } };
}

/** Which layers lack an animation: used to decide whether the generator's idle is usable. */
async function missingLayers(layers: ResolvedLayer[], anim: string): Promise<string[]> {
  const missing = new Set<string>();
  for (const l of layers) {
    if (l.custom) continue;
    if (!(await standardSheet(l, anim))) missing.add(l.item);
  }
  return [...missing];
}

// --- Main -------------------------------------------------------------------

async function main(): Promise<void> {
  checkCommit();
  const outDir = join(gameDir, 'public', 'assets', preset, 'characters');
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(gameDir, 'assets', `${preset}.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const credits = new Map<string, Json>();

  for (const [id, spec] of Object.entries(config.characters)) {
    const layers = await resolveLayers(spec);
    const parts: { anim: string; img: Image; meta: Omit<AnimMeta, 'y'> }[] = [];
    const notes: string[] = [];
    for (const anim of config.animations) {
      if (anim === 'idle') {
        const missing = await missingLayers(layers, 'idle');
        if (missing.length > 0) {
          notes.push(`idle falls back to walk frame 0 (no idle for: ${missing.join(', ')})`);
          continue;
        }
      }
      const composed = await composeAnimation(layers, anim);
      if (composed) parts.push({ anim, ...composed });
      else notes.push(`no ${anim}`);
    }

    const width = Math.max(...parts.map((p) => p.img.width));
    const height = parts.reduce((h, p) => h + p.img.height, 0);
    const sheet = blank(width, height);
    const animations: Record<string, AnimMeta> = {};
    let y = 0;
    for (const p of parts) {
      blit(sheet, p.img, 0, y);
      animations[p.anim] = { y, ...p.meta };
      y += p.img.height;
    }
    writePng(join(outDir, `${id}.png`), sheet);
    manifest.sprites[id] = { kind: 'lpc', url: `assets/${preset}/characters/${id}.png`, animations };

    for (const l of layers) {
      for (const c of l.credits) {
        const file = String(c.file ?? '');
        if (l.path.startsWith(file)) credits.set(file, c);
      }
    }
    console.log(`${id}: ${parts.map((p) => p.anim).join(', ')}${notes.length ? ` (${notes.join('; ')})` : ''}`);
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const csv = (v: unknown) => `"${String(Array.isArray(v) ? v.join(', ') : (v ?? '')).replace(/"/g, '""')}"`;
  const rows = [...credits.values()]
    .sort((a, b) => String(a.file).localeCompare(String(b.file)))
    .map((c) => [c.file, c.notes, c.authors, c.licenses, c.urls].map(csv).join(','));
  writeFileSync(join(outDir, 'CREDITS-characters.csv'), ['file,notes,authors,licenses,urls', ...rows].join('\n') + '\n');
  console.log(`credits: ${credits.size} source files`);
}

await main();
