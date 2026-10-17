// ASCII preview of the Intereses maps (reads the Tiled JSON, so it also works for maps edited in Tiled).
//   node scripts/maps/dump.mjs            -> every map
//   node scripts/maps/dump.mjs camino     -> one map
// Legend: '.' stone ',' dirt ';' slag '=' planks 'H' scaffold '#' wall '+' closed door '/' open door,
// '-' rails '|' rails_v 'v' vault, ' ' void; the right-hand grid shows heights ('#' = not walkable). Overlays: '@' hero, letters = spawns
// (listed below), '*' light, '^' trap, 'E' exit, '%' oil/grease, 'w' water, '&' rubble.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', '..', 'content', 'intereses', 'maps');
const CHAR = { stone: '.', dirt: ',', slag: ';', planks: '=', scaffold: 'H', wall: '#', door_closed: '+', door_open: '/', rails: '-', rails_v: '|', vault: 'v' };
const SURFACE = { oil: '%', grease: '%', water: 'w', rubble: '&', fire: 'f', ice: 'i', blood: 'b' };
const PROP = { barrel_oil: 'o', barrel: 'u', crate: 'x', chest: 'c', lever: 'l', door: 'd', powder_keg: 'o', mine_wagon: 'x', mine_wagon_ore: 'x', resonator: 'r', oil_cart: 'x', well: 'O', campfire: '*', gallows: 'T', tapestry: 't', tapestry_crossbow: 't', fuse_charges: 'f', remains_forty: 'k', pulley: 'p', inscription: 'i' };

export function dump(id) {
  const json = JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8'));
  const P = (props) => Object.fromEntries((props ?? []).map((p) => [p.name, p.value]));
  const defs = new Map();
  for (const ts of json.tilesets) for (const t of ts.tiles ?? []) defs.set(ts.firstgid + t.id, P(t.properties));
  const ground = json.layers.find((l) => l.name === 'ground');
  const grid = [];
  const heights = [];
  for (let y = 0; y < json.height; y++) {
    const row = [];
    const hrow = [];
    for (let x = 0; x < json.width; x++) {
      const gid = ground.data[y * json.width + x] & 0x0fffffff;
      const d = defs.get(gid);
      row.push(d ? CHAR[d.terrain] ?? '?' : ' ');
      hrow.push(!d ? ' ' : d.walkable === false ? '#' : String(d.height ?? 0));
    }
    grid.push(row);
    heights.push(hrow.join(''));
  }
  const tile = (o) => [Math.floor(o.x / json.tilewidth), Math.floor(o.y / json.tileheight)];
  const put = (x, y, c) => {
    if (grid[y]?.[x] !== undefined) grid[y][x] = c;
  };
  const legend = [];
  const layer = (name) => json.layers.find((l) => l.name === name)?.objects ?? [];
  for (const s of layer('surfaces')) {
    const [x0, y0] = tile(s);
    for (let y = y0; y < y0 + s.height / json.tileheight; y++)
      for (let x = x0; x < x0 + s.width / json.tilewidth; x++) put(x, y, SURFACE[P(s.properties).surface] ?? 's');
  }
  for (const t of layer('traps')) {
    const [x, y] = tile(t);
    put(x, y, '^');
    legend.push(`^ ${t.name} (${x},${y}) ${JSON.stringify(P(t.properties))}`);
  }
  for (const e of layer('exits')) {
    const [x, y] = tile(e);
    const p = P(e.properties);
    for (let yy = y; yy < y + e.height / json.tileheight; yy++) for (let xx = x; xx < x + e.width / json.tilewidth; xx++) put(xx, yy, 'E');
    legend.push(`E ${e.name} (${x},${y}) -> ${p.to}:${p.spawn}`);
  }
  for (const l of layer('lights')) {
    const [x, y] = tile(l);
    put(x, y, '*');
  }
  let letter = 0;
  const letters = 'ABCDFGIJKLMNOPQRSTUVXYZabdefghjkmnpqrstvyz0123456789';
  for (const s of layer('spawns')) {
    const [x, y] = tile(s);
    const kind = s.name.split('-')[0];
    const c = s.name === 'hero' ? '@' : PROP[kind] ?? letters[letter++ % letters.length];
    put(x, y, c);
    if (!PROP[kind]) legend.push(`${c} ${s.name} (${x},${y})`);
  }
  const props = layer('spawns').filter((s) => PROP[s.name.split('-')[0]]).map((s) => s.name);
  if (props.length) legend.push(`props: ${props.join(', ')}`);
  for (const e of layer('encounters')) legend.push(`encounter ${e.name}: ${P(e.properties).participants}`);
  const KNOWN = ['ground', 'spawns', 'lights', 'surfaces', 'traps', 'exits', 'encounters'];
  for (const l of json.layers.filter((l) => l.type === 'objectgroup' && !KNOWN.includes(l.name)))
    for (const e of l.objects) legend.push(`${l.name} ${e.name} (${tile(e)} ${e.width / json.tilewidth}x${e.height / json.tileheight}) ${JSON.stringify(P(e.properties))}`);
  const name = P(json.properties).name;
  return [`== ${id}: ${name} (${json.width}x${json.height}, ambient ${P(json.properties).ambientLight})`, ...grid.map((r, y) => `${r.join('')}   ${heights[y]}`), ...legend].join('\n');
}

const only = process.argv[2];
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const id = f.replace(/\.json$/, '');
  if (only && id !== only) continue;
  console.log(dump(id) + '\n');
}
