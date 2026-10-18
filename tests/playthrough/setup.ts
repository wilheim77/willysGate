import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type DialogueTree,
  type Engine,
  type Entity,
  type GameState,
  type GridMap,
  type TiledMapJson,
  type Vec2,
  createEngine,
  lightingOf,
  parseTiledMap,
  posKey,
  tileAt,
  withLighting,
  withTraps,
  withZones,
} from '../../engine';
import { createCharacter, createMonster, createProp, dnd5e, SURFACES } from '../../rulesets/dnd5e';
import { ACT_MAPS, START_MAP, buildMap, companion, useSprites } from '../../content/intereses/world';
import { STORY_DIALOGUES } from '../../content/intereses/dialogues/index';
import viejoMinero from '../../content/intereses/dialogues/viejo_minero.json';
import cofrePrueba from '../../content/intereses/dialogues/cofre_prueba.json';
import puertaAlmacen from '../../content/intereses/dialogues/puerta_almacen.json';
import palancaAlmacen from '../../content/intereses/dialogues/palanca_almacen.json';
import testMap from '../../content/intereses/maps/test.json';
import manifest from '../../content/intereses/assets/0x72.json';

/**
 * Rebuilds the Intereses world from the SAME content/intereses/world.ts (buildMap) that
 * content/intereses/game.ts now uses, instead of hand-copied spawns — both to stay in
 * sync with the real act content as it grows, and because hand-copied `at(name) ?? {x:1,y:1}`
 * fallbacks for spawns missing from an older map snapshot is exactly how entities ended up
 * stacking on top of each other (the reviewer's C4 finding on V10). `content/intereses/world.ts`
 * is itself DOM-free, so it is safe to import directly; `content/intereses/game.ts` still isn't
 * (type-only src/ imports), so we still don't import that one.
 */

useSprites(Object.keys((manifest as { sprites: Record<string, unknown> }).sprites));

const PLAYER = 'player:1';
const AI = 'ai';
const CONTENT_DIR = join(import.meta.dirname, '..', '..', 'content', 'intereses');

/** The act's story dialogues plus the Phase 2-4 generic test ones (still shipped by game.ts
 *  for the `?mapa=test` dev arena), merged exactly like game.ts does. */
export function loadDialogues(): Record<string, DialogueTree> {
  return {
    ...Object.fromEntries([viejoMinero, cofrePrueba, puertaAlmacen, palancaAlmacen].map((d) => [d.id, d as unknown as DialogueTree])),
    ...STORY_DIALOGUES,
  };
}

export const ACT_MAP_IDS = Object.keys(ACT_MAPS);
export const START = START_MAP;
/** Dialogues that only make sense on the old generic test arena (they setEntity on its props). */
export const LEGACY_TEST_DIALOGUE_IDS = new Set(['viejo_minero', 'cofre_prueba', 'puerta_almacen', 'palanca_almacen']);

export function makeEngine(): Engine {
  const dialogues = loadDialogues();
  return createEngine(dnd5e, 'qa', { dialogues, maps: Object.fromEntries(ACT_MAP_IDS.map((id) => [id, () => buildMap(id, dialogues)])) });
}

const LANTERN = { id: 'lantern', attachedTo: 'hero', radius: 4, intensity: 0.85, color: '#ffcf8a', flicker: 0.08 };

/** The nearest free, walkable, not-yet-`taken` tile to `from` (breadth-first). Mirrors the
 *  spreading content/intereses/game.ts gets for free from `travel`'s `freeTileNear` when
 *  the party arrives through a real exit — needed here too because only "camino" (the act's
 *  opening map) has dedicated "hero"/"dorotea" spawns; on every other map we fall back to
 *  the same entry point for both, which would otherwise stack them on one tile. */
function freeTileNear(map: GridMap, from: Vec2, taken: Set<string>): Vec2 {
  const seen = new Set([posKey(from)]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    if (tileAt(map, p)?.walkable && !taken.has(posKey(p))) return p;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= map.width || n.y >= map.height || seen.has(posKey(n))) continue;
      seen.add(posKey(n));
      queue.push(n);
    }
  }
  return from;
}

/** One act map, built exactly like content/intereses/game.ts's real newGame(). */
export interface ProtagonistSpec {
  classId: string;
  raceId: string;
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
}

/** The default protagonist (the shipped intro's human wizard). Pass a different
 *  ProtagonistSpec to buildActWorld to drive the same act with another build, e.g. an elf
 *  rogue - useful for exercising `rule: race`/`rule: class` dialogue branches. */
export const DEFAULT_PROTAGONIST: ProtagonistSpec = { classId: 'wizard', raceId: 'human', abilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } };
export const ELF_ROGUE_PROTAGONIST: ProtagonistSpec = { classId: 'rogue', raceId: 'elf', abilities: { str: 8, dex: 15, con: 12, int: 13, wis: 10, cha: 14 } };

export function buildActWorld(engine: Engine, seed: number, mapId: string = START_MAP, protagonist: ProtagonistSpec = DEFAULT_PROTAGONIST): GameState {
  const dialogues = engine.content.dialogues;
  const setup = buildMap(mapId, dialogues);
  const at = (name: string) => setup.spawns[name] ?? setup.spawns[Object.keys(setup.spawns).find((k) => k.startsWith('entry-')) ?? ''] ?? { x: 1, y: 1 };
  const taken = new Set(setup.entities.map((e) => posKey(e.position)));
  const heroPos = at('hero');
  taken.add(posKey(heroPos));
  const doroteaPos = setup.spawns.dorotea ?? freeTileNear(setup.map, at('dorotea'), taken);
  const party: Entity[] = [
    createCharacter({ id: 'hero', name: 'Cobrador', controllerId: PLAYER, factionId: 'party', position: heroPos, spriteId: 'cobrador', level: 3, ...protagonist }),
    companion('dorotea', 'Dorotea', doroteaPos, PLAYER, 'party', dialogues.dorotea ? ['dialogue:dorotea'] : []),
  ];
  let state = engine.newGame({ seed, map: setup.map, entities: [...party, ...setup.entities] });
  state = { ...state, systems: { ...state.systems, ...(setup.systems ?? {}), spawns: setup.spawns as never } };
  const lighting = lightingOf(state);
  return withLighting(state, { ...lighting, lights: [...lighting.lights.filter((l) => !l.id.startsWith('surface:')), LANTERN] });
}

/** The old Phase 2-4 generic test arena, for the 4 legacy dialogues that still target its
 *  hardcoded props (puerta-1, palanca-1, cofre-1, viejo) — none of which exist on any real
 *  act map any more. */
export function buildTestWorld(engine: Engine, seed: number): GameState {
  const { map, spawns, lighting, zones } = parseTiledMap('test', testMap as TiledMapJson);
  const at = (name: string) => spawns[name] ?? { x: 1, y: 1 };
  const party: Entity[] = [
    createCharacter({ id: 'hero', name: 'Cobrador', controllerId: PLAYER, factionId: 'party', position: at('hero'), spriteId: 'cobrador', classId: 'wizard', raceId: 'human', level: 3, abilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } }),
    createCharacter({ id: 'garran', name: 'Garrán', controllerId: PLAYER, factionId: 'party', position: at('garran'), spriteId: 'garran', classId: 'fighter', raceId: 'half_orc', level: 3, abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 } }),
    createCharacter({ id: 'dorotea', name: 'Dorotea', controllerId: PLAYER, factionId: 'party', position: at('dorotea'), spriteId: 'dorotea', classId: 'rogue', raceId: 'human', level: 3, abilities: { str: 8, dex: 15, con: 10, int: 14, wis: 12, cha: 13 } }),
    createCharacter({ id: 'anselmo', name: 'Fray Anselmo', controllerId: PLAYER, factionId: 'party', position: at('anselmo'), spriteId: 'anselmo', classId: 'cleric', raceId: 'halfling', level: 3, abilities: { str: 10, dex: 13, con: 14, int: 8, wis: 15, cha: 12 } }),
  ];
  const enemies: Entity[] = [
    createMonster({ id: 'bandit-1', name: 'Sinpaga', monsterId: 'bandit', controllerId: AI, factionId: 'sinpaga', position: at('bandit-1'), spriteId: 'sinpaga_cuchillero' }),
    createMonster({ id: 'bandit-2', name: 'Sinpaga', monsterId: 'bandit', controllerId: AI, factionId: 'sinpaga', position: at('bandit-2'), spriteId: 'sinpaga_enmascarado' }),
    createMonster({ id: 'thug', name: 'Matón de los Sinpaga', monsterId: 'thug', controllerId: AI, factionId: 'sinpaga', position: at('thug'), spriteId: 'sinpaga_bruto' }),
    createMonster({ id: 'skeleton', name: 'Minero muerto', monsterId: 'skeleton', controllerId: AI, factionId: 'sinpaga', position: at('skeleton'), spriteId: 'esqueleto_minero' }),
  ];
  const npcs: Entity[] = [
    createMonster({ id: 'viejo', name: 'Viejo minero', monsterId: 'bandit', controllerId: AI, factionId: 'neutral', position: { x: 5, y: 4 }, spriteId: 'minero_cuadrilla', extraTags: ['dialogue:viejo_minero', 'noncombatant'] }),
  ];
  const usables: Entity[] = [
    createProp({ id: 'puerta-1', kind: 'door', position: { x: 9, y: 11 }, spriteId: 'none', name: 'Puerta del almacén', extraTags: ['dialogue:puerta_almacen'] }),
    createProp({ id: 'palanca-1', kind: 'lever', position: { x: 13, y: 11 }, spriteId: 'lever', extraTags: ['dialogue:palanca_almacen', 'pose:up'] }),
    createProp({ id: 'cofre-1', kind: 'chest', position: { x: 10, y: 13 }, spriteId: 'chest_trapped', extraTags: ['dialogue:cofre_prueba'] }),
  ];
  const props: Entity[] = Object.entries(spawns)
    .map(([name, position]) => ({ name, position, kind: name.split('-')[0] }))
    .filter((p): p is { name: string; position: { x: number; y: number }; kind: 'barrel_oil' | 'barrel' | 'crate' } => ['barrel_oil', 'barrel', 'crate'].includes(p.kind!))
    .map((p) => createProp({ id: p.name, kind: p.kind, position: p.position }));
  const painted = zones
    .filter((z) => z.layer === 'surfaces' && SURFACES[String(z.properties.surface)])
    .map((z) => ({
      type: 'spawnSurface' as const,
      surface: String(z.properties.surface),
      tiles: Array.from({ length: z.width * z.height }, (_, i) => ({ x: z.x + (i % z.width), y: z.y + Math.floor(i / z.width) })),
    }));
  const traps = zones
    .filter((z) => z.layer === 'traps')
    .map((z) => {
      const { disarmCheck, disarmDc, ...params } = z.properties;
      return {
        id: z.name,
        tiles: Array.from({ length: z.width * z.height }, (_, i) => ({ x: z.x + (i % z.width), y: z.y + Math.floor(i / z.width) })),
        hidden: true,
        armed: true,
        params,
        ...(disarmCheck ? { disarm: { check: String(disarmCheck), dc: Number(disarmDc ?? 12), triggerOnFailBy: 5 } } : {}),
      };
    });
  const wall = map.tiles[11 * map.width + 8]!;
  map.tiles = map.tiles.map((t, i) => (i === 11 * map.width + 10 ? { ...wall } : i === 11 * map.width + 9 ? { ...wall, terrain: 'door_closed' } : t));
  const state = withTraps(engine.applyEffects(engine.newGame({ seed, map, entities: [...party, ...enemies, ...npcs, ...usables, ...props] }), painted).state, traps);
  return withZones(withLighting(state, { ...lighting, lights: [...lighting.lights, LANTERN] }), zones);
}

/** `mapId` picks the real act map (default: the act's opening map) unless it is "test". */
export function buildWorld(engine: Engine, seed: number, mapId: string = START_MAP): GameState {
  return mapId === 'test' ? buildTestWorld(engine, seed) : buildActWorld(engine, seed, mapId);
}

export const PARTY_IDS = ['hero', 'dorotea'];
/** Hostile-from-the-start factions actually present (excluding noncombatants/objects), per map. */
export function hostileGroups(state: GameState): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const e of Object.values(state.entities)) {
    if (e.factionId === 'party' || e.tags.includes('noncombatant') || e.tags.includes('object')) continue;
    (groups[e.factionId] ??= []).push(e.id);
  }
  return groups;
}
