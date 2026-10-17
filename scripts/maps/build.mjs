// Builds the Intereses act maps (Tiled JSON) from the ASCII sources in scripts/maps/src/.
//   node scripts/maps/build.mjs            -> every source
//   node scripts/maps/build.mjs camino     -> one map
// The JSON in content/intereses/maps/ is what the game loads and what Tiled opens. While a
// map still has a source here, edit the source and rebuild (a Tiled edit would be overwritten).
// Source format: see docs/MAPS.md, "Fuentes".
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tileId, tilesetJson } from './tileset.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(import.meta.dirname, 'src');
const OUT = join(ROOT, 'content', 'intereses', 'maps');
const T = 32;

export const TERRAIN_CHARS = {
  '.': 'stone',
  ',': 'dirt',
  ';': 'slag',
  '=': 'planks',
  H: 'scaffold',
  '#': 'wall',
  '+': 'door_closed',
  '/': 'door_open',
  '-': 'rails',
  '|': 'rails_v',
  v: 'vault',
};

function props(obj = {}) {
  return Object.entries(obj).map(([name, value]) => ({
    name,
    type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string',
    value,
  }));
}

export function buildMap(src) {
  const rows = src.terrain;
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const heights = src.height ?? [];
  if (heights.length && heights.length !== height) throw new Error(`${src.id}: height grid has ${heights.length} rows, terrain ${height}`);
  const data = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = rows[y][x] ?? ' ';
      if (c === ' ') {
        data.push(0);
        continue;
      }
      const terrain = TERRAIN_CHARS[c];
      if (!terrain) throw new Error(`${src.id}: unknown terrain char '${c}' at ${x},${y}`);
      const hc = heights[y]?.[x] ?? '0';
      const h = /[0-9]/.test(hc) ? Number(hc) : 0;
      data.push(tileId(terrain, h) + 1);
    }
  }

  let nextId = 1;
  const point = (name, [x, y], properties) => ({
    id: nextId++,
    name,
    type: '',
    point: true,
    x: x * T + T / 2,
    y: y * T + T / 2,
    width: 0,
    height: 0,
    rotation: 0,
    visible: true,
    ...(properties ? { properties: props(properties) } : {}),
  });
  const rect = (name, [x, y, w, h], properties) => ({
    id: nextId++,
    name,
    type: '',
    x: x * T,
    y: y * T,
    width: w * T,
    height: h * T,
    rotation: 0,
    visible: true,
    ...(properties ? { properties: props(properties) } : {}),
  });

  let layerId = 1;
  const group = (name, objects) => ({ id: layerId++, name, type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects });
  const layers = [
    { id: layerId++, name: 'ground', type: 'tilelayer', width, height, x: 0, y: 0, opacity: 1, visible: true, data },
    group('spawns', Object.entries(src.spawns ?? {}).map(([name, at]) => point(name, at))),
    group('lights', (src.lights ?? []).map((l) => point(l.name, l.at, { radius: l.radius ?? 4, intensity: l.intensity ?? 1, color: l.color ?? '#ff9a3c', flicker: l.flicker ?? 0.15, ...(l.prop ? { prop: l.prop } : {}) }))),
    group('encounters', (src.encounters ?? []).map((e) => rect(e.name, e.rect, { participants: e.participants.join(','), ...(e.props ?? {}) }))),
    group('surfaces', (src.surfaces ?? []).map((s) => rect(s.name, s.rect, { surface: s.surface }))),
    group('traps', (src.traps ?? []).map((t) => rect(t.name, t.rect, t.props))),
    group('exits', (src.exits ?? []).map((e) => rect(e.name, e.rect, { to: e.to, spawn: e.spawn, ...(e.props ?? {}) }))),
  ];
  for (const [name, zones] of Object.entries(src.zones ?? {})) layers.push(group(name, zones.map((z) => rect(z.name, z.rect, z.props))));

  return {
    compressionlevel: -1,
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width,
    height,
    tilewidth: T,
    tileheight: T,
    infinite: false,
    nextlayerid: layerId,
    nextobjectid: nextId,
    properties: props({ name: src.name, ambientLight: src.ambientLight ?? 1, ...(src.properties ?? {}) }),
    layers,
    tilesets: [tilesetJson()],
  };
}

/** JSON with the ground data laid out one map row per line (readable diffs). */
export function formatMap(json) {
  const ground = json.layers.find((l) => l.name === 'ground');
  const rows = [];
  for (let y = 0; y < json.height; y++) rows.push(ground.data.slice(y * json.width, (y + 1) * json.width).join(','));
  const text = JSON.stringify({ ...json, layers: json.layers.map((l) => (l === ground ? { ...l, data: '__DATA__' } : l)) }, null, 1);
  return text.replace('"__DATA__"', `[\n${rows.join(',\n')}\n]`) + '\n';
}

const only = process.argv[2];
for (const file of readdirSync(SRC).filter((f) => f.endsWith('.mjs')).sort()) {
  const src = (await import(pathToFileURL(join(SRC, file)).href)).default;
  if (only && src.id !== only) continue;
  writeFileSync(join(OUT, `${src.id}.json`), formatMap(buildMap(src)));
  console.log(`Wrote content/intereses/maps/${src.id}.json`);
}
