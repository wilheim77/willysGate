import Phaser from 'phaser';
import { game } from '@game';
import { createEngine } from '../engine';
import { GameController } from './game/controller';
import { GameStore } from './game/store';
import { MapScene } from './scenes/MapScene';
import './style.css';
import { CharacterSheet, PartyBar } from './ui/characterSheet';
import { CombatHud } from './ui/combatHud';
import { DialogueBox } from './ui/dialogueBox';
import { CreationScreen } from './ui/creationScreen';
import { Hud, randomSeed } from './ui/hud';
import { applyTheme } from './ui/theme';

// `@game` resolves to content/<GAME>/game.ts at build time (see vite.config.ts).
document.title = game.title;
applyTheme(game.theme);

const engine = createEngine(game.ruleset, game.id, { dialogues: game.dialogues ?? {} });
const store = new GameStore(engine, game.newGame(engine, randomSeed()));
const hud = new Hud(store, game);
const combatHud = new CombatHud(game);
const controller = new GameController(store, game, combatHud);

const requestedArt = new URLSearchParams(location.search).get('arte');
const manifest = game.art.presets[requestedArt ?? ''] ?? game.art.presets[game.art.default]!;

// Party portraits and character sheets (tap a portrait or an initiative chip).
const sheet = new CharacterSheet(game, engine.ruleset, manifest);
const party = new PartyBar(game, engine.ruleset, manifest, (id) => sheet.open(store.state, id));
combatHud.onInspect = (id) => sheet.open(store.state, id);
combatHud.setManifest(manifest);
const renderParty = () => {
  const { turn } = store.state;
  party.render(store.state, turn.mode === 'combat' ? turn.activeEntityId : null);
  sheet.refresh(store.state);
};
store.subscribe(renderParty);
renderParty();

// Conversations (and chests, levers, doors: they are dialogues too).
const dialogue = new DialogueBox(store, game, manifest);
store.subscribe((change, state) => {
  if (change.kind === 'events') dialogue.onEvents(change.events, state);
  dialogue.render(state);
});
dialogue.render(store.state);

// A new game starts with character creation.
const creation = new CreationScreen(store, game);
hud.onNewGame = () => creation.open();
creation.open();

const combat = game.texts.combat ?? {};
const scene = new MapScene(
  store,
  manifest,
  game.theme,
  {
    controlledEntityId: () => controller.controlledId(),
    onTileHovered: (tile) => hud.showTile(tile),
    onTileSelected: (tile, entityId) => controller.onTileSelected(tile, entityId),
    onIdle: () => controller.onIdle(),
  },
  {
    miss: combat.miss ?? 'Fallo',
    crit: combat.crit ?? '¡Crítico!',
    downed: combat.downed ?? 'Caído',
    saved: combat.saved ?? 'Resiste',
    failed: combat.failed ?? 'Falla',
    combatStart: combat.combatStart ?? 'Combate',
    victory: combat.victory ?? 'Victoria',
    defeat: combat.defeat ?? 'Derrota',
    fell: combat.fell ?? '¡Caída!',
    slipped: combat.slipped ?? '¡Resbala!',
  },
);
controller.scene = scene;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: game.theme.canvas,
  pixelArt: true,
  // RESIZE follows the parent element; the initial size must be non-zero or WebGL framebuffers fail.
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth || 800, height: window.innerHeight || 600 },
  input: { touch: { capture: true } },
  scene: [scene],
});

// Development-only handle for testing from the browser console (stripped from production builds).
if (import.meta.env.DEV) Object.assign(window, { __game: { store, controller, engine } });
