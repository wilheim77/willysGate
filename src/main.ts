import Phaser from 'phaser';
import { game } from '@game';
import { createEngine } from '../engine';
import { GameController } from './game/controller';
import { GameStore } from './game/store';
import { MapScene } from './scenes/MapScene';
import './style.css';
import { CombatHud } from './ui/combatHud';
import { Hud, randomSeed } from './ui/hud';
import { applyTheme } from './ui/theme';

// `@game` resolves to content/<GAME>/game.ts at build time (see vite.config.ts).
document.title = game.title;
applyTheme(game.theme);

const engine = createEngine(game.ruleset, game.id);
const store = new GameStore(engine, game.newGame(engine, randomSeed()));
const hud = new Hud(store, game);
const controller = new GameController(store, game, new CombatHud(game));

const requestedArt = new URLSearchParams(location.search).get('arte');
const manifest = game.art.presets[requestedArt ?? ''] ?? game.art.presets[game.art.default]!;

const combat = game.texts.combat ?? {};
const scene = new MapScene(
  store,
  manifest,
  game.theme,
  {
    controlledEntityId: () => controller.controlledId(),
    onTileHovered: (tile) => hud.showTile(tile),
    onTileSelected: (tile) => controller.onTileSelected(tile),
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
