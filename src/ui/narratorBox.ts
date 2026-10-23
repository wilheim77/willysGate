import type { GameDefinition, NarratorLine } from '../game/definition';
import type { GameStore } from '../game/store';

/**
 * The narrator's box (generic; Willy's Narrador). Rhythm (DESIGN.md §10 of Willy): one line at
 * a time; a new one only after `minGapMs`; when several arrive, the highest priority wins and the
 * rest are dropped, except priority ≥ `queuePriority`, which waits its turn. Lines type in
 * letter by letter and close by themselves (≈ `msPerChar` per character + `holdMs`) or with a
 * tap (a first tap finishes the typing). The last `historySize` lines can be read again from the
 * 🎙 button.
 */
export interface NarratorBoxOptions {
  minGapMs: number;
  queuePriority: number;
  msPerChar: number;
  holdMs: number;
  typeMsPerChar: number;
  historySize: number;
}

const DEFAULTS: NarratorBoxOptions = { minGapMs: 2500, queuePriority: 5, msPerChar: 50, holdMs: 1500, typeMsPerChar: 22, historySize: 50 };

export function setupNarratorBox(store: GameStore, game: GameDefinition, showHistory: (lines: string[]) => void, options: Partial<NarratorBoxOptions> = {}): void {
  if (!game.narrate && !game.narrateEvents) return;
  const o = { ...DEFAULTS, ...options };
  const box = document.createElement('div');
  box.id = 'narrator';
  box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  document.body.append(box);

  const history: string[] = [];
  const queue: string[] = [];
  let showing: string | null = null;
  let typed = 0;
  let typeTimer = 0;
  let closeTimer = 0;
  let lastShownAt = -Infinity;

  const finishTyping = () => {
    clearInterval(typeTimer);
    typeTimer = 0;
    if (showing) box.textContent = showing;
  };

  const close = () => {
    finishTyping();
    clearTimeout(closeTimer);
    box.hidden = true;
    showing = null;
    const next = queue.shift();
    if (next) window.setTimeout(() => show(next), Math.max(0, o.minGapMs - (performance.now() - lastShownAt)));
  };

  const show = (text: string) => {
    showing = text;
    lastShownAt = performance.now();
    history.push(text);
    if (history.length > o.historySize) history.shift();
    typed = 0;
    box.textContent = '';
    box.hidden = false;
    clearInterval(typeTimer);
    typeTimer = window.setInterval(() => {
      typed += 1;
      box.textContent = text.slice(0, typed);
      if (typed >= text.length) finishTyping();
    }, o.typeMsPerChar);
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(close, text.length * o.typeMsPerChar + text.length * o.msPerChar + o.holdMs);
  };

  const offer = (line: NarratorLine) => {
    const { text, priority } = typeof line === 'string' ? { text: line, priority: 0 } : { text: line.text, priority: line.priority ?? 0 };
    const busy = showing !== null || performance.now() - lastShownAt < o.minGapMs;
    if (!busy) return show(text);
    if (priority >= o.queuePriority) queue.push(text);
  };

  store.subscribe((change, state) => {
    if (change.kind === 'reset') {
      queue.length = 0;
      return;
    }
    const line = game.narrateEvents
      ? game.narrateEvents(change.events, state)
      : (change.events.map((e) => game.narrate!(e, state)).find((l) => l) ?? null);
    if (line) offer(line);
  });

  box.addEventListener('click', () => {
    if (typeTimer) finishTyping();
    else close();
  });

  const nav = document.querySelector('.hud-top nav');
  if (nav) {
    const button = document.createElement('button');
    button.textContent = '🎙';
    button.title = game.texts.combat?.narratorHistory ?? 'Lo que ha dicho el Narrador';
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', () => showHistory([...history].reverse()));
    nav.prepend(button);
  }
}
