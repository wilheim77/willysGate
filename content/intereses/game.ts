import { type TiledMapJson, parseTiledMap } from '../../engine';
import { createCreature, dnd5e } from '../../rulesets/dnd5e';
import type { AssetManifest } from '../../src/assets/manifest';
import type { GameDefinition, UiTexts } from '../../src/game/definition';
import manifest from './assets/manifest.json';
import testMap from './maps/test.json';
import meta from './meta.json';
import texts from './texts/ui.json';

const PLAYER = 'player:1';

export const game: GameDefinition = {
  id: meta.id,
  title: meta.title,
  ruleset: dnd5e,
  manifest: manifest as AssetManifest,
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
    const { map, spawns } = parseTiledMap('test', testMap as TiledMapJson);
    return engine.newGame({
      seed,
      map,
      entities: [
        // Placeholder protagonist until character creation (Phase 4).
        createCreature({
          id: 'hero',
          name: 'Cobrador',
          controllerId: PLAYER,
          factionId: 'party',
          position: spawns.hero ?? { x: 1, y: 1 },
          spriteId: 'hero',
          abilities: { str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 15 },
          ac: 14,
          hp: 11,
          tags: ['class:fighter', 'race:human', 'prof:intimidation', 'prof:athletics'],
        }),
      ],
    });
  },
};
