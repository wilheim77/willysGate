// Builds Willy's inventory and meta UI art into assets/<preset>/icons.png and the manifest's `ui`:
//   item-<id>            16x16 item icons from content/<game>/art/<preset>/icons.json (shape + colours)
//   logro-cat-<cat>      24x24 achievement badges, one per category of data/achievements.json
//   logro-bloqueado      24x24 locked badge
//   marco-<rareza>       18x18 rarity frames for item icons (bronce, plata, oro, legendaria)
//   caja-<nivel>-cerrada / -abierta / -tapa-1..3   64x64 loot boxes for the opening overlay
//   node scripts/art/build-icons.ts [game=willy] [preset=ninja]
// Runs after build-willy-art.ts (which rewrites `ui`); entries are merged, not replaced.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Image, blank, blit, writePng } from './png.ts';
import { type Rgb, hexToRgb, mix } from './color.ts';
import { drawText } from './font.ts';

const [game = 'willy', preset = 'ninja'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'icons.json'), 'utf8')) as {
  shapes: Record<string, string[]>;
  items: Record<string, { shape: string; colors: Record<string, string> }>;
};
const achievements = JSON.parse(readFileSync(join(gameDir, 'data', 'achievements.json'), 'utf8')) as { categorias: Record<string, string> };
const OUT = hexToRgb('#1e1c24');

function px(img: Image, x: number, y: number, c: Rgb | string, a = 255): void {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const col = typeof c === 'string' ? hexToRgb(c) : c;
  const i = (y * img.width + x) * 4;
  [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [col[0], col[1], col[2], a];
}
const opaque = (img: Image, x: number, y: number) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3]! > 0;
function outline(img: Image): Image {
  const out = blank(img.width, img.height);
  img.data.copy(out.data);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (opaque(img, x, y)) continue;
    if (opaque(img, x + 1, y) || opaque(img, x - 1, y) || opaque(img, x, y + 1) || opaque(img, x, y - 1)) px(out, x, y, OUT);
  }
  return out;
}
function disc(img: Image, cx: number, cy: number, r: number, c: string): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(img, x, y, c);
}
function rect(img: Image, x: number, y: number, w: number, h: number, c: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(img, xx, yy, c);
}
function ascii(img: Image, x0: number, y0: number, rows: string[], legend: Record<string, string>): void {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === ' ') return;
    const c = legend[ch];
    if (c) px(img, x0 + x, y0 + y, c);
  }));
}
function scale(img: Image, k: number): Image {
  const out = blank(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const s = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
    img.data.copy(out.data, (y * out.width + x) * 4, s, s + 4);
  }
  return out;
}

// --- Item icons -----------------------------------------------------------------------------------
const DEFAULTS: Record<string, string> = { A: '#8a9098', a: '#5a5e66', B: '#c0c6ce', b: '#8a9098', W: '#ffffff', D: '#1e1c24', G: '#8a9098', Y: '#ffe04f' };
function itemIcon(id: string): Image {
  const it = spec.items[id]!;
  const rows = spec.shapes[it.shape];
  if (!rows) throw new Error(`icons.json: ${id} uses unknown shape "${it.shape}"`);
  const legend = { ...DEFAULTS, ...it.colors };
  const w = Math.max(...rows.map((r) => r.length));
  const img = blank(16, 16);
  ascii(img, Math.floor((16 - w) / 2), Math.floor((16 - rows.length) / 2), rows, legend);
  return outline(img);
}

// --- Achievement badges ----------------------------------------------------------------------------
const GLYPHS: Record<string, { rows: string[]; color: string }> = {
  'primeros-pasos': { color: '#40c060', rows: ['..WW.....', '.WWWW....', '.WWWW....', '..WW..WW.', '......WWW', '......WWW', '.......WW'] },
  combate: { color: '#e0302a', rows: ['W.......W', '.W.....W.', '..W...W..', '...W.W...', '....W....', '...W.W...', '.WW...WW.'] },
  entorno: { color: '#ff8a20', rows: ['..WWWWW..', '.WW...WW.', '.WWWWWWW.', '.W.....W.', '.WWWWWWW.', '.WW...WW.', '..WWWWW..'] },
  estupideces: { color: '#ffe04f', rows: ['...WWW...', '..W...W..', '..W.W.W..', '..W...W..', '...WWW...', '....W....', '...W.W...'] },
  cajas: { color: '#c07a45', rows: ['WWWWWWWWW', 'W...W...W', 'WWWWWWWWW', 'W...W...W', 'W...W...W', 'W...W...W', 'WWWWWWWWW'] },
  audiencia: { color: '#4fe8ff', rows: ['..WWWWW..', '.W.....W.', 'W..WWW..W', 'W.WW.WW.W', 'W..WWW..W', '.W.....W.', '..WWWWW..'] },
  patrocinadores: { color: '#f2c14e', rows: ['....W....', '..WWWWW..', '.W..W....', '..WWWWW..', '....W..W.', '..WWWWW..', '....W....'] },
  plantas: { color: '#b0a89e', rows: ['..WWWWW..', '.W..W..W.', 'W...W...W', 'W...WWW.W', 'W.......W', '.W.....W.', '..WWWWW..'] },
  progresion: { color: '#b45cff', rows: ['....W....', '...WWW...', '..WWWWW..', '.WW.W.WW.', '....W....', '....W....', '....W....'] },
  desafio: { color: '#8e1f3a', rows: ['..WWWWW..', '.WWWWWWW.', '.W..W..W.', '.WWWWWWW.', '..WW.WW..', '..W.W.W..', '.........'] },
  secretos: { color: '#5a4488', rows: ['..WWWW...', '.W....W..', '......W..', '....WW...', '...W.....', '.........', '...W.....'] },
  ingeniero: { color: '#4fe8ff', rows: ['W.......W', '.W..W..W.', '..W.W.W..', '....W....', '...WWW...', '..W.W.W..', '.W..W..W.'] },
  funcionario: { color: '#a8c0e0', rows: ['...WWW...', '...WWW...', '....W....', '..WWWWW..', '.WWWWWWW.', '.........', 'WWWWWWWWW'] },
  basket: { color: '#e87a2a', rows: ['..WWWWW..', '.W..W..W.', 'W..W.W..W', 'WWWWWWWWW', 'W..W.W..W', '.W..W..W.', '..WWWWW..'] },
};
function badge(color: string, glyph: string[] | null, locked = false): Image {
  const img = blank(24, 24);
  // Ribbon tails.
  for (let y = 16; y < 24; y++) for (const x0 of [6, 13]) for (let x = x0; x < x0 + 5; x++) if (!(y === 23 && x === x0 + 2)) px(img, x, y, locked ? '#5a5e66' : x0 === 6 ? '#e0302a' : '#3a6ab0');
  const rim = hexToRgb(locked ? '#8a9098' : '#e0c060'), body = hexToRgb(locked ? '#3a3e46' : color);
  disc(img, 11.5, 10.5, 10, `#${rim.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const d = Math.hypot(x - 11.5, y - 10.5);
    if (d <= 8) px(img, x, y, d > 7 ? mix(body, [0, 0, 0], 0.35) : y < 8 ? mix(body, [255, 255, 255], 0.2) : body);
  }
  px(img, 7, 4, '#ffffff'); px(img, 6, 5, '#ffffff');
  if (glyph) ascii(img, 7, 7, glyph, { W: locked ? '#8a9098' : '#ffffff' });
  else drawText(img, '?', 10, 8, hexToRgb('#c0c6ce'), 1);
  return outline(img);
}

// --- Rarity frames ---------------------------------------------------------------------------------
const RARITY: Record<string, [string, string]> = { bronce: ['#c07a45', '#7a4a20'], plata: ['#c9d1d9', '#7a8088'], oro: ['#f2c14e', '#a87a10'], legendaria: ['#b45cff', '#5a2a9a'] };
function rarityFrame([light, dark]: [string, string]): Image {
  const img = blank(18, 18);
  for (let i = 0; i < 18; i++) {
    px(img, i, 0, OUT); px(img, i, 17, OUT); px(img, 0, i, OUT); px(img, 17, i, OUT);
    if (i > 0 && i < 17) { px(img, i, 1, light); px(img, 1, i, light); px(img, i, 16, dark); px(img, 16, i, dark); }
  }
  for (const [x, y] of [[1, 1], [16, 1], [1, 16], [16, 16]]) px(img, x!, y!, '#ffffff');
  return img;
}

// --- Loot boxes (drawn at 32x32, shown at 64x64) ------------------------------------------------------
const BOX: Record<string, { body: [string, string, string]; band: string; deco: 'tape' | 'rivets' | 'notes' | 'stars' }> = {
  bronce: { body: ['#7a4a20', '#a8743e', '#d09a5a'], band: '#e0c890', deco: 'tape' },
  plata: { body: ['#6a7078', '#a8b0b8', '#e0e8f0'], band: '#3a8fd9', deco: 'rivets' },
  oro: { body: ['#a87a10', '#e8b830', '#fff0a0'], band: '#e0302a', deco: 'notes' },
  legendaria: { body: ['#3a1a6a', '#7a3ac0', '#c890ff'], band: '#4fe8ff', deco: 'stars' },
};
/** lid: 0 closed, 1-3 lifting (tapa frames), 4 thrown open with the glow. */
function lootBox(kind: string, lid: number): Image {
  const b = BOX[kind]!;
  const img = blank(32, 32);
  const [d, m, l] = b.body;
  // Glow and rays from inside once it opens.
  // Straight beams fanning up out of the box, longer as the lid lifts.
  const rays = () => {
    const len = lid === 4 ? 15 : lid === 3 ? 9 : 5;
    for (const ang of [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75]) {
      for (let t = 2; t < len; t++) {
        const bx = 15.5 + Math.sin(ang) * t, by = 15 - Math.cos(ang) * t;
        px(img, bx, by, t < len - 3 ? '#fff4c0' : '#ffe04f');
        if (t < len - 4) px(img, bx + 1, by, '#ffe04f', 160);
      }
    }
  };
  if (lid === 2 || lid === 3) rays();
  // Body.
  rect(img, 5, 15, 22, 15, m);
  rect(img, 5, 15, 22, 1, l);
  rect(img, 5, 15, 1, 15, l);
  rect(img, 26, 15, 1, 15, d);
  rect(img, 5, 29, 22, 1, d);
  rect(img, 14, 15, 4, 15, b.band);
  // Lid.
  const lift = [0, 2, 4, 6, 0][lid]!;
  if (lid < 4) {
    rect(img, 4, 10 - lift, 24, 6, m);
    rect(img, 4, 10 - lift, 24, 1, l);
    rect(img, 4, 15 - lift, 24, 1, d);
    rect(img, 14, 10 - lift, 4, 6, b.band);
    // Bow on top.
    for (const [x, y] of [[12, 8], [13, 7], [14, 8], [17, 8], [18, 7], [19, 8], [15, 9], [16, 9]]) px(img, x!, y! - lift, b.band);
    if (lid > 0) for (let x = 6; x < 26; x += 2) px(img, x, 16 - lift, '#fff4c0');
  } else {
    // Lid flung back: a thin strip leaning behind the box, then the light pouring out over it.
    rect(img, 6, 12, 20, 2, d);
    rect(img, 14, 12, 4, 2, b.band);
    rays();
    rect(img, 6, 15, 20, 2, '#fff4c0');
  }
  // Decoration per tier.
  if (b.deco === 'tape') for (const x of [8, 22]) rect(img, x, 20, 2, 6, '#d0b880');
  if (b.deco === 'rivets') for (const [x, y] of [[7, 18], [24, 18], [7, 27], [24, 27]]) px(img, x!, y!, '#ffffff');
  if (b.deco === 'notes') for (const [x, y] of [[8, 20], [23, 22]]) ascii(img, x!, y!, ['.kk', '.k.', 'kk.'], { k: '#5a3a10' });
  if (b.deco === 'stars') for (const [x, y] of [[8, 21], [23, 19], [10, 26]]) ascii(img, x!, y!, ['.w.', 'www', '.w.'], { w: '#ffffff' });
  // Channel logo: an eye on the front.
  ascii(img, 13, 22, ['.kkkk.', 'kwkkwk', '.kkkk.'], { k: '#1e1c24', w: '#ffffff' });
  if (lid === 4) for (const [x, y, c] of [[3, 6, '#ff4fa0'], [28, 3, '#4fe8ff'], [8, 1, '#ffe04f'], [24, 9, '#40c060'], [1, 12, '#ffe04f']] as const) (px(img, x, y, c), px(img, x + 1, y, c));
  return outline(img);
}

// --- Build -----------------------------------------------------------------------------------------
type Entry = { id: string; img: Image };
const entries: Entry[] = [];
for (const id of Object.keys(spec.items)) entries.push({ id: `item-${id}`, img: itemIcon(id) });
for (const cat of Object.keys(achievements.categorias)) {
  const g = GLYPHS[cat];
  if (!g) throw new Error(`no badge glyph for achievement category "${cat}"`);
  entries.push({ id: `logro-cat-${cat}`, img: badge(g.color, g.rows) });
}
entries.push({ id: 'logro-bloqueado', img: badge('#3a3e46', null, true) });
for (const [k, c] of Object.entries(RARITY)) entries.push({ id: `marco-${k}`, img: rarityFrame(c) });
for (const k of Object.keys(BOX)) {
  entries.push({ id: `caja-${k}-cerrada`, img: scale(lootBox(k, 0), 2) });
  for (const t of [1, 2, 3]) entries.push({ id: `caja-${k}-tapa-${t}`, img: scale(lootBox(k, t), 2) });
  entries.push({ id: `caja-${k}-abierta`, img: scale(lootBox(k, 4), 2) });
}

// Shelf-pack into rows of at most 512 px.
const W = 512;
let x = 0, y = 0, rowH = 0;
const placed: Record<string, { x: number; y: number; w: number; h: number }> = {};
for (const e of entries) {
  if (x + e.img.width > W) (x = 0, y += rowH, rowH = 0);
  placed[e.id] = { x, y, w: e.img.width, h: e.img.height };
  x += e.img.width;
  rowH = Math.max(rowH, e.img.height);
}
const sheet = blank(W, y + rowH);
for (const e of entries) blit(sheet, e.img, placed[e.id]!.x, placed[e.id]!.y);
const url = `assets/${preset}/icons.png`;
mkdirSync(join(gameDir, 'public', 'assets', preset), { recursive: true });
writePng(join(gameDir, 'public', url), sheet);
const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const id of Object.keys(manifest.ui ?? {})) if (manifest.ui[id].url === url) delete manifest.ui[id];
manifest.ui = { ...manifest.ui, ...Object.fromEntries(entries.map((e) => [e.id, { url, ...placed[e.id]! }])) };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// Preview: everything at 3x on the HUD colour.
const K = 3;
const prev = blank(sheet.width * K, sheet.height * K);
for (let i = 0; i < prev.data.length; i += 4) [prev.data[i], prev.data[i + 1], prev.data[i + 2], prev.data[i + 3]] = [34, 26, 48, 255];
blit(prev, scale(sheet, K), 0, 0);
writePng(join(root, 'docs', 'art-previews', `${preset}-icons.png`), prev);
console.log(`${preset} icons: ${entries.length} ui entries -> ${url}`);
