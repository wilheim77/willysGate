import Phaser from 'phaser';
import { game } from '@game';
import { type MoveCommand, createEngine } from '../engine';
import { GameStore } from './game/store';
import { MapScene } from './scenes/MapScene';
import './style.css';
import { Hud, randomSeed } from './ui/hud';
import { applyTheme } from './ui/theme';

// `@game` resolves to content/<GAME>/game.ts at build time (see vite.config.ts).
document.title = game.title;
applyTheme(game.theme);

const engine = createEngine(game.ruleset, game.id);
const store = new GameStore(engine, game.newGame(engine, randomSeed()));
const hud = new Hud(store, game);
const controlled = game.leaderId;

const requestedArt = new URLSearchParams(location.search).get('arte');
const manifest = game.art.presets[requestedArt ?? ''] ?? game.art.presets[game.art.default]!;

const scene = new MapScene(store, manifest, game.theme, {
  controlledEntityId: () => controlled,
  onTileHovered: (tile) => hud.showTile(tile),
  onTileSelected: (tile) => {
    const command: MoveCommand = { type: 'move', issuer: game.playerId, entityId: controlled, to: tile };
    const result = store.dispatch(command);
    if (!result.ok) hud.sayError(result.error.code);
  },
});

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
