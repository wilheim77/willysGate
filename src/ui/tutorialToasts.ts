import { type DialogueWhen, type GameEvent, type GameState, evaluateCondition, tileAt } from '../../engine';
import type { GameDefinition } from '../game/definition';
import type { GameStore, StoreChange } from '../game/store';

/** One step of `content/<game>/tutorial.json`. Fires once per game (persisted per save seed). */
export interface TutorialStep {
  id: string;
  trigger: { event: string; match?: Record<string, unknown> } | { when: DialogueWhen };
  text: string;
}

const ENABLED_KEY = 'willysgate.tutorial.enabled';

function shownKey(game: GameDefinition, seed: number): string {
  return `willysgate.tutorial.${game.id}.${seed}`;
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
    // Private mode or storage disabled: steps may repeat across sessions; harmless.
  }
}

function isEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

function setEnabled(v: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, v ? '1' : '0');
  } catch {
    // Private mode or storage disabled: the toggle just won't stick across reloads.
  }
}

/** Reads a dotted path (array indices work too, e.g. "roll.dice.0.note") off a plain object. */
function getPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Adds fields a step's `match` can reference but the raw event doesn't carry flat:
 * - attackRolled: `mode` ("advantage"/"disadvantage"/"normal"), from the d20's roll note
 *   (`roll.dice[0].note`, set by rulesets/common/d20.ts to "ventaja"/"desventaja").
 * - entityMoved: `highGround`, computed by comparing the tile height at `from` and at
 *   the move's destination (`path`'s last tile) — the event itself has neither.
 */
function enrich(event: GameEvent, state: GameState): Record<string, unknown> {
  const e = event as unknown as Record<string, unknown>;
  if (event.type === 'attackRolled') {
    const note = getPath(e, 'roll.dice.0.note');
    return { ...e, mode: note === 'ventaja' ? 'advantage' : note === 'desventaja' ? 'disadvantage' : 'normal' };
  }
  if (event.type === 'entityMoved') {
    const ev = e as unknown as { from: { x: number; y: number }; path: { x: number; y: number }[] };
    const dest = ev.path.length ? ev.path[ev.path.length - 1]! : ev.from;
    const fromHeight = tileAt(state.map, ev.from)?.height ?? 0;
    const toHeight = tileAt(state.map, dest)?.height ?? 0;
    return { ...e, highGround: toHeight > fromHeight };
  }
  return e;
}

function matchesEvent(step: TutorialStep, event: GameEvent, state: GameState): boolean {
  const t = step.trigger;
  if ('when' in t) return false;
  if (event.type !== t.event) return false;
  if (!t.match) return true;
  const enriched = enrich(event, state);
  return Object.entries(t.match).every(([k, v]) => String(getPath(enriched, k)) === String(v));
}

function matchesIdle(step: TutorialStep, state: GameState, game: GameDefinition): boolean {
  const t = step.trigger;
  if (!('when' in t)) return false;
  return evaluateCondition(game.ruleset, state, game.leaderId, t.when);
}

/**
 * Dismissable tutorial card (top-centre) driven by `content/<game>/tutorial.json`: each
 * step shows once per game. No engine/rulesets changes — event-triggered steps come from
 * the GameStore's events, `when`-triggered steps are re-checked whenever the state
 * changes (same idle-condition mechanism dialogues use, `evaluateCondition`). There's no
 * client-side way to set an engine flag for "already shown", so this remembers shown ids
 * in localStorage keyed by the game id and the save's seed.
 */
export class TutorialToasts {
  private shown: Set<string>;
  private seed: number;
  private card = document.createElement('div');

  constructor(
    private store: GameStore,
    private game: GameDefinition,
  ) {
    this.seed = store.state.seed;
    this.shown = loadShown(game, this.seed);

    this.card.className = 'tutorial-toast';
    this.card.hidden = true;
    document.body.append(this.card);

    store.subscribe((change: StoreChange) => {
      if (change.kind === 'reset') {
        this.seed = store.state.seed;
        this.shown = loadShown(game, this.seed);
      } else {
        for (const event of change.events) if (this.tryEvent(event)) break;
      }
      this.tryIdle();
    });
    this.tryIdle();
  }

  private steps(): TutorialStep[] {
    return isEnabled() ? this.game.tutorial ?? [] : [];
  }

  private tryEvent(event: GameEvent): boolean {
    for (const step of this.steps()) {
      if (this.shown.has(step.id)) continue;
      if (matchesEvent(step, event, this.store.state)) {
        this.show(step);
        return true;
      }
    }
    return false;
  }

  private tryIdle(): void {
    for (const step of this.steps()) {
      if (this.shown.has(step.id)) continue;
      if (matchesIdle(step, this.store.state, this.game)) {
        this.show(step);
        return;
      }
    }
  }

  private show(step: TutorialStep): void {
    this.shown.add(step.id);
    saveShown(this.game, this.seed, this.shown);

    const text = document.createElement('p');
    text.textContent = step.text;
    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', 'Cerrar');
    close.textContent = '×';
    close.addEventListener('click', () => (this.card.hidden = true));

    this.card.replaceChildren(text, close);
    this.card.hidden = false;
  }
}

/** Mounts the "Consejos" on/off toggle (e.g. into `.hud-top nav`, alongside other controls). */
export function mountTutorialToggle(container: HTMLElement): void {
  const label = document.createElement('label');
  label.className = 'tutorial-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = isEnabled();
  input.addEventListener('change', () => setEnabled(input.checked));
  const span = document.createElement('span');
  span.textContent = 'Consejos';
  label.append(input, span);
  container.append(label);
}

/** Call once from `src/main.ts`: `setupTutorial(store, game);` — mounts the card and the toggle. */
export function setupTutorial(store: GameStore, game: GameDefinition): TutorialToasts {
  const toasts = new TutorialToasts(store, game);
  const nav = document.querySelector<HTMLElement>('.hud-top nav');
  if (nav) mountTutorialToggle(nav);
  return toasts;
}
