// Generates the placeholder isometric tileset (public/assets/placeholder/tiles.png).
// One 64x32 diamond per tile id, matching the tileset embedded in content/maps/*.json.
// Replace with real art later; see TODO-ART.md.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TW = 64;
const TH = 32;
// Order = Tiled tile id. Dark, desaturated palette.
const TILES = [
  { name: 'stone h0', rgb: [74, 74, 80] },
  { name: 'stone h1', rgb: [88, 88, 96] },
  { name: 'stone h2', rgb: [104, 104, 112] },
  { name: 'dirt', rgb: [75, 61, 48] },
  { name: 'slag', rgb: [44, 42, 46] },
  { name: 'wall', rgb: [58, 52, 56] },
  { name: 'planks', rgb: [90, 70, 48] },
];

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
      const d = Math.abs(x + 0.5 - TW / 2) / (TW / 2) + Math.abs(y + 0.5 - TH / 2) / (TH / 2);
      if (d > 1) continue;
      let shade = 0.9 + noise(x, y, t) * 0.2;
      if (d > 0.93) shade *= 0.6; // outline
      else if (y < TH / 2 && d > 0.85) shade *= 1.15; // top-edge highlight
      if (tile.name === 'planks' && y % 6 === 0) shade *= 0.7;
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

mkdirSync('public/assets/placeholder', { recursive: true });
writeFileSync(
  'public/assets/placeholder/tiles.png',
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log(`Wrote ${TILES.length} placeholder tiles (${width}x${TH}).`);
