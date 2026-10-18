import type { GameDefinition, SetupQuestion } from '../game/definition';
import type { GameStore } from '../game/store';

/**
 * The questions before a new game (GameDefinition.newGameSetup): one screen per question, each
 * with «Atrás», options with a line of explanation, the recommended one marked, and options that
 * an earlier answer rules out shown greyed with the reason. Then the answers go into the state.
 */
export class SetupScreen {
  private root: HTMLElement;

  constructor(
    private store: GameStore,
    private game: GameDefinition,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'setup';
    this.root.className = 'meta-panel';
    this.root.hidden = true;
    document.body.append(this.root);
  }

  /** Asks everything, applies it, then `done`. Without questions it goes straight on. */
  open(done: () => void): void {
    const setup = this.game.newGameSetup;
    if (!setup?.questions.length) return done();
    const answers: Record<string, string> = {};
    const show = (i: number) => {
      if (i >= setup.questions.length) {
        this.root.hidden = true;
        this.store.load(setup.apply(this.store.state, answers));
        return done();
      }
      this.render(setup.questions[i]!, answers, i, () => show(i + 1), i > 0 ? () => show(i - 1) : null);
    };
    show(0);
  }

  private render(q: SetupQuestion, answers: Record<string, string>, index: number, next: () => void, back: (() => void) | null): void {
    const box = document.createElement('div');
    box.className = 'box setup';
    const head = document.createElement('header');
    const h = document.createElement('h2');
    h.textContent = q.title;
    head.append(h);
    const body = document.createElement('div');
    body.className = 'body';
    const available = (o: SetupQuestion['options'][number]) => !o.unavailableIf || !o.unavailableIf.is.includes(answers[o.unavailableIf.question] ?? '');
    // Keep an earlier pick if it's still allowed; otherwise the recommended (or first) available one.
    const current = q.options.find((o) => o.id === answers[q.id] && available(o)) ?? q.options.find((o) => o.recommended && available(o)) ?? q.options.find(available)!;
    answers[q.id] = current.id;
    const warning = document.createElement('p');
    warning.className = 'warning';
    for (const o of q.options) {
      const ok = available(o);
      const b = document.createElement('button');
      b.className = `setup-option${o.id === answers[q.id] ? ' selected' : ''}`;
      b.disabled = !ok;
      b.setAttribute('aria-pressed', String(o.id === answers[q.id]));
      const name = document.createElement('strong');
      name.textContent = `${o.label}${o.recommended ? ' · recomendado' : ''}`;
      const text = document.createElement('span');
      text.textContent = ok ? o.text : `${o.text} ${o.unavailableIf!.reason}`;
      b.append(name, text);
      b.addEventListener('click', () => {
        answers[q.id] = o.id;
        this.render(q, answers, index, next, back);
      });
      body.append(b);
    }
    warning.textContent = q.options.find((o) => o.id === answers[q.id])?.warning ?? '';
    body.append(warning);
    const buttons = document.createElement('div');
    buttons.className = 'setup-buttons';
    if (back) {
      const b = document.createElement('button');
      b.textContent = 'Atrás';
      b.addEventListener('click', back);
      buttons.append(b);
    }
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = 'Seguir';
    go.addEventListener('click', next);
    buttons.append(go);
    box.append(head, body, buttons);
    this.root.replaceChildren(box);
    this.root.hidden = false;
  }
}
