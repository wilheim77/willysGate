import { type Entity, type GameState, type TiledMapJson, type Trap, parseTiledMap, withLighting, withTraps, withZones } from '../../engine';
import { DND5E_CREATION, SURFACES, buildProtagonist, createCharacter, createMonster, createProp, defaultCreation, dnd5e } from '../../rulesets/dnd5e';
import type { AssetManifest } from '../../src/assets/manifest';
import type { GameDefinition, UiTexts } from '../../src/game/definition';
import art0x72 from './assets/0x72.json';
import artLpc from './assets/lpc.json';
import audio from './assets/audio.json';
import type { AudioManifest } from '../../src/audio/types';
import testMap from './maps/test.json';
import meta from './meta.json';
import items from './items.json';
import triggers from './triggers.json';
import texts from './texts/ui.json';
import viejoMinero from './dialogues/viejo_minero.json';
import cofrePrueba from './dialogues/cofre_prueba.json';
import puertaAlmacen from './dialogues/puerta_almacen.json';
import palancaAlmacen from './dialogues/palanca_almacen.json';
import { type DialogueTree, type Engine, lightingOf } from '../../engine';
import { STORY_DIALOGUES } from './dialogues/index';
import { ACT_MAPS, CAST, START_MAP, buildMap, companion, useSprites } from './world';

useSprites(Object.keys((art0x72 as AssetManifest).sprites));

/** Every conversation: the story's plus the Phase 4 test ones. */
const DIALOGUES: Record<string, DialogueTree> = {
  ...Object.fromEntries([viejoMinero, cofrePrueba, puertaAlmacen, palancaAlmacen].map((d) => [d.id, d as unknown as DialogueTree])),
  ...STORY_DIALOGUES,
};

const PLAYER = 'player:1';
const AI = 'ai';

export const game: GameDefinition = {
  id: meta.id,
  title: meta.title,
  ruleset: dnd5e,
  art: { default: '0x72', presets: { '0x72': art0x72 as AssetManifest, lpc: artLpc as AssetManifest } },
  texts: texts as UiTexts,
  theme: {
    colors: {
      bg: '#121014',
      panel: '#1d1a1e',
      iron: '#4a4449',
      'iron-light': '#6b6369',
      text: '#cfc6b4',
      muted: '#8a8174',
      accent: '#a3412f',
      error: '#d0705c',
    },
    canvas: '#121014',
    fontFamily: "'VT323', ui-monospace, monospace",
    fontUrl: 'https://fonts.googleapis.com/css2?family=VT323&display=swap',
  },
  playerId: PLAYER,
  leaderId: 'hero',
  audio: audio as AudioManifest,
  items: Object.fromEntries(Object.entries(items).filter(([k]) => !k.startsWith('$'))) as Record<string, { label: string; text?: string }>,
  creation: {
    spec: DND5E_CREATION,
    defaults: defaultCreation,
    // The protagonist replaces the placeholder hero in place: same spot, look and level.
    apply(_engine, state, choices) {
      const hero = state.entities.hero!;
      const built = buildProtagonist(choices, { id: hero.id, controllerId: hero.controllerId, factionId: hero.factionId, position: hero.position, spriteId: hero.spriteId, level: 3 });
      return { ...state, entities: { ...state.entities, hero: built } };
    },
  },
  dialogues: DIALOGUES,
  cast: { ...Object.fromEntries(Object.entries(CAST).map(([id, c]) => [id, { name: c.name, spriteId: c.spriteId }])), dorotea: { name: 'Dorotea', spriteId: 'dorotea' } },
  titleImage: 'assets/title/title.png',
  maps: Object.fromEntries(Object.keys(ACT_MAPS).map((id) => [id, () => buildMap(id, DIALOGUES)])),
  // The act opens on the road: Dorotea talks first.
  opening: { dialogue: 'camino_dorotea', partner: 'dorotea' },
  triggers: triggers.triggers as NonNullable<GameDefinition['triggers']>,
  newGame(engine, seed, options) {
    if (options?.start === 'test') return testGame(engine, seed);
    const start = options?.start && ACT_MAPS[options.start] ? options.start : START_MAP;
    const setup = buildMap(start, DIALOGUES);
    const at = (name: string) => setup.spawns[name] ?? setup.spawns[Object.keys(setup.spawns).find((k) => k.startsWith('entry-')) ?? ''] ?? { x: 1, y: 1 };
    // A placeholder protagonist (character creation replaces it) and Dorotea, the bank's other employee.
    const party: Entity[] = [
      createCharacter({ id: 'hero', name: 'Cobrador', controllerId: PLAYER, factionId: 'party', position: at('hero'), spriteId: 'cobrador', classId: 'wizard', raceId: 'human', level: 3, abilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } }),
      companion('dorotea', 'Dorotea', at('dorotea'), PLAYER, 'party', DIALOGUES.dorotea ? ['dialogue:dorotea'] : []),
    ];
    // On the starting map, story-conditional spawns wait as dormant like anywhere else.
    const absent = (e: Entity) => e.tags.some((t) => t.startsWith('presence:'));
    let state = engine.newGame({ seed, map: setup.map, entities: [...party, ...setup.entities.filter((e) => !absent(e))] });
    state = { ...state, systems: { ...state.systems, dormant: Object.fromEntries(setup.entities.filter(absent).map((e) => [e.id, e])) as never } };
    state = { ...state, systems: { ...state.systems, ...(setup.systems ?? {}), spawns: setup.spawns as never } };
    const lighting = lightingOf(state);
    return withLighting(state, { ...lighting, lights: [...lighting.lights.filter((l) => !l.id.startsWith('surface:')), LANTERN] });
  },
};

/** The collector carries a lantern: the only light that goes everywhere with the party. */
const LANTERN = { id: 'lantern', attachedTo: 'hero', radius: 4, intensity: 0.85, color: '#ffcf8a', flicker: 0.08 };

/** The Phase 2–4 test arena (?mapa=test): the whole party, a balanced fight, a door, a chest, a trap. */
function testGame(engine: Engine, seed: number): GameState {
  {
    const { map, spawns, lighting, zones } = parseTiledMap('test', testMap as TiledMapJson);
    const at = (name: string) => spawns[name] ?? { x: 1, y: 1 };
    // Test party at level 3 (character creation arrives in Phase 4). Standard array per class.
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
    // Phase 4 test: someone to talk to on the way in.
    const npcs: Entity[] = [
      createMonster({ id: 'viejo', name: 'Viejo minero', monsterId: 'bandit', controllerId: AI, factionId: 'neutral', position: { x: 5, y: 4 }, spriteId: 'minero_cuadrilla', extraTags: ['dialogue:viejo_minero', 'noncombatant'] }),
    ];
    // Phase 4 test: a storeroom behind a barred door, a lever outside, a trapped chest inside.
    const usables: Entity[] = [
      // The door is drawn by its tile (door_closed / door_open); the entity only holds the script.
      createProp({ id: 'puerta-1', kind: 'door', position: { x: 9, y: 11 }, spriteId: 'none', name: 'Puerta del almacén', extraTags: ['dialogue:puerta_almacen'] }),
      createProp({ id: 'palanca-1', kind: 'lever', position: { x: 13, y: 11 }, spriteId: 'lever', extraTags: ['dialogue:palanca_almacen', 'pose:up'] }),
      createProp({ id: 'cofre-1', kind: 'chest', position: { x: 10, y: 13 }, spriteId: 'chest_trapped', extraTags: ['dialogue:cofre_prueba'] }),
    ];
    // Scenery from spawn names: "barrel_oil-1", "crate-2"...
    const props: Entity[] = Object.entries(spawns)
      .map(([name, position]) => ({ name, position, kind: name.split('-')[0] }))
      .filter((p): p is { name: string; position: { x: number; y: number }; kind: 'barrel_oil' | 'barrel' | 'crate' } => ['barrel_oil', 'barrel', 'crate'].includes(p.kind!))
      .map((p) => createProp({ id: p.name, kind: p.kind, position: p.position }));
    // Surfaces painted as rectangles in the map's "surfaces" layer, laid like any other
    // (so painted fire burns out and gives light, and nothing lands on walls).
    const painted = zones
      .filter((z) => z.layer === 'surfaces' && SURFACES[String(z.properties.surface)])
      .map((z) => ({
        type: 'spawnSurface' as const,
        surface: String(z.properties.surface),
        tiles: Array.from({ length: z.width * z.height }, (_, i) => ({ x: z.x + (i % z.width), y: z.y + Math.floor(i / z.width) })),
      }));
    // Traps from the "traps" layer: hidden until noticed; disarmed with a check.
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
    // The storeroom doorway: one tile walled up, the other barred by the door.
    const wall = map.tiles[11 * map.width + 8]!;
    const closed = {
      ...map,
      tiles: map.tiles.map((t, i) => (i === 11 * map.width + 10 ? { ...wall } : i === 11 * map.width + 9 ? { ...wall, terrain: 'door_closed' } : t)),
    };
    map.tiles = closed.tiles;
    // Named arrival points, so travelling back to this map knows where to put the party.
    const withSpawns = (st: GameState): GameState => ({ ...st, systems: { ...st.systems, spawns: spawns as never } });
    const state = withSpawns(withTraps(engine.applyEffects(engine.newGame({ seed, map, entities: [...party, ...enemies, ...npcs, ...usables, ...props] }), painted).state, traps));
    return withZones(withLighting(state, { ...lighting, lights: [...lighting.lights, LANTERN] }), zones);
  }
}
