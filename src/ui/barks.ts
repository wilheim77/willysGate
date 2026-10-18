import { type DialogueWhen, type GameEvent, dialogueOf, evaluateCondition } from '../../engine';
import type { AssetManifest } from '../assets/manifest';
import type { GameDefinition } from '../game/definition';
import type { GameStore, StoreChange } from '../game/store';
import { portrait } from './portraits';

/** One companion line in `content/<game>/barks.json`. */
export interface BarkEntry {
  speaker: string;
  text: string;
  when?: DialogueWhen;
}

/**
 * Keys are `map:<id>` (first arrival on a map), `flag:<flag>` (the flag's first true),
 * an engine event type fired during combat (downed, died, exploded, entityFell,
 * entityPushed, combatStarted, combatEnded), or `crit` (a critical hit by the party).
 */
export type BarksData = Record<string, BarkEntry[]>;

const BARK_EVENTS = ['downed', 'died', 'exploded', 'entityFell', 'entityPushed', 'combatStarted', 'combatEnded'];
const SHOW_MS = 4000;

function shownKey(game: GameDefinition, seed: number): string {
  return `willysgate.barks.${game.id}.${seed}`;
}

function loadShown(game: GameDefinition, seed: number): Set<string> {
  try {
    const raw = localStorage.getItem(shownKey(game, seed));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveShown(game: GameDefinition, seed: number, shown: Set<string>): void {
  try {
    localStorage.setItem(shownKey(game, seed), JSON.stringify([...shown]));
  } catch {
    // Private mode or storage disabled: a map/flag bark may repeat across sessions; harmless.
  }
}

/**
 * Companion speech bubbles, near the party column, driven entirely by data
 * (`content/<game>/barks.json`). No engine/rulesets changes: `map:`/`flag:` keys are
 * checked against the GameStore's state on every change, the combat-event keys and
 * `crit` come straight off its events. `map:`/`flag:` barks play once per game (shown
 * ids kept in localStorage, keyed by game id + save seed — no client-side way to set an
 * engine flag); the combat/crit ones can repeat, picking a random eligible line each
 * time. Never shown while a conversation is open.
 */
export class BarkBubbles {
  private shown: Set<string>;
  private seed: number;
  private bubble = document.createElement('div');
  private hideTimer = 0;

  constructor(
    private store: GameStore,
    private game: GameDefinition,
    private manifest: AssetManifest,
  ) {
    this.seed = store.state.seed;
    this.shown = loadShown(game, this.seed);

    this.bubble.className = 'bark-bubble';
    this.bubble.hidden = true;
    document.body.append(this.bubble);

    store.subscribe((change: StoreChange) => {
      if (change.kind === 'reset') {
        this.seed = store.state.seed;
        this.shown = loadShown(game, this.seed);
        this.tryOnce(`map:${store.state.map.id}`);
        return;
      }
      for (const event of change.events) this.handleEvent(event);
      this.checkFlags();
    });
    this.tryOnce(`map:${store.state.map.id}`);
    this.checkFlags();
  }

  private data(): BarksData {
    return this.game.barks ?? {};
  }

  private handleEvent(event: GameEvent): void {
    if (event.type === 'mapChanged') {
      this.tryOnce(`map:${(event as unknown as { to: string }).to}`);
      return;
    }
    if (event.type === 'attackRolled') {
      const e = event as unknown as { attackerId: string; crit: boolean };
      if (e.crit && this.inParty(e.attackerId)) this.tryRandom('crit');
      return;
    }
    if (BARK_EVENTS.includes(event.type)) this.tryRandom(event.type);
  }

  private checkFlags(): void {
    for (const key of Object.keys(this.data())) {
      if (!key.startsWith('flag:') || this.shown.has(key)) continue;
      if (this.store.state.flags[key.slice('flag:'.length)]) this.tryOnce(key);
    }
  }

  private inParty(entityId: string): boolean {
    const who = this.store.state.entities[entityId];
    const leader = this.store.state.entities[this.game.leaderId];
    return !!who && !!leader && who.controllerId === leader.controllerId;
  }

  private eligible(entry: BarkEntry): boolean {
    const speaker = this.store.state.entities[entry.speaker];
    if (!speaker || !this.inParty(entry.speaker)) return false;
    if (!this.store.engine.ruleset.isStanding(speaker)) return false;
    if (entry.when && !evaluateCondition(this.store.engine.ruleset, this.store.state, entry.speaker, entry.when)) return false;
    return true;
  }

  /** `map:`/`flag:` keys: first eligible entry, shown once per game. */
  private tryOnce(key: string): void {
    if (this.shown.has(key)) return;
    const entry = this.data()[key]?.find((e) => this.eligible(e));
    if (!entry) return;
    this.shown.add(key);
    saveShown(this.game, this.seed, this.shown);
    this.show(entry);
  }

  /** Combat-event/`crit` keys: a random eligible entry each time, can repeat. */
  private tryRandom(key: string): void {
    const eligible = this.data()[key]?.filter((e) => this.eligible(e));
    if (!eligible?.length) return;
    this.show(eligible[Math.floor(Math.random() * eligible.length)]!);
  }

  private show(entry: BarkEntry): void {
    if (dialogueOf(this.store.state)) return; // never over an open conversation
    const speaker = this.store.state.entities[entry.speaker];
    if (!speaker) return;

    this.bubble.replaceChildren(portrait(this.manifest, speaker.spriteId, 40), Object.assign(document.createElement('p'), { textContent: entry.text }));
    this.bubble.hidden = false;
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => (this.bubble.hidden = true), SHOW_MS);
  }
}

/** Call once from `src/main.ts`, once the art manifest is known: `setupBarks(store, game, manifest);` */
export function setupBarks(store: GameStore, game: GameDefinition, manifest: AssetManifest): BarkBubbles {
  return new BarkBubbles(store, game, manifest);
}
