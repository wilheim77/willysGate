import { type DialogueWhen, type GameEvent, type GameState, evaluateCondition, tileAt } from '../../engine';
import type { GameDefinition } from '../game/definition';
import type { GameStore, StoreChange } from '../game/store';
import type { TutorialStep } from '../game/tutorialStep';

export type { TutorialStep };

/** Full-screen layers that cover the game: a tip shown beneath one would be spent unseen, so it waits. */
const COVERING_OVERLAYS = '#title, #creation, #intro, #cinematic, #setup, #credits';

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
  if (!('event' in t)) return false;
  if (event.type !== t.event) return false;
  if (t.match) {
    const enriched = enrich(event, state);
    if (!Object.entries(t.match).every(([k, v]) => String(getPath(enriched, k)) === String(v))) return false;
  }
  return step.check ? step.check(event, state) : true;
}

function matchesIdle(step: TutorialStep, state: GameState, game: GameDefinition): boolean {
  const t = step.trigger;
  if ('onMap' in t) return state.map.id === t.onMap;
  if (!('when' in t)) return false;
  return evaluateCondition(game.ruleset, state, game.leaderId, t.when);
}

const covered = (): boolean => [...document.querySelectorAll<HTMLElement>(COVERING_OVERLAYS)].some((el) => !el.hidden);

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
  private closeTimer = 0;
  private retryTimer = 0;

  constructor(
    private store: GameStore,
    private game: GameDefinition,
  ) {
    this.seed = store.state.seed;
    this.shown = loadShown(game, this.seed);

    this.card.className = 'tutorial-toast';
    this.card.hidden = true;
    document.body.append(this.card);
    this.applyLocks();

    store.subscribe((change: StoreChange) => {
      if (change.kind === 'reset') {
        this.seed = store.state.seed;
        this.shown = loadShown(game, this.seed);
      } else {
        for (const event of change.events) if (this.tryEvent(event)) break;
      }
      this.tryIdle();
      this.applyLocks();
    });
    this.tryIdle();
  }

  /**
   * HUD pieces a step introduces stay hidden until it has been shown («no system appears
   * unexplained»): `GameDefinition.tutorialLocks` maps a HUD id to that step. The ids are
   * set on <body data-locks="…"> and the stylesheet hides what they name. Turning the
   * tutorial off ("Consejos") releases every lock.
   */
  applyLocks(): void {
    const locks = this.game.tutorialLocks ?? {};
    const locked = isEnabled() ? Object.entries(locks).filter(([, step]) => !this.shown.has(step)).map(([hud]) => hud) : [];
    document.body.dataset.locks = locked.join(' ');
  }

  private steps(): TutorialStep[] {
    return isEnabled() ? this.game.tutorial ?? [] : [];
  }

  private ready(step: TutorialStep): boolean {
    return !this.shown.has(step.id) && (step.after ?? []).every((id) => this.shown.has(id));
  }

  private tryEvent(event: GameEvent): boolean {
    for (const step of this.steps()) {
      if (!this.ready(step)) continue;
      if (matchesEvent(step, event, this.store.state)) {
        this.show(step);
        return true;
      }
    }
    return false;
  }

  private tryIdle(): void {
    for (const step of this.steps()) {
      if (!this.ready(step)) continue;
      if (matchesIdle(step, this.store.state, this.game)) {
        // Wait for the title, setup and casting screens to close (nothing else changes
        // the state when they do), then look again.
        if (covered()) {
          window.clearTimeout(this.retryTimer);
          this.retryTimer = window.setTimeout(() => this.tryIdle(), 500);
          return;
        }
        this.show(step);
        return;
      }
    }
  }

  private show(step: TutorialStep): void {
    this.shown.add(step.id);
    saveShown(this.game, this.seed, this.shown);

    const body = document.createElement('div');
    body.className = 'body';
    for (const paragraph of Array.isArray(step.text) ? step.text : [step.text]) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      body.append(p);
    }
    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', 'Cerrar');
    close.textContent = '×';
    close.addEventListener('click', () => (this.card.hidden = true));

    this.card.replaceChildren(body, close);
    this.card.hidden = false;
    this.applyLocks();
    window.clearTimeout(this.closeTimer);
    if (step.autoCloseSeconds) this.closeTimer = window.setTimeout(() => (this.card.hidden = true), step.autoCloseSeconds * 1000);
  }
}

/** Mounts the "Consejos" on/off toggle (e.g. into `.hud-top nav`, alongside other controls). */
export function mountTutorialToggle(container: HTMLElement, onChange?: () => void): void {
  const label = document.createElement('label');
  label.className = 'tutorial-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = isEnabled();
  input.addEventListener('change', () => {
    setEnabled(input.checked);
    onChange?.();
  });
  const span = document.createElement('span');
  span.textContent = 'Consejos';
  label.append(input, span);
  container.append(label);
}

/** Call once from `src/main.ts`: `setupTutorial(store, game);` — mounts the card and the toggle. */
export function setupTutorial(store: GameStore, game: GameDefinition): TutorialToasts {
  const toasts = new TutorialToasts(store, game);
  const nav = document.querySelector<HTMLElement>('.hud-top nav');
  if (nav) mountTutorialToggle(nav, () => toasts.applyLocks());
  return toasts;
}
