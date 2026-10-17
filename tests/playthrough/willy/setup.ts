import { type Entity, type GridMap, createEngine } from '../../../engine';
import { CLASSES, createCreature, createWilly, willy } from '../../../rulesets/willy';
import { asciiMap } from '../../fixtures/helpers';

/**
 * QA fixtures for the Willy ruleset, independent of content/willy (no game.ts, no DOM).
 * Mirrors tests/playthrough/setup.ts for Intereses but for the "El Concurso" ruleset.
 */

export const engine = createEngine(willy, 'willy-qa');

export const CLASS_IDS = Object.keys(CLASSES);

/** Small hand-built arenas: plain floor, a raised platform, a wall, and a void pit to push into. */
export const ARENAS: Record<string, GridMap> = {
  plain: asciiMap(['........', '........', '........', '........']),
  platform: asciiMap(['........', '..222...', '..222...', '........']),
  pit: (() => {
    const m = asciiMap(['........', '........', '........', '........']);
    for (const [x, y] of [[6, 1], [6, 2], [7, 1], [7, 2]] as [number, number][]) m.tiles[y * m.width + x] = { terrain: 'void', height: 0, walkable: false };
    return m;
  })(),
  walled: asciiMap(['........', '..####..', '........', '........']),
};

export const ARENA_IDS = Object.keys(ARENAS);

/** A full roster: one Willy of each class plus a handful of rats, split into two factions. */
export function buildRoster(seed: number, arenaId: string): Entity[] {
  const positions = freeSpots(ARENAS[arenaId]!, CLASS_IDS.length + 4);
  const party: Entity[] = CLASS_IDS.map((classId, i) =>
    createWilly({
      id: `w-${classId}`,
      controllerId: 'player:1',
      factionId: 'concursantes',
      position: positions[i]!,
      spriteId: `willy-${classId}`,
      classId,
      level: 2,
    }),
  );
  const enemies: Entity[] = Array.from({ length: 4 }, (_, i) =>
    createCreature({
      id: `rat-${i}`,
      name: 'Rata portuaria',
      controllerId: 'ai',
      factionId: 'monstruos',
      position: positions[CLASS_IDS.length + i]!,
      spriteId: 'rata-portuaria',
      vida: 12 + ((seed + i) % 6),
      def: 10 + ((seed + i) % 4),
      ataque: 2,
      dano: '1d4',
      movimiento: 5,
    }),
  );
  return [...party, ...enemies];
}

/** Picks `n` distinct walkable tiles, deterministic given the map. */
function freeSpots(map: GridMap, n: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < map.tiles.length && out.length < n; i++) {
    const t = map.tiles[i]!;
    if (t.walkable) out.push({ x: i % map.width, y: Math.floor(i / map.width) });
  }
  if (out.length < n) throw new Error(`Arena too small for ${n} entities (only ${out.length} walkable tiles)`);
  return out;
}

export function buildWorld(seed: number, arenaId: string) {
  return engine.newGame({ seed, map: ARENAS[arenaId]!, entities: buildRoster(seed, arenaId) });
}

export const PARTY_IDS = CLASS_IDS.map((c) => `w-${c}`);
export const ENEMY_IDS = ['rat-0', 'rat-1', 'rat-2', 'rat-3'];
