import { WILLY_CREATION, defaultCreation, willy } from '../../rulesets/willy';
import type { AssetManifest } from '../../src/assets/manifest';
import type { AudioManifest } from '../../src/audio/types';
import type { GameDefinition, UiTexts } from '../../src/game/definition';
import audio from './assets/audio.json';
import ninja from './assets/ninja.json';
import itemsData from './data/items.json';
import meta from './meta.json';
import { PLAYER, applyCasting, maps, newWillyGame } from './setup';
import { narrate, narrateEvents } from './narrator';
import { achievements, rewardBoxes } from './meta-view';
import { defeat, newGameSetup, onRestoredCopy, savePolicy } from './run-modes';
import texts from './texts/ui.json';

/**
 * «Willy el mazmorrero», first playable: the casting (class + free points), then the Camerino
 * (safe zone), then floor 1, generated for the run, through the service lift (?mapa=prueba-castro
 * opens the hand-made test map). The show (audience, sponsors, boxes) and the narrator come in
 * the next phases (docs/willy/DESIGN.md).
 */
export { maps };

export const game: GameDefinition = {
  id: meta.id,
  title: meta.title,
  ruleset: willy,
  art: { default: 'ninja', presets: { ninja: ninja as unknown as AssetManifest } },
  texts: texts as UiTexts,
  theme: {
    colors: {
      bg: '#1b1530',
      panel: '#2a2147',
      iron: '#4a3f6b',
      'iron-light': '#6d5f9a',
      text: '#fff4e0',
      muted: '#a99cc7',
      accent: '#ff7a1a',
      error: '#ff5577',
    },
    canvas: '#1b1530',
    // VT323 for text; Press Start 2P for titles and show signs (DESIGN.md §13).
    fontFamily: "'VT323', ui-monospace, monospace",
    fontUrl: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap',
  },
  playerId: PLAYER,
  leaderId: 'willy',
  audio: audio as unknown as AudioManifest,
  items: Object.fromEntries(itemsData.items.map((i) => [i.id, { label: i.nombre, text: i.regla }])),
  creation: {
    spec: WILLY_CREATION,
    defaults: defaultCreation,
    apply: (_engine, state, choices) => applyCasting(state, choices),
  },
  titleImage: 'assets/title/title.png',
  narrate,
  narrateEvents,
  achievements,
  rewardBoxes,
  newGameSetup,
  savePolicy,
  onRestoredCopy,
  defeat,
  // The service lift needs the engine to know the floors (travel builds them on arrival).
  maps,
  newGame: newWillyGame,
};
