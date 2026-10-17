import { type Entity, type TiledMapJson, parseTiledMap, posKey, withLighting, withSurfaces, withZones } from '../../engine';
import { SURFACES, createCharacter, createMonster, createProp, dnd5e } from '../../rulesets/dnd5e';
import type { AssetManifest } from '../../src/assets/manifest';
import type { GameDefinition, UiTexts } from '../../src/game/definition';
import art0x72 from './assets/0x72.json';
import artLpc from './assets/lpc.json';
import testMap from './maps/test.json';
import meta from './meta.json';
import texts from './texts/ui.json';

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
  newGame(engine, seed) {
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
      createMonster({ id: 'skeleton', name: 'Minero muerto', monsterId: 'skeleton', controllerId: AI, factionId: 'sinpaga', position: at('skeleton'), spriteId: 'esqueleto_minero' }),
    ];
    // Scenery from spawn names: "barrel_oil-1", "crate-2"...
    const props: Entity[] = Object.entries(spawns)
      .map(([name, position]) => ({ name, position, kind: name.split('-')[0] }))
      .filter((p): p is { name: string; position: { x: number; y: number }; kind: 'barrel_oil' | 'barrel' | 'crate' } => ['barrel_oil', 'barrel', 'crate'].includes(p.kind!))
      .map((p) => createProp({ id: p.name, kind: p.kind, position: p.position }));
    // Surfaces painted as rectangles in the map's "surfaces" layer.
    const surfaces = Object.fromEntries(
      zones
        .filter((z) => z.layer === 'surfaces' && SURFACES[String(z.properties.surface)])
        .flatMap((z) =>
          Array.from({ length: z.width * z.height }, (_, i) => [posKey({ x: z.x + (i % z.width), y: z.y + Math.floor(i / z.width) }), { type: String(z.properties.surface) }]),
        ),
    );
    const state = withSurfaces(engine.newGame({ seed, map, entities: [...party, ...enemies, ...props] }), surfaces);
    // The collector carries a lantern: the only light that goes everywhere with the party.
    return withZones(
      withLighting(state, {
        ...lighting,
        lights: [...lighting.lights, { id: 'lantern', attachedTo: 'hero', radius: 4, intensity: 0.85, color: '#ffcf8a', flicker: 0.08 }],
      }),
      zones,
    );
  },
};
