import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type DialogueTree,
  type Entity,
  type GridMap,
  type TiledMapJson,
  type Trap,
  createEngine,
  parseTiledMap,
  withLighting,
  withTraps,
  withZones,
} from '../../engine';
import { createCharacter, createMonster, createProp, dnd5e, SURFACES } from '../../rulesets/dnd5e';
import testMap from '../../content/intereses/maps/test.json';

/**
 * Rebuilds the Intereses world purely from content JSON + the engine/ruleset, without
 * touching content/intereses/game.ts (which carries type-only imports from src/ that the
 * QA harness is told to avoid pulling in). Mirrors game.ts's newGame() for the one shipped
 * map; extend `MAPS` below as new maps land on origin/mapas.
 */

const CONTENT_DIR = join(import.meta.dirname, '..', '..', 'content', 'intereses');
const PLAYER = 'player:1';
const AI = 'ai';

/** All dialogue trees under content/intereses/dialogues, read live so new files need no code change. */
export function loadDialogues(): Record<string, DialogueTree> {
  const dir = join(CONTENT_DIR, 'dialogues');
  const out: Record<string, DialogueTree> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const tree = JSON.parse(readFileSync(join(dir, file), 'utf8')) as DialogueTree;
    out[tree.id] = tree;
  }
  return out;
}

export function loadItems(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT_DIR, 'items.json'), 'utf8'));
}

/** Known maps with encounters, by id. Extend when origin/mapas ships new ones. */
export const MAPS: Record<string, TiledMapJson> = { test: testMap as TiledMapJson };

export function makeEngine() {
  return createEngine(dnd5e, 'qa', { dialogues: loadDialogues() });
}

/** Builds the same world content/intereses/game.ts does for `mapId`, for a given seed. */
export function buildWorld(engine: ReturnType<typeof makeEngine>, seed: number, mapId = 'test') {
  const raw = MAPS[mapId];
  if (!raw) throw new Error(`Unknown QA map "${mapId}"`);
  const { map, spawns, lighting, zones } = parseTiledMap(mapId, raw);
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
    createMonster({ id: 'thug-2', name: 'Matón de los Sinpaga', monsterId: 'thug', controllerId: AI, factionId: 'sinpaga', position: at('thug-2'), spriteId: 'sinpaga_bruto' }),
    createMonster({ id: 'bandit-3', name: 'Sinpaga', monsterId: 'bandit', controllerId: AI, factionId: 'sinpaga', position: at('bandit-3'), spriteId: 'sinpaga_cuchillero' }),
    createMonster({ id: 'skeleton', name: 'Minero muerto', monsterId: 'skeleton', controllerId: AI, factionId: 'sinpaga', position: at('skeleton'), spriteId: 'esqueleto_minero' }),
  ];
  const npcs: Entity[] = [
    createMonster({ id: 'viejo', name: 'Viejo minero', monsterId: 'bandit', controllerId: AI, factionId: 'neutral', position: { x: 5, y: 4 }, spriteId: 'minero_cuadrilla', extraTags: ['dialogue:viejo_minero', 'noncombatant'] }),
  ];
  // Everyone the story's dialogues talk to (content/intereses/cast.json), so every tree can be walked here.
  const cast = JSON.parse(readFileSync(join(CONTENT_DIR, 'cast.json'), 'utf8')) as Record<string, { name: string; monsterId: string; spriteId: string; faction: string; noncombatant?: boolean; dialogue?: string | null }>;
  const known = new Set([...party, ...enemies, ...npcs].map((e) => e.id));
  let slot = 0;
  for (const [id, c] of Object.entries(cast)) {
    if (id.startsWith('$') || known.has(id)) continue;
    const position = { x: 1 + (slot % 6), y: 15 + Math.floor(slot / 6) };
    slot++;
    npcs.push(
      createMonster({
        id,
        name: c.name,
        monsterId: c.monsterId === 'companion' || c.monsterId === 'commoner' ? 'bandit' : c.monsterId,
        controllerId: AI,
        factionId: c.faction,
        position,
        spriteId: c.spriteId,
        extraTags: [...(c.dialogue ? [`dialogue:${c.dialogue}`] : []), ...(c.noncombatant ? ['noncombatant'] : [])],
      }),
    );
  }
  const usables: Entity[] = [
    createProp({ id: 'puerta-1', kind: 'door', position: { x: 9, y: 11 }, spriteId: 'none', name: 'Puerta del almacén', extraTags: ['dialogue:puerta_almacen'] }),
    createProp({ id: 'palanca-1', kind: 'lever', position: { x: 13, y: 11 }, spriteId: 'lever', extraTags: ['dialogue:palanca_almacen', 'pose:up'] }),
    createProp({ id: 'cofre-1', kind: 'chest', position: { x: 10, y: 13 }, spriteId: 'chest_trapped', extraTags: ['dialogue:cofre_prueba'] }),
    // A generic template creature the story fights by faction (scene 1, the trial).
    createMonster({ id: 'fanatico_pala-1', name: 'Fanático de la Pala', monsterId: 'bandit', controllerId: AI, factionId: 'fanaticos', position: { x: 12, y: 13 }, spriteId: 'fanatico_pala' }),
    // Story interactables the dialogues change (map spawns <kind>-<x>, dialogue <kind>_<x>).
    createProp({ id: 'chest-libro_cuentas', kind: 'chest', position: { x: 11, y: 13 }, spriteId: 'chest_trapped', extraTags: ['dialogue:chest_libro_cuentas'] }),
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
  const traps: Trap[] = zones
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
  const closed: GridMap = {
    ...map,
    tiles: map.tiles.map((t, i) => (i === 11 * map.width + 10 ? { ...wall } : i === 11 * map.width + 9 ? { ...wall, terrain: 'door_closed' } : t)),
  };
  map.tiles = closed.tiles;

  const state = withTraps(engine.applyEffects(engine.newGame({ seed, map, entities: [...party, ...enemies, ...npcs, ...usables, ...props] }), painted).state, traps);
  return withZones(
    withLighting(state, { ...lighting, lights: [...lighting.lights, { id: 'lantern', attachedTo: 'hero', radius: 4, intensity: 0.85, color: '#ffcf8a', flicker: 0.08 }] }),
    zones,
  );
}

export const PARTY_IDS = ['hero', 'garran', 'dorotea', 'anselmo'];
export const ENEMY_IDS = ['bandit-1', 'bandit-2', 'thug', 'skeleton'];
