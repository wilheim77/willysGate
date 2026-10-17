import { type CreationChoices, type CreationStep, pointsSpent } from '../../engine';
import type { GameDefinition } from '../game/definition';
import type { GameStore } from '../game/store';

type PointsStep = Extract<CreationStep, { kind: 'points' }>;

/**
 * Full-screen character creation, drawn from the ruleset's CreationSpec: name, picks
 * (race, class) and a point-buy panel with a "Recomendado" button for people who just
 * want to play. "Empezar" hands the answers to the game, which builds the protagonist.
 */
export class CreationScreen {
  private root = document.querySelector<HTMLElement>('#creation')!;
  private choices: CreationChoices = {};

  constructor(
    private store: GameStore,
    private game: GameDefinition,
  ) {}

  open(): void {
    const creation = this.game.creation;
    if (!creation) return;
    this.choices = structuredClone(creation.defaults());
    this.render();
    this.root.hidden = false;
  }

  private render(): void {
    const spec = this.game.creation!.spec;
    const panel = document.createElement('div');
    panel.className = 'panel';
    const title = document.createElement('h2');
    title.textContent = this.text('title', 'Tu personaje');
    panel.append(title);
    for (const step of spec.steps) panel.append(this.section(step));

    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    const quick = document.createElement('button');
    quick.textContent = this.text('quickStart', 'Partida rápida');
    quick.addEventListener('click', () => this.start(this.game.creation!.defaults()));
    const start = document.createElement('button');
    start.className = 'confirm';
    start.textContent = this.text('start', 'Empezar');
    const step = spec.steps.find((s): s is PointsStep => s.kind === 'points');
    const spent = step ? pointsSpent(step, this.choices[step.id] as Record<string, number>) : 0;
    start.disabled = step ? spent === null || spent > step.budget : false;
    start.addEventListener('click', () => this.start(this.choices));
    buttons.append(quick, start);
    panel.append(buttons);

    const scroll = this.root.querySelector('.panel')?.scrollTop ?? 0;
    this.root.replaceChildren(panel);
    panel.scrollTop = scroll;
  }

  private text(key: string, fallback: string): string {
    return this.game.texts.creation?.[key] ?? fallback;
  }

  private section(step: CreationStep): HTMLElement {
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = step.label;
    sec.append(h);
    if (step.kind === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = step.maxLength;
      input.value = String(this.choices[step.id] ?? step.default);
      input.setAttribute('aria-label', step.label);
      input.addEventListener('input', () => (this.choices[step.id] = input.value));
      sec.append(input);
    } else if (step.kind === 'pick') {
      const list = document.createElement('div');
      list.className = 'options';
      for (const o of step.options) {
        const b = document.createElement('button');
        b.className = 'option';
        b.classList.toggle('selected', this.choices[step.id] === o.id);
        b.setAttribute('aria-pressed', String(this.choices[step.id] === o.id));
        const label = document.createElement('strong');
        label.textContent = o.label;
        b.append(label);
        if (o.text) {
          const p = document.createElement('span');
          p.textContent = o.text;
          b.append(p);
        }
        b.addEventListener('click', () => {
          this.choices[step.id] = o.id;
          this.render();
        });
        list.append(b);
      }
      sec.append(list);
    } else {
      sec.append(this.points(step));
    }
    return sec;
  }

  private points(step: PointsStep): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'points';
    const values = this.choices[step.id] as Record<string, number>;
    const bonuses = step.bonuses?.(this.choices) ?? {};
    const spent = pointsSpent(step, values) ?? Infinity;
    if (step.help) {
      const help = document.createElement('p');
      help.className = 'help-text';
      help.textContent = step.help;
      wrap.append(help);
    }
    const head = document.createElement('div');
    head.className = 'budget';
    head.textContent = `${this.text('pointsLeft', 'Puntos libres')}: ${step.budget - spent}`;
    const rec = document.createElement('button');
    rec.textContent = this.text('recommended', 'Recomendado');
    rec.addEventListener('click', () => {
      this.choices[step.id] = step.recommended(this.choices);
      this.render();
    });
    head.append(rec);
    wrap.append(head);

    for (const s of step.stats) {
      const v = values[s.id] ?? step.min;
      const row = document.createElement('div');
      row.className = 'stat';
      const label = document.createElement('span');
      label.textContent = s.label;
      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.setAttribute('aria-label', `${s.label} −1`);
      minus.disabled = v <= step.min;
      minus.addEventListener('click', () => this.bump(step, s.id, -1));
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = String(v);
      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.setAttribute('aria-label', `${s.label} +1`);
      const next = { ...values, [s.id]: v + 1 };
      const nextSpent = pointsSpent(step, next);
      plus.disabled = v >= step.max || nextSpent === null || nextSpent > step.budget;
      plus.addEventListener('click', () => this.bump(step, s.id, 1));
      const final = document.createElement('span');
      final.className = 'final';
      const total = v + (bonuses[s.id] ?? 0);
      const mod = Math.floor((total - 10) / 2);
      final.textContent = `${bonuses[s.id] ? `+${bonuses[s.id]} → ` : ''}${total} (${mod >= 0 ? '+' : ''}${mod})`;
      row.append(label, minus, value, plus, final);
      wrap.append(row);
    }
    return wrap;
  }

  private bump(step: PointsStep, id: string, delta: number): void {
    const values = { ...(this.choices[step.id] as Record<string, number>) };
    values[id] = (values[id] ?? step.min) + delta;
    this.choices[step.id] = values;
    this.render();
  }

  private start(choices: CreationChoices): void {
    try {
      this.store.load(this.game.creation!.apply(this.store.engine, this.store.state, choices));
      this.root.hidden = true;
      // The story starts talking (only where its speaker is present, e.g. not on the test map).
      const opening = this.game.opening;
      if (opening && this.game.dialogues?.[opening.dialogue] && (!opening.partner || this.store.state.entities[opening.partner])) {
        this.store.dispatch({ type: 'startDialogue', issuer: 'system', treeId: opening.dialogue, actorId: this.game.leaderId, ...(opening.partner ? { partnerId: opening.partner } : {}) } as never);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
