import Phaser from 'phaser';
import { game } from '@game';
import { type CheckResult, createEngine, dialogueOf as dialogueOfState, evaluateCondition, inventoriesOf } from '../engine';
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
import { CinematicPlayer } from './ui/cinematicPlayer';
import { TitleScreen } from './ui/titleScreen';
import { Hud, randomSeed } from './ui/hud';
import { applyTheme } from './ui/theme';
import { setupClockHud } from './ui/clockHud';
import { setupTutorial } from './ui/tutorialToasts';
import { setupBarks } from './ui/barks';
import { setupAchievements } from './ui/achievements';
import { setupRewardBoxes } from './ui/rewardBoxes';
import './ui/meta.css';
import { SetupScreen } from './ui/setupScreen';
import { PermadeathSlot } from './game/permadeath';
import { CreditsScreen } from './ui/creditsScreen';
import { setupShowHud } from './ui/showHud';
import { setupNarratorBox } from './ui/narratorBox';

// `@game` resolves to content/<GAME>/game.ts at build time (see vite.config.ts).
document.title = game.title;
applyTheme(game.theme);

const engine = createEngine(game.ruleset, game.id, { dialogues: game.dialogues ?? {}, maps: game.maps ?? {}, ...(game.levels ? { progression: game.levels.progression } : {}) });
const startMap = new URLSearchParams(location.search).get('mapa') ?? undefined;
const store = new GameStore(engine, game.newGame(engine, randomSeed(), startMap ? { start: startMap } : undefined));
const hud = new Hud(store, game);
hud.startOptions = startMap ? { start: startMap } : undefined;
const audio = setupAudio(store, game);
mountAudioControls(document.querySelector('.hud-top nav')!, audio);
attachUiSfx(audio);
setupTutorial(store, game);
setupClockHud(store);
const combatHud = new CombatHud(game);
const controller = new GameController(store, game, combatHud);

const requestedArt = new URLSearchParams(location.search).get('arte');
const manifest = game.art.presets[requestedArt ?? ''] ?? game.art.presets[game.art.default]!;
setupBarks(store, game, manifest);
setupAchievements(store, game, manifest);
setupRewardBoxes(store, game, manifest);

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

// Loot from a fight: coin/potions/scrolls already land straight in the shared bag (see
// rulesets/dnd5e/loot.ts and the combat log), but gear with a slot (weapon/armour/ring/
// cloak) asks who gets it, and - if that person already had something in that slot - who
// keeps the old one, chaining until someone takes it or it's left in the shared bag.
{
  const partyMemberIds = () => Object.values(store.state.entities).filter((e) => e.controllerId === game.playerId).map((e) => e.id);

  const offerReplaced = (oldItem: string, justEquippedTo: string, onDone: () => void) => {
    const ruleset = store.engine.ruleset;
    const slot = ruleset.itemSlot?.(oldItem);
    const def = game.items?.[oldItem];
    const others = partyMemberIds().filter((id) => id !== justEquippedTo);
    const options = others.map((id) => {
      const current = slot ? ruleset.equippedInSlot?.(store.state.entities[id]!, slot) : undefined;
      const name = store.state.entities[id]!.name;
      return {
        label: current ? `${name} (lleva ${game.items?.[current]?.label ?? current})` : name,
        onPick: () => {
          const r = store.dispatch({ type: 'equipItem', issuer: game.playerId, entityId: id, item: oldItem } as never);
          if (!r.ok) return onDone();
          const ev = r.events.find((e) => e.type === 'itemEquipped') as { replaced?: string } | undefined;
          if (ev?.replaced) offerReplaced(ev.replaced, id, onDone);
          else onDone();
        },
      };
    });
    options.push({ label: 'Guardarlo en la mochila', onPick: onDone });
    dialogue.ask(`¿Quién se queda con ${def?.label ?? oldItem}?`, options, false);
  };

  const offerEquip = (item: string, onDone: () => void, excludeId?: string) => {
    const def = game.items?.[item];
    const text = [def?.label ?? item, def?.text].filter(Boolean).join('\n');
    const candidates = partyMemberIds().filter((id) => id !== excludeId);
    if (candidates.length === 0) return onDone();
    dialogue.ask(
      text,
      candidates.map((id) => ({
        label: `Dárselo a ${store.state.entities[id]!.name}`,
        onPick: () => {
          const r = store.dispatch({ type: 'equipItem', issuer: game.playerId, entityId: id, item } as never);
          if (!r.ok) return onDone();
          const ev = r.events.find((e) => e.type === 'itemEquipped') as { replaced?: string } | undefined;
          if (ev?.replaced) offerReplaced(ev.replaced, id, onDone);
          else onDone();
        },
      })),
      false,
    );
  };

  let lootBusy = false;
  const lootQueue: string[] = [];
  const pumpLootQueue = () => {
    if (lootBusy) return;
    const item = lootQueue.shift();
    if (!item) return;
    lootBusy = true;
    offerEquip(item, () => {
      lootBusy = false;
      pumpLootQueue();
    });
  };

  store.subscribe((change) => {
    if (change.kind !== 'events') return;
    const dropped = new Set(change.events.filter((e) => e.type === 'lootDropped').map((e) => (e as unknown as { item: string }).item));
    for (const ev of change.events) {
      // Gear found in a chest or handed over in a conversation gets the same "who wears it?" question.
      const found = ev as unknown as { owner?: string; item?: string; from?: number; to?: number };
      const fromChest = ev.type === 'itemsChanged' && found.owner === 'party' && (found.to ?? 0) > (found.from ?? 0) && !dropped.has(found.item ?? '');
      if (ev.type !== 'lootDropped' && !fromChest) continue;
      const item = (ev as unknown as { item: string }).item;
      // Consumables and misc goods have no slot: they're already in the shared bag (see the
      // combat log line for them), nothing to ask.
      if (!store.engine.ruleset.itemSlot?.(item)) continue;
      lootQueue.push(item);
    }
    pumpLootQueue();
  });

  // The shared bag, one tap away (🎒 in the top bar): what you carry, what it does, and the
  // obvious things to do with it - drink a potion out of combat, put on gear left in the bag.
  const openBag = () => {
    const ruleset = store.engine.ruleset;
    const entries = Object.entries(inventoriesOf(store.state).party ?? {}).filter(([, n]) => n > 0);
    const worn = new Set(partyMemberIds().flatMap((id) => ruleset.equippedItems?.(store.state.entities[id]!) ?? []));
    const lines = entries.map(([item, n]) => {
      const def = game.items?.[item];
      return `• ${def?.label ?? item}${n > 1 ? ` ×${n}` : ''}${def?.text ? ` — ${def.text}` : ''}`;
    });
    const options: { label: string; onPick: () => void }[] = [];
    const fighting = store.state.turn.mode === 'combat';
    for (const [item] of entries) {
      const def = game.items?.[item];
      const name = def?.label ?? item;
      const use = ruleset.itemUse ? ruleset.itemUse(store.state, item) : !fighting && /^potion_/.test(item) ? { verb: 'Beber', command: (entityId: string, issuer: string) => ({ type: 'useItem', issuer, entityId, item }) as never } : null;
      if (use) {
        options.push({
          label: `${use.verb} ${name}`,
          onPick: () =>
            dialogue.ask(
              `¿Quién? (${name})`,
              partyMemberIds().map((id) => {
                const e = store.state.entities[id]!;
                const healthKey = Object.entries(ruleset.resources).find(([, r]) => r.role === 'health')?.[0] ?? 'hp';
                const hp = e.resources[healthKey];
                return { label: `${e.name}${hp ? ` (${hp.current}/${hp.max} ${ruleset.resources[healthKey]?.label ?? 'PG'})` : ''}`, onPick: () => {
                  const r = store.dispatch(use.command(id, game.playerId));
                  if (!r.ok) hud.say(r.error.message, true);
                } };
              }),
            ),
        });
      } else if (ruleset.itemSlot?.(item) && !worn.has(item)) {
        options.push({ label: `Equipar ${name}`, onPick: () => offerEquip(item, () => undefined) });
      }
    }
    const empty = game.texts.combat?.emptyBag ?? 'Nada. Ni una corona.';
    const hint = fighting ? '\n\nEn combate, las pociones y pergaminos se usan desde la barra de acciones.' : '';
    dialogue.ask(`🎒 ${game.texts.combat?.inventory ?? 'Mochila del grupo'}\n\n${lines.length ? lines.join('\n') : empty}${hint}`, options, game.texts.combat?.ok ?? 'Vale');
  };
  const bagButton = document.createElement('button');
  bagButton.textContent = '🎒';
  bagButton.dataset.hud = 'mochila'; // hidden until its tutorial step (GameDefinition.tutorialLocks)
  bagButton.title = game.texts.combat?.inventory ?? 'Mochila del grupo';
  bagButton.setAttribute('aria-label', bagButton.title);
  bagButton.addEventListener('click', openBag);
  document.querySelector('.hud-top nav')!.prepend(bagButton);

  // Picking things up says so: "+2 Poción de curación".
  store.subscribe((change) => {
    if (change.kind !== 'events') return;
    const gained = change.events
      .filter((e) => e.type === 'itemsChanged')
      .map((e) => e as unknown as { owner: string; item: string; from: number; to: number })
      .filter((e) => e.owner === 'party' && e.to > e.from);
    if (!gained.length) return;
    hud.say(`🎒 ${gained.map((g) => `+${g.to - g.from} ${game.items?.[g.item]?.label ?? g.item}`).join(', ')}`);
  });
}

// Changing gear later from the sheet re-runs the same assignment flow for that one item.
sheet.onChangeGear = (item: string) => {
  const def = game.items?.[item];
  const options = Object.values(store.state.entities)
    .filter((e) => e.controllerId === game.playerId)
    .map((e) => ({
      label: store.engine.ruleset.equippedInSlot?.(e, store.engine.ruleset.itemSlot?.(item) ?? '') === item ? `${e.name} (lo lleva)` : e.name,
      onPick: () => {
        const r = store.dispatch({ type: 'equipItem', issuer: game.playerId, entityId: e.id, item } as never);
        if (!r.ok) return;
      },
    }));
  options.push({ label: 'Guardarlo en la mochila', onPick: () => undefined });
  dialogue.ask(`¿Quién lleva ${def?.label ?? item}?`, options, false);
};

// Permadeath runs (GameDefinition.savePolicy): saved after every command in their own slot, and
// no saving, loading or exporting by hand while one is going.
const permadeath = new PermadeathSlot(engine);
const newRun = () => {
  store.load(game.newGame(engine, randomSeed(), hud.startOptions));
  startNew();
};
{
  const manual = ['save', 'load', 'export', 'import'];
  const apply = () => {
    const hard = game.savePolicy?.(store.state) === 'permadeath';
    for (const b of document.querySelectorAll<HTMLElement>('.hud-top nav button[data-action]')) if (manual.includes(b.dataset.action ?? '')) b.hidden = hard;
    return hard;
  };
  store.subscribe((change, state) => {
    if (apply() && change.kind === 'events') {
      const leader = state.entities[game.leaderId];
      // A lost run is not saved again (its slot is cleared with the summary).
      if (leader && engine.ruleset.isStanding(leader)) permadeath.save(state);
    }
    if (change.kind === 'reset' && apply()) permadeath.save(state);
  });
  apply();
}

// Defeat: the leader can't get up once the fight is over (the party lost, or the leader bled
// out while the others won). Play starts again from the last campfire: the state saved by the
// last rest (`rested` event), or the start of the game / the last loaded save if there was none.
{
  let checkpoint = store.state;
  let offered = false;
  store.subscribe((change, state) => {
    if (change.kind === 'reset') {
      offered = false;
      checkpoint = state;
      return;
    }
    if (change.events.some((e) => e.type === 'rested')) checkpoint = state;
    if (state.turn.mode === 'combat') return;
    const leader = state.entities[game.leaderId];
    if (!leader || engine.ruleset.isStanding(leader)) {
      offered = false;
      return;
    }
    // A story defeat may carry on in a conversation (captured, dragged off): let it.
    if (dialogueOfState(state)) return;
    if (offered) return;
    offered = true;
    const t = game.texts.combat ?? {};
    const back = checkpoint;
    const policy = game.defeat?.(state);
    setTimeout(() => {
      if (policy?.summary) {
        // The run is over (permadeath): the slot goes in the same moment, then the summary.
        if (game.savePolicy?.(state) === 'permadeath') permadeath.clear();
        const s = policy.summary;
        dialogue.ask(`${policy.text}\n\n${s.title}\n${s.lines.map((l: string) => `• ${l}`).join('\n')}`, [{ label: s.button, onPick: () => newRun() }], false);
        return;
      }
      const retry = policy?.retry;
      dialogue.ask(policy?.text ?? t.defeatText ?? 'Todo se vuelve negro. Así acaban las deudas mal cobradas.', [{ label: retry?.label ?? t.retryFight ?? 'Volver a la última hoguera', onPick: () => store.load(retry?.prepare ? retry.prepare(back) : back) }], false);
    }, 1200);
  });
}

// A won run: once the ending's conversation is over, the summary, the credits and a new run.
if (game.ending) {
  const credits = new CreditsScreen(game);
  let shown = false;
  store.subscribe((change, state) => {
    if (change.kind === 'reset') {
      shown = false;
      return;
    }
    if (shown || state.turn.mode === 'combat' || dialogueOfState(state)) return;
    const summary = game.ending!(state);
    if (!summary) return;
    shown = true;
    if (game.savePolicy?.(state) === 'permadeath') permadeath.clear();
    const show = () =>
      dialogue.ask(`${summary.title}\n${summary.lines.map((l: string) => `• ${l}`).join('\n')}`, [
        { label: (game.texts.ui as Record<string, string>).credits ?? 'Créditos', onPick: () => { credits.open(); setTimeout(show, 0); } },
        { label: summary.button, onPick: () => newRun() },
      ], false);
    setTimeout(show, 800);
  });
}

// Levelling up: the narration and what each companion makes of it.
controller.onLevelUp = (level) => {
  const lines = game.levels?.texts?.[String(level)];
  if (!lines) return;
  const party = Object.values(store.state.entities).filter((e) => e.controllerId === game.playerId);
  const said = party.filter((e) => lines[e.id]).map((e) => `${e.name}: «${lines[e.id]}»`);
  dialogue.ask(`${game.texts.combat?.levelUp ?? 'Subís a nivel'} ${level}. ${lines.narration ?? ''}\n\n${said.join('\n')}`, [], game.texts.combat?.ok ?? 'Vale');
};

// The Narrador (Willy): a line on screen for the moments that deserve one, with its rhythm and
// a history of the last lines (🎙).
setupNarratorBox(store, game, (lines) =>
  dialogue.ask(lines.length ? lines.join('\n\n') : (game.texts.combat?.narratorEmpty ?? 'El Narrador aún no ha dicho nada.'), [], game.texts.combat?.ok ?? 'Vale'),
);

// Announcements (an ability levelling up...): a toast, or a big banner for the big moments.
if (game.announce) {
  const box = document.createElement('div');
  box.id = 'announce';
  box.hidden = true;
  document.body.append(box);
  let timer = 0;
  store.subscribe((change, state) => {
    if (change.kind !== 'events') return;
    for (const e of change.events) {
      const a = game.announce!(e, state);
      if (!a) continue;
      box.textContent = a.text;
      box.classList.toggle('big', !!a.big);
      box.hidden = false;
      clearTimeout(timer);
      timer = window.setTimeout(() => (box.hidden = true), a.big ? 4000 : 2500);
    }
  });
  box.addEventListener('click', () => (box.hidden = true));
}

// The journal: what to do now. A 📜 button shows it; a change of objective is announced.
if (game.objectives?.length) {
  const current = () => {
    const leader = store.state.entities[game.leaderId];
    if (!leader) return '';
    return game.objectives!.find((o: { when?: Parameters<typeof evaluateCondition>[3]; text: string }) => !o.when || evaluateCondition(store.engine.ruleset, store.state, leader.id, o.when))?.text ?? '';
  };
  const button = document.createElement('button');
  button.textContent = '📜';
  button.title = game.texts.combat?.journal ?? 'Diario';
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => dialogue.ask(current(), [], game.texts.combat?.ok ?? 'Vale'));
  document.querySelector('.hud-top nav')!.prepend(button);
  let last = current();
  store.subscribe(() => {
    const now = current();
    if (now && now !== last) hud.say(`📜 ${now}`);
    last = now;
  });
}

// Game-specific counters, bubbles and panel (Willy's audience and sponsors).
setupShowHud(store, game, (code) => hud.sayError(code));

const creation = new CreationScreen(store, game);
// A new game: the game's questions (difficulty, elimination mode...), then character creation.
const setupScreen = new SetupScreen(store, game);
const startNew = () => setupScreen.open(() => creation.open());
hud.onNewGame = startNew;
// The title screen first; a new game plays the intro cinematic (if the game has one), then
// goes on to the setup screens and character creation. «Ver el prólogo» replays it.
const cinematic = new CinematicPlayer({
  // The cinematic's cues are played through the game's own sfx (a missing id is a no-op).
  sound: (cue) => audio.playSfx(cue === 'jingle' ? 'tvJingle' : 'gameshowDing'),
});
const intro = game.cinematics?.intro;
new TitleScreen(
  store,
  game,
  () => cinematic.play(intro, startNew),
  intro ? () => cinematic.play(intro, () => undefined) : undefined,
).open();
// A permadeath run in progress: «Continuar» resumes it exactly where it was (no other way in).
{
  const saved = permadeath.load();
  const buttons = document.querySelector('#title .buttons');
  if (saved && buttons) {
    const cont = document.createElement('button');
    cont.className = 'confirm';
    cont.textContent = game.texts.ui && (game.texts.ui as Record<string, string>).continueHardcore ? (game.texts.ui as Record<string, string>).continueHardcore! : 'Continuar (sin repetición)';
    cont.addEventListener('click', () => {
      store.load(saved.restored && game.onRestoredCopy ? game.onRestoredCopy(saved.state) : saved.state);
      document.querySelector<HTMLElement>('#title')!.hidden = true;
      if (saved.restored) hud.say('Esta copia es más antigua que la última partida: sigue, pero ya con repetición.', true);
    });
    buttons.prepend(cont);
  }
}

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
    ...(game.hud?.float ? { floatFor: (e: Parameters<NonNullable<typeof game.hud.float>>[0], st: Parameters<NonNullable<typeof game.hud.float>>[1]) => game.hud!.float!(e, st) } : {}),
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
    eliminated: combat.eliminated ?? '¡ELIMINADO!',
  },
  game.onDeath ?? 'corpse',
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
