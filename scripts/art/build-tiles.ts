// Builds a terrain atlas for one art preset of a game from content/<game>/art/<preset>/tiles.json.
//   node scripts/art/build-tiles.ts <game> <preset>
// Writes content/<game>/public/assets/<preset>/tiles/terrain.png and updates the
// 'tilesets.terrain' and 'terrain' entries of content/<game>/assets/<preset>.json.
//
// Cells are [col, row] in a grid of tileSize, sprite names looked up in a
// "name x y w h" list (e.g. 0x72's tile_list, given as "tileList"), or
// { "atlas": "<other sheet>", "cell": [col, row] } to mix packs in one preset, or
// { "atlas": "<sheet>.png", "sprite": "name" } with a "name x y w h" list in <sheet>.txt.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, crop, isOpaque, readPng, writePng } from './png.ts';
import { readSpriteList } from './sprite-list.ts';

type Cell = [number, number] | string | { atlas: string; cell: [number, number] } | { atlas: string; sprite: string };

const [game = 'intereses', preset = 'lpc'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'tiles.json'), 'utf8')) as {
  atlas: string;
  tileList?: string;
  tileSize: number;
  terrain: Record<string, { top: Cell[]; face: Cell; rim?: Cell; blend?: { priority: number; edges: Record<string, Cell> } }>;
};
const T = spec.tileSize;
const atlas = readPng(join(root, 'art-src', spec.atlas));
const extraAtlases = new Map<string, Image>();
const loadAtlas = (path: string): Image => {
  if (!extraAtlases.has(path)) extraAtlases.set(path, readPng(join(root, 'art-src', path)));
  return extraAtlases.get(path)!;
};
const named = spec.tileList ? readSpriteList(join(root, 'art-src', spec.tileList)) : {};

const frames: Image[] = [];
const cell = (c: Cell, what: string, partial = false) => {
  let img: Image;
  if (!Array.isArray(c) && typeof c === 'object' && 'sprite' in c) {
    const r = readSpriteList(join(root, 'art-src', c.atlas.replace(/\.png$/, '.txt')))[c.sprite];
    if (!r) throw new Error(`${what}: unknown sprite "${c.sprite}" in ${c.atlas}`);
    img = crop(loadAtlas(c.atlas), r.x, r.y, T, T);
  } else if (!Array.isArray(c) && typeof c === 'object') {
    img = crop(loadAtlas(c.atlas), c.cell[0] * T, c.cell[1] * T, T, T);
  } else if (typeof c === 'string') {
    const r = named[c];
    if (!r) throw new Error(`${what}: unknown sprite "${c}"`);
    img = crop(atlas, r.x, r.y, T, T);
  } else {
    img = crop(atlas, c[0] * T, c[1] * T, T, T);
  }
  if (!partial && !isOpaque(img)) console.warn(`warning: ${what} ${JSON.stringify(c)} has transparent pixels`);
  frames.push(img);
  return frames.length - 1;
};

const terrain: Record<string, { tileset: string; frames: number[]; face: number; rim?: number; blend?: { priority: number; edges: Record<string, number> } }> = {};
for (const [id, t] of Object.entries(spec.terrain)) {
  terrain[id] = {
    tileset: 'terrain',
    frames: t.top.map((c) => cell(c, `${id} top`)),
    face: cell(t.face, `${id} face`),
    // Optional lip strip (top rows of the cell) for renderers that draw platform edges.
    ...(t.rim ? { rim: cell(t.rim, `${id} rim`, true) } : {}),
    // Optional blend fringes, drawn over lower-priority neighbours (edges.n = along their north edge).
    ...(t.blend
      ? { blend: { priority: t.blend.priority, edges: Object.fromEntries(Object.entries(t.blend.edges).map(([side, c]) => [side, cell(c, `${id} blend ${side}`, true)])) } }
      : {}),
  };
}

const sheet = blank(T * frames.length, T);
frames.forEach((f, i) => blit(sheet, f, i * T, 0));
const outDir = join(gameDir, 'public', 'assets', preset, 'tiles');
mkdirSync(outDir, { recursive: true });
writePng(join(outDir, 'terrain.png'), sheet);

const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.tilesets = { ...manifest.tilesets, terrain: { url: `assets/${preset}/tiles/terrain.png`, frameWidth: T, frameHeight: T } };
manifest.terrain = terrain;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${preset} terrain: ${frames.length} frames for ${Object.keys(terrain).length} terrains`);
