// Generates the placeholder isometric tileset (content/intereses/public/assets/placeholder/tiles.png).
// One 64x32 diamond per tile id, matching the tileset embedded in content/intereses/maps/*.json.
// Replace with real art later; see TODO-ART.md.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { LOGIC_TILES } from './maps/tileset.mjs';

const TW = 32;
const TH = 32;
// Order = Tiled tile id. Dark, desaturated palette.
// The list itself lives in scripts/maps/tileset.mjs (shared with the map builder).
const BASE_RGB = {
  stone: [74, 74, 80],
  dirt: [75, 61, 48],
  slag: [44, 42, 46],
  wall: [58, 52, 56],
  planks: [90, 70, 48],
  scaffold: [110, 84, 52],
  door_closed: [70, 40, 30],
  door_open: [40, 30, 26],
  rails: [70, 62, 56],
  rails_v: [70, 62, 56],
  vault: [60, 66, 80],
  scrub: [66, 72, 48],
  rock: [84, 80, 76],
  cobble: [80, 78, 84],
  slag_heap: [50, 46, 48],
  road: [88, 72, 54],
  road_v: [88, 72, 54],
  mud: [58, 50, 40],
  river: [70, 80, 86],
  riverbank: [62, 60, 52],
  riverbank_s: [62, 60, 52],
  riverbank_e: [62, 60, 52],
  riverbank_w: [62, 60, 52],
  fence: [96, 74, 50],
  house: [52, 56, 66],
  house_plain: [52, 56, 66],
  stone_wall: [72, 70, 70],
};
const TILES = LOGIC_TILES.map((t) => {
  const lift = t.walkable === false ? 0 : t.height * 15;
  const name = t.terrain === 'planks' && t.height === 1 ? 'planks' : `${t.terrain} h${t.height}`;
  return { name, level: t.walkable === false ? 0 : t.height, planks: ['planks', 'scaffold', 'rails', 'rails_v'].includes(t.terrain), rgb: BASE_RGB[t.terrain].map((c) => c + lift) };
});

const width = TW * TILES.length;
const px = Buffer.alloc(width * TH * 4);

function noise(x, y, t) {
  let h = (x * 374761393 + y * 668265263 + t * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) & 0xff) / 255;
}

TILES.forEach((tile, t) => {
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      const edge = x === 0 || y === 0 || x === TW - 1 || y === TH - 1;
      let shade = 0.9 + noise(x, y, t) * 0.2;
      if (edge) shade *= 0.6;
      // Raised tiles (h1, h2) get one or two light bars so heights are visible in the editor.
      const level = tile.level;
      if (level > 0 && y >= 4 && y < 4 + level * 4 && y % 4 < 2) shade *= 1.6;
      if (tile.planks && y % 6 === 0) shade *= 0.7;
      const i = (y * width + t * TW + x) * 4;
      px[i] = Math.min(255, tile.rgb[0] * shade);
      px[i + 1] = Math.min(255, tile.rgb[1] * shade);
      px[i + 2] = Math.min(255, tile.rgb[2] * shade);
      px[i + 3] = 255;
    }
  }
});

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(TH, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((width * 4 + 1) * TH);
for (let y = 0; y < TH; y++) px.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);

const OUT_DIR = 'content/intereses/maps';
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  `${OUT_DIR}/terrain-logic.png`,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log(`Wrote ${TILES.length} logic tiles (${width}x${TH}).`);
