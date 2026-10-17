import { type CheckResult, type DialogueCheckEvent, type GameEvent, type GameState, dialogueChoices, dialogueOf, isEvent, resolveNext } from '../../engine';
import type { AssetManifest } from '../assets/manifest';
import type { GameDefinition } from '../game/definition';
import type { GameStore } from '../game/store';
import { formatRoll } from './combatHud';
import { portrait } from './portraits';

/**
 * The conversation panel: who speaks, what they say, and the choices. Checks are shown
 * before choosing ("[Persuasión] CD 14 · 65 %") and the roll is shown after, dice and
 * all, so the player always sees why things went the way they did.
 */
export class DialogueBox {
  private root = document.querySelector<HTMLElement>('#dialogue')!;
  /** The last roll, shown above the next line until the conversation moves on again. */
  private lastRoll: { actor: string; result: CheckResult } | null = null;
  /** A client-side question (disarm this trap? who?) shown in the same panel. */
  private autoTimer = 0;
  private question: { text: string; options: { label: string; onPick: () => void }[]; closeLabel?: string } | null = null;

  constructor(
    private store: GameStore,
    private game: GameDefinition,
    private manifest: AssetManifest,
  ) {}

  private t(key: string, fallback: string): string {
    return this.game.texts.combat?.[key] ?? fallback;
  }

  onEvents(events: GameEvent[], state: GameState): void {
    for (const e of events) {
      if (isEvent<DialogueCheckEvent>(e, 'dialogueCheck')) this.lastRoll = { actor: state.entities[e.actorId]?.name ?? e.actorId, result: e.result };
      if (e.type === 'dialogueStarted') this.lastRoll = null;
    }
  }

  /** Asks something outside any conversation tree; a "Dejarlo" option is always added. */
  ask(text: string, options: { label: string; onPick: () => void }[], closeLabel?: string): void {
    this.question = { text, options, ...(closeLabel ? { closeLabel } : {}) };
    this.render(this.store.state);
  }

  render(state: GameState): void {
    if (this.question) {
      const q = this.question;
      const panel = document.createElement('div');
      panel.className = 'panel';
      if (this.lastRoll) panel.append(this.rollLine(this.lastRoll));
      const line = document.createElement('div');
      line.className = 'line narration';
      const p = document.createElement('p');
      p.textContent = q.text;
      line.append(p);
      const list = document.createElement('div');
      list.className = 'choices';
      const close = () => {
        this.question = null;
        this.render(this.store.state);
      };
      q.options.forEach((o, i) =>
        list.append(
          this.button(`${i + 1}. ${o.label}`, true, () => {
            close();
            o.onPick();
          }),
        ),
      );
      list.append(this.button(q.closeLabel ?? `${q.options.length + 1}. ${this.t('leaveIt', 'Dejarlo')}`, true, () => {
        this.lastRoll = null;
        close();
      }));
      panel.append(line, list);
      this.root.replaceChildren(panel);
      this.root.hidden = false;
      return;
    }
    const d = dialogueOf(state);
    const tree = d && this.game.dialogues?.[d.treeId];
    const node = tree && tree.nodes[d.nodeId];
    if (!d || !tree || !node) {
      this.root.hidden = true;
      // A saved conversation this version doesn't have: close it rather than freeze the party.
      if (d) queueMicrotask(() => this.store.dispatch({ type: 'endDialogue', issuer: this.game.playerId } as never));
      return;
    }
    const ruleset = this.store.engine.ruleset;
    const panel = document.createElement('div');
    panel.className = 'panel';

    if (this.lastRoll) panel.append(this.rollLine(this.lastRoll));

    // Someone speaking from off this map (the baron at the inn): the cast says who they are.
    const speaker = node.speaker ? (state.entities[node.speaker] ?? this.game.cast?.[node.speaker]) : undefined;
    const line = document.createElement('div');
    line.className = speaker ? 'line' : 'line narration';
    if (speaker) {
      line.append(portrait(this.manifest, speaker.spriteId, 48));
      const who = document.createElement('strong');
      who.textContent = speaker.name;
      line.append(who);
    }
    const text = document.createElement('p');
    text.textContent = node.text;
    line.append(text);
    panel.append(line);

    const list = document.createElement('div');
    list.className = 'choices';
    const choices = dialogueChoices(ruleset, state, tree);
    clearTimeout(this.autoTimer);
    if (!node.choices || node.choices.length === 0) {
      const goesOn = resolveNext(ruleset, state, d.actorId, node.next) !== undefined;
      list.append(this.button(goesOn ? this.t('continue', 'Continuar') : this.t('endDialogue', 'Terminar'), true, () => this.choose(0)));
      // Cinematic trees read themselves: time to read the line, then on (a tap still skips ahead).
      if (tree.cinematic && goesOn) this.autoTimer = window.setTimeout(() => this.choose(0), 2200 + node.text.length * 45);
    }
    choices.forEach((c, i) => {
      let label = `${i + 1}. ${c.text}`;
      if (c.check) {
        const odds = ruleset.describeCheck?.(state, { actorId: c.check.actorId, check: c.check.check, target: c.check.dc });
        const name = odds?.label ?? c.check.check;
        label = `${i + 1}. [${name}] ${this.t('dcShort', 'CD')} ${c.check.dc}${odds ? ` · ${Math.round(odds.chance * 100)} %` : ''} — ${c.text}`;
      }
      if (!c.available) label = `${i + 1}. ${c.lockedHint} ${c.text}`;
      list.append(this.button(label, c.available, () => this.choose(c.index), c.check ? 'check' : ''));
    });
    panel.append(list);
    this.root.replaceChildren(panel);
    this.root.hidden = false;
  }

  private rollLine(last: { actor: string; result: CheckResult }): HTMLElement {
    const roll = document.createElement('div');
    const r = last.result;
    roll.className = `roll ${r.success ? 'success' : 'failure'}`;
    const die = document.createElement('span');
    die.className = 'die';
    die.textContent = String(r.dice[0]?.kept[0] ?? r.dice[0]?.rolls[0] ?? '');
    const text = document.createElement('span');
    text.textContent = `${last.actor}: ${formatRoll(r)} · ${r.success ? this.t('checkSuccess', 'Éxito') : this.t('checkFailure', 'Fallo')}`;
    roll.append(die, text);
    return roll;
  }

  /** Shows a roll that happened outside a conversation (disarming a trap) until dismissed. */
  showRoll(actor: string, result: CheckResult, text: string): void {
    this.lastRoll = { actor, result };
    this.ask(text, [], this.t('ok', 'Vale'));
  }

  private button(label: string, enabled: boolean, onClick: () => void, extra = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = !enabled;
    if (extra) b.classList.add(extra);
    b.addEventListener('click', onClick);
    return b;
  }

  private choose(index: number): void {
    const r = this.store.dispatch({ type: 'chooseOption', issuer: this.game.playerId, index } as never);
    if (!r.ok) console.warn('dialogue:', r.error);
  }
}
