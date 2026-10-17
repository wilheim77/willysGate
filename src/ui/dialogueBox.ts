import { type CheckResult, type DialogueCheckEvent, type GameEvent, type GameState, dialogueChoices, dialogueOf, isEvent } from '../../engine';
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

  render(state: GameState): void {
    const d = dialogueOf(state);
    const tree = d && this.game.dialogues?.[d.treeId];
    const node = tree && tree.nodes[d.nodeId];
    if (!d || !tree || !node) {
      this.root.hidden = true;
      this.lastRoll = null;
      return;
    }
    const ruleset = this.store.engine.ruleset;
    const panel = document.createElement('div');
    panel.className = 'panel';

    if (this.lastRoll) {
      const roll = document.createElement('div');
      const r = this.lastRoll.result;
      roll.className = `roll ${r.success ? 'success' : 'failure'}`;
      const die = document.createElement('span');
      die.className = 'die';
      die.textContent = String(r.dice[0]?.kept[0] ?? r.dice[0]?.rolls[0] ?? '');
      const text = document.createElement('span');
      text.textContent = `${this.lastRoll.actor}: ${formatRoll(r)} · ${r.success ? this.t('checkSuccess', 'Éxito') : this.t('checkFailure', 'Fallo')}`;
      roll.append(die, text);
      panel.append(roll);
    }

    const speaker = node.speaker ? state.entities[node.speaker] : undefined;
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
    if (!node.choices || node.choices.length === 0) {
      list.append(this.button(node.next ? this.t('continue', 'Continuar') : this.t('endDialogue', 'Terminar'), true, () => this.choose(0)));
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
