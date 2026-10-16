// Registers animated sprites that already live in a packed atlas (e.g. 0x72 DungeonTileset II).
//   node scripts/art/build-atlas-sprites.ts <game> <preset>
// Reads content/<game>/art/<preset>/sprites.json, copies the atlas into
// content/<game>/public/assets/<preset>/ and writes 'frames' sprite entries
// (rects per animation) into content/<game>/assets/<preset>.json.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readSpriteList } from './sprite-list.ts';

const [game = 'intereses', preset = '0x72'] = process.argv.slice(2);
const root = join(import.meta.dirname, '..', '..');
const gameDir = join(root, 'content', game);
const spec = JSON.parse(readFileSync(join(gameDir, 'art', preset, 'sprites.json'), 'utf8')) as {
  atlas: string;
  tileList: string;
  /** Which way the art faces; the renderer flips it for the other side. */
  facing: 'left' | 'right';
  /** Logical animation -> suffix in the sprite list, e.g. { "idle": "idle_anim", "move": "run_anim" }. */
  animations: Record<string, string>;
  sprites: Record<string, { prefix: string }>;
};

const list = readSpriteList(join(root, 'art-src', spec.tileList));
const outDir = join(gameDir, 'public', 'assets', preset);
mkdirSync(outDir, { recursive: true });
const atlasName = basename(spec.atlas);
copyFileSync(join(root, 'art-src', spec.atlas), join(outDir, atlasName));

const manifestPath = join(gameDir, 'assets', `${preset}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const [id, s] of Object.entries(spec.sprites)) {
  const animations: Record<string, { x: number; y: number; w: number; h: number }[]> = {};
  for (const [anim, suffix] of Object.entries(spec.animations)) {
    const frames = [];
    for (let f = 0; list[`${s.prefix}_${suffix}_f${f}`]; f++) frames.push(list[`${s.prefix}_${suffix}_f${f}`]!);
    if (frames.length > 0) animations[anim] = frames;
  }
  if (!animations.idle) throw new Error(`${id}: no idle frames for prefix "${s.prefix}"`);
  manifest.sprites[id] = { kind: 'frames', url: `assets/${preset}/${atlasName}`, facing: spec.facing, animations };
  console.log(`${id}: ${Object.entries(animations).map(([a, f]) => `${a}(${f.length})`).join(', ')}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
