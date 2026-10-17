import Phaser from 'phaser';
import { game } from '@game';
import { type CheckResult, createEngine } from '../engine';
import { GameController } from './game/controller';
import { GameStore } from './game/store';
import { MapScene } from './scenes/MapScene';
import './style.css';
import { mountAudioControls } from './audio/AudioControls';
import { setupAudio } from './audio/setupAudio';
import { attachUiSfx } from './audio/uiSfx';
import { CharacterSheet, PartyBar } from './ui/characterSheet';
import { CombatHud } from './ui/combatHud';
import { DialogueBox } from './ui/dialogueBox';
import { CreationScreen } from './ui/creationScreen';
import { TitleScreen } from './ui/titleScreen';
import { Hud, randomSeed } from './ui/hud';
import { applyTheme } from './ui/theme';
import { setupTutorial } from './ui/tutorialToasts';

// `@game` resolves to content/<GAME>/game.ts at build time (see vite.config.ts).
document.title = game.title;
applyTheme(game.theme);

const engine = createEngine(game.ruleset, game.id, { dialogues: game.dialogues ?? {}, maps: game.maps ?? {} });
const startMap = new URLSearchParams(location.search).get('mapa') ?? undefined;
const store = new GameStore(engine, game.newGame(engine, randomSeed(), startMap ? { start: startMap } : undefined));
const hud = new Hud(store, game);
hud.startOptions = startMap ? { start: startMap } : undefined;
const audio = setupAudio(store, game);
mountAudioControls(document.querySelector('.hud-top nav')!, audio);
attachUiSfx(audio);
setupTutorial(store, game);
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
// Known traps: pick who tries to disarm, see the roll.
controller.onTrapReached = (trap, candidates) => {
  const ruleset = store.engine.ruleset;
  const t = game.texts.combat ?? {};
  if (!trap.disarm) return;
  const disarm = trap.disarm;
  dialogue.ask(
    t.trapQuestion ?? 'Una trampa. ¿Quién intenta desactivarla?',
    candidates.filter((id) => !trap.triedBy?.includes(id)).map((id) => {
      const odds = ruleset.describeCheck?.(store.state, { actorId: id, check: disarm.check, target: disarm.dc });
      const name = store.state.entities[id]!.name;
      return {
        label: `${name} · [${odds?.label ?? disarm.check}] ${t.dcShort ?? 'CD'} ${disarm.dc}${odds ? ` · ${Math.round(odds.chance * 100)} %` : ''}`,
        onPick: () => {
          const r = store.dispatch({ type: 'disarmTrap', issuer: game.playerId, entityId: id, trapId: trap.id } as never);
          if (!r.ok) return;
          const ev = r.events.find((e) => e.type === 'trapDisarmed' || e.type === 'trapDisarmFailed') as unknown as { type: string; result: CheckResult } | undefined;
          if (ev) dialogue.showRoll(name, ev.result, ev.type === 'trapDisarmed' ? (t.trapDisarmedText ?? 'Clic. Ya no muerde.') : r.events.some((e) => e.type === 'trapTriggered') ? (t.trapBackfired ?? 'Clic. Lo malo es que era el otro clic.') : (t.trapStillArmed ?? 'No hay manera. Sigue armada.'));
        },
      };
    }),
  );
};

// Levelling up: the narration and what each companion makes of it.
controller.onLevelUp = (level) => {
  const lines = game.levels?.texts?.[String(level)];
  if (!lines) return;
  const party = Object.values(store.state.entities).filter((e) => e.controllerId === game.playerId);
  const said = party.filter((e) => lines[e.id]).map((e) => `${e.name}: «${lines[e.id]}»`);
  dialogue.ask(`${game.texts.combat?.levelUp ?? 'Subís a nivel'} ${level}. ${lines.narration ?? ''}\n\n${said.join('\n')}`, [], game.texts.combat?.ok ?? 'Vale');
};

// The Narrador (Willy): a line on screen for the moments that deserve one.
if (game.narrate) {
  const box = document.createElement('div');
  box.id = 'narrator';
  box.hidden = true;
  document.body.append(box);
  let timer = 0;
  store.subscribe((change, state) => {
    if (change.kind !== 'events') return;
    for (const e of change.events) {
      const line = game.narrate!(e, state);
      if (!line) continue;
      box.textContent = line;
      box.hidden = false;
      clearTimeout(timer);
      timer = window.setTimeout(() => (box.hidden = true), 3500 + line.length * 40);
      break;
    }
  });
  box.addEventListener('click', () => (box.hidden = true));
}

const creation = new CreationScreen(store, game);
hud.onNewGame = () => creation.open();
// The title screen first; a new game goes on to character creation.
new TitleScreen(store, game, () => creation.open()).open();

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
    trapSpotted: combat.trapSpotted ?? '¡Una trampa!',
    trapTriggered: combat.trapTriggered ?? '¡Trampa!',
    trapDisarmed: combat.trapDisarmed ?? 'Desactivada',
    trapDisarmFailed: combat.trapDisarmFailed ?? 'No hay manera',
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
