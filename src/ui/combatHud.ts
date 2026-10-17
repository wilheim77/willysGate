import type { ActionDef, ActionPreview, CheckResult, Entity, GameEvent, GameState, Ruleset } from '../../engine';
import type { GameDefinition } from '../game/definition';

/**
 * DOM overlay for combat: initiative order, the active character's card and actions,
 * a preview sheet (hit chance, expected damage, glossary-linked breakdown) that must be
 * confirmed before acting, and a short roll log. Everything is rebuilt from state.
 */
export class CombatHud {
  private root = document.querySelector<HTMLElement>('#combat')!;
  private order = document.querySelector<HTMLElement>('#initiative')!;
  private bar = document.querySelector<HTMLElement>('#action-bar')!;
  private sheet = document.querySelector<HTMLElement>('#preview-sheet')!;
  private logEl = document.querySelector<HTMLElement>('#combat-log')!;
  private toast = document.querySelector<HTMLElement>('#message')!;
  private lines: string[] = [];
  private toastTimer = 0;

  constructor(private game: GameDefinition) {}

  private t(key: string, fallback = ''): string {
    return this.game.texts.combat?.[key] ?? fallback;
  }

  say(text: string, isError = false): void {
    this.toast.textContent = text;
    this.toast.classList.toggle('error', isError);
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.textContent = ''), 3500);
  }

  render(
    state: GameState,
    ruleset: Ruleset,
    activeId: string | null,
    playerTurn: boolean,
    selectedActionId: string | null,
    onAction: (a: ActionDef | null) => void,
    onEndTurn: () => void,
  ): void {
    const inCombat = state.turn.mode === 'combat';
    this.root.hidden = !inCombat;
    if (!inCombat) {
      this.sheet.hidden = true;
      return;
    }
    const health = Object.entries(ruleset.resources).find(([, r]) => r.role === 'health')?.[0] ?? 'hp';

    // Initiative strip.
    this.order.replaceChildren(
      ...state.turn.order.map((id) => {
        const e = state.entities[id];
        const chip = document.createElement('div');
        chip.className = 'chip';
        if (!e) return chip;
        const hp = e.resources[health];
        chip.classList.toggle('active', id === activeId);
        chip.classList.toggle('foe', e.controllerId !== this.game.playerId);
        chip.classList.toggle('down', !ruleset.isStanding(e));
        chip.innerHTML = `<span class="name"></span><span class="hp"><i style="width:${hp ? Math.round((100 * hp.current) / Math.max(1, hp.max)) : 0}%"></i></span>`;
        chip.querySelector('.name')!.textContent = e.name;
        return chip;
      }),
    );
    document.querySelector<HTMLElement>('#round')!.textContent = `${this.t('round', 'Ronda')} ${state.turn.round}`;

    // Active character card and actions (player's turn only).
    this.bar.hidden = !playerTurn || !activeId;
    if (!playerTurn || !activeId) {
      this.bar.replaceChildren(this.statusLine(state, activeId));
      this.bar.hidden = false;
      return;
    }
    const actor = state.entities[activeId]!;
    const left = Math.max(0, ruleset.movementBudget(actor, state) - state.turn.movementUsed);
    const card = document.createElement('div');
    card.className = 'card';
    const hp = actor.resources[health];
    const pips = (id: string, symbol: string, title: string) =>
      actor.resources[id] ? `<span class="pip ${actor.resources[id]!.current > 0 ? 'on' : ''}" title="${title}">${symbol}</span>` : '';
    card.innerHTML = `<strong></strong> <span class="hpnum">${hp ? `${hp.current}/${hp.max}` : ''}</span>
      ${pips('action', '●', 'Acción')}${pips('bonus_action', '◆', 'Acción adicional')}${pips('reaction', '▲', 'Reacción')}
      <span class="move">${this.t('movement', 'Mov.')} ${left}</span>`;
    card.querySelector('strong')!.textContent = actor.name;

    const buttons = document.createElement('div');
    buttons.className = 'actions';
    for (const a of ruleset.listActions(state, activeId)) {
      const affordable = Object.entries(a.cost).every(([r, n]) => (actor.resources[r]?.current ?? 0) >= n);
      if (!affordable && (a.id.startsWith('basic:') || a.id.startsWith('feature:'))) continue;
      const b = document.createElement('button');
      b.textContent = a.label;
      b.title = a.description ?? '';
      b.disabled = !affordable;
      b.classList.toggle('selected', a.id === selectedActionId);
      if (a.cost.bonus_action) b.classList.add('bonus');
      b.addEventListener('click', () => onAction(a.id === selectedActionId ? null : a));
      buttons.append(b);
    }
    const end = document.createElement('button');
    end.className = 'end-turn';
    end.textContent = this.t('endTurn', 'Terminar turno');
    end.addEventListener('click', onEndTurn);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = selectedActionId ? this.t('pickTarget', 'Elige objetivo') : this.t('moveOrAct', 'Toca una casilla para moverte o elige una acción');
    this.bar.replaceChildren(card, buttons, end, hint);
  }

  private statusLine(state: GameState, activeId: string | null): HTMLElement {
    const div = document.createElement('div');
    div.className = 'hint';
    const name = activeId ? state.entities[activeId]?.name : '';
    div.textContent = `${this.t('enemyTurn', 'Turno de')} ${name ?? ''}…`;
    return div;
  }

  showEntity(e: Entity, state: GameState): void {
    const hp = e.resources.hp;
    const conditions = e.conditions.map((c) => this.game.ruleset.conditions[c.id]?.label ?? c.id).join(', ');
    this.say(`${e.name}${hp ? ` · ${hp.current}/${hp.max}` : ''}${conditions ? ` · ${conditions}` : ''}`);
    void state;
  }

  /** The decision point: what will happen, how likely, in plain words, before committing. */
  showPreview(action: ActionDef, preview: ActionPreview, targetName: string | undefined, onConfirm: () => void): void {
    const glossary = this.game.ruleset.glossary;
    this.sheet.hidden = false;
    this.sheet.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = targetName ? `${action.label} → ${targetName}` : action.label;
    this.sheet.append(title);

    if (!preview.valid) {
      const p = document.createElement('p');
      p.className = 'error';
      p.textContent = preview.reason ?? this.game.texts.ui.genericError;
      this.sheet.append(p, this.sheetButtons(null));
      return;
    }
    const big = document.createElement('div');
    big.className = 'big';
    const parts: string[] = [];
    if (preview.chance !== undefined && preview.chance < 1) parts.push(`${Math.round(preview.chance * 100)} %`);
    if (preview.expectedDamage) parts.push(`~${Math.round(preview.expectedDamage)} ${this.t('damage', 'daño')}`);
    if (preview.expectedHealing) parts.push(`~${Math.round(preview.expectedHealing)} ${this.t('healing', 'curación')}`);
    big.textContent = parts.join(' · ') || this.t('sure', 'Seguro');
    this.sheet.append(big);
    if (action.description) {
      const d = document.createElement('p');
      d.className = 'desc';
      d.textContent = action.description;
      this.sheet.append(d);
    }
    const rows = document.createElement('dl');
    for (const line of preview.breakdown ?? []) {
      const dt = document.createElement('dt');
      dt.textContent = line.label;
      const dd = document.createElement('dd');
      dd.textContent = line.value ?? '';
      if (line.term && glossary[line.term]) {
        // Tap the "?" to read what the term means in plain language.
        const help = document.createElement('button');
        help.className = 'help';
        help.textContent = '?';
        const explain = document.createElement('div');
        explain.className = 'explain';
        explain.hidden = true;
        explain.textContent = `${glossary[line.term]!.label}: ${glossary[line.term]!.text}`;
        help.addEventListener('click', () => (explain.hidden = !explain.hidden));
        dt.append(' ', help);
        rows.append(dt, dd, explain);
      } else {
        rows.append(dt, dd);
      }
    }
    this.sheet.append(rows, this.sheetButtons(onConfirm));
  }

  private sheetButtons(onConfirm: (() => void) | null): HTMLElement {
    const row = document.createElement('div');
    row.className = 'buttons';
    const cancel = document.createElement('button');
    cancel.textContent = this.t('cancel', 'Cancelar');
    cancel.addEventListener('click', () => (this.sheet.hidden = true));
    row.append(cancel);
    if (onConfirm) {
      const ok = document.createElement('button');
      ok.className = 'confirm';
      ok.textContent = this.t('confirm', 'Confirmar');
      ok.addEventListener('click', () => {
        this.sheet.hidden = true;
        onConfirm();
      });
      row.append(ok);
    }
    return row;
  }

  // --- Roll log ------------------------------------------------------------------

  logEvents(events: GameEvent[], state: GameState): void {
    const name = (id: unknown) => (typeof id === 'string' ? (state.entities[id]?.name ?? id) : '');
    for (const ev of events) {
      const e = ev as GameEvent & Record<string, unknown>;
      switch (ev.type) {
        case 'attackRolled':
          this.push(`${name(e.attackerId)} → ${name(e.targetId)}: ${formatRoll(e.roll as CheckResult)} ${e.crit ? '¡CRÍTICO!' : e.hit ? 'acierta' : 'falla'}`);
          break;
        case 'saveRolled':
          this.push(`${name(e.entityId)}: ${formatRoll(e.roll as CheckResult)} ${(e.roll as CheckResult).success ? 'supera' : 'falla'}`);
          break;
        case 'damageDealt':
          this.push(`${name(e.targetId)} recibe ${e.amount} de daño.`);
          break;
        case 'healed':
          if (Number(e.amount) > 0) this.push(`${name(e.targetId)} recupera ${e.amount} PG.`);
          break;
        case 'downed':
          this.push(`${name(e.entityId)} cae y se desangra.`);
          break;
        case 'died':
          this.push(`${name(e.entityId)} muere.`);
          break;
        case 'reactionUsed':
          this.push(`${name(e.entityId)}: ${String(e.detail)}.`);
          break;
        case 'combatStarted':
          this.lines = [];
          break;
      }
    }
    this.logEl.replaceChildren(
      ...this.lines.slice(-4).map((l) => {
        const p = document.createElement('p');
        p.textContent = l;
        return p;
      }),
    );
  }

  private push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > 50) this.lines.shift();
  }
}

/** "[Espada larga] d20 (14) +3 +2 = 19 vs CA 12" */
export function formatRoll(r: CheckResult): string {
  const dice = r.dice.map((d) => `d${d.sides} (${d.rolls.join('·')})${d.note ? ` ${d.note}` : ''}`).join(' ');
  const mods = r.modifiers.map((m) => `${m.value >= 0 ? '+' : ''}${m.value}`).join(' ');
  return `[${r.label}] ${dice} ${mods} = ${r.total} vs ${r.targetLabel} ${r.target}`;
}
