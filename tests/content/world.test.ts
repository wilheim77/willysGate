import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type DialogueTree, parseTiledMap } from '../../engine';
import { ACT_MAPS, CAST, TEMPLATES, buildMap, useSprites } from '../../content/intereses/world';
import manifest from '../../content/intereses/assets/0x72.json';

const dir = join(import.meta.dirname, '..', '..', 'content', 'intereses', 'dialogues');
const dialogues: Record<string, DialogueTree> = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as DialogueTree)
    .map((t) => [t.id, t]),
);
const sprites = manifest.sprites as Record<string, unknown>;
useSprites(Object.keys(sprites));
/**
 * Spawns whose cast entry or art is still being written by the content agents (scene 3+).
 * Remove names from here as they land; the test then holds them to the full standard.
 */
const PENDING = new Set(['absalon', 'ivo']);
// Art props the map agent already places (assets/0x72.json) and world.ts does not build yet. Drop once it does.
const PENDING_KINDS = /^$/;

describe('Intereses act maps load into the game', () => {
  for (const id of Object.keys(ACT_MAPS)) {
    it(`${id}: every spawn becomes something, with art`, () => {
      const setup = buildMap(id, dialogues);
      const { spawns } = parseTiledMap(id, ACT_MAPS[id]!);
      const known = new Set(setup.entities.map((e) => e.id));
      const unknown = Object.keys(spawns).filter((n) => !known.has(n) && !PENDING.has(n) && !PENDING_KINDS.test(n) && !/^(entry-|todo-)/.test(n) && !['hero', 'dorotea'].includes(n));
      expect(unknown, `spawns nobody understands on ${id}`).toEqual([]);
      for (const e of setup.entities) {
        if (e.spriteId === 'none' || e.tags.includes('object')) continue;
        expect(sprites[e.spriteId], `${id}/${e.id}: sprite "${e.spriteId}" missing from assets/0x72.json`).toBeDefined();
      }
    });
  }

  it('cast and templates point at real monsters and art', () => {
    for (const [id, c] of Object.entries(CAST)) expect(sprites[c.spriteId] ?? sprites[id], `cast ${id}`).toBeDefined();
    for (const [id, t] of Object.entries(TEMPLATES)) expect(sprites[t.spriteId], `template ${id}`).toBeDefined();
  });
});

describe('Intereses story triggers', () => {
  it('each trigger opens an existing conversation on an existing map', async () => {
    const { triggers } = (await import('../../content/intereses/triggers.json')).default as { triggers: { id: string; dialogue: string; map?: string }[] };
    for (const t of triggers) {
      expect(dialogues[t.dialogue], `trigger ${t.id}`).toBeDefined();
      if (t.map) expect(ACT_MAPS[t.map], `trigger ${t.id} map`).toBeDefined();
    }
  });
});
