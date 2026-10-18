import { type GameState, type Ruleset, inventoriesOf, nextLevel, progressOf } from '../../engine';
import type { AssetManifest } from '../assets/manifest';
import type { GameDefinition } from '../game/definition';
import { portrait } from './portraits';

/**
 * Character sheet overlay: whatever the ruleset's describeEntity returns, laid out as
 * sections of label/value rows and explained items. Glossary terms get a "?" button.
 */
export class CharacterSheet {
  private root = document.querySelector<HTMLElement>('#sheet')!;
  private openId: string | null = null;
  /** Tapping "Cambiar" on an equipped item (weapon/armour/ring/cloak): re-run the give-it-to-someone flow. */
  onChangeGear: ((item: string) => void) | null = null;

  constructor(
    private game: GameDefinition,
    private ruleset: Ruleset,
    private manifest: AssetManifest,
  ) {
    // Tapping the dark backdrop closes the sheet.
    this.root.addEventListener('click', (ev) => {
      if (ev.target === this.root) this.close();
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') this.close();
    });
  }

  get isOpen(): boolean {
    return this.openId !== null;
  }

  close(): void {
    this.openId = null;
    this.root.hidden = true;
  }

  /** Re-render if open (hit points and conditions change during combat). */
  refresh(state: GameState): void {
    if (this.openId) {
      if (state.entities[this.openId]) this.open(state, this.openId);
      else this.close();
    }
  }

  open(state: GameState, id: string): void {
    const e = state.entities[id];
    if (!e) return;
    const scrollTop = this.openId === id ? (this.root.querySelector('.body')?.scrollTop ?? 0) : 0;
    this.openId = id;
    const sheet = this.ruleset.describeEntity?.(state, id) ?? { sections: [] };
    // The party's shared points: «PX 450 / 900» (current / next level), on every member's sheet.
    const progression = this.ruleset.progression;
    const content = this.game.levels?.progression;
    const level = progression?.levelOf(e);
    if (progression && content && level != null && e.controllerId === this.game.playerId) {
      const next = nextLevel(content, level);
      const points = progressOf(state);
      const row = { label: progression.label, value: next ? `${points} / ${next.points}` : `${points} (${this.game.texts.combat?.maxLevel ?? 'nivel máximo'})`, term: 'xp' };
      const first = sheet.sections[0];
      if (first) sheet.sections = [{ ...first, rows: [...(first.rows ?? []), row] }, ...sheet.sections.slice(1)];
      else sheet.sections = [{ title: progression.label, rows: [row] }];
    }
    // The party's shared bag (and the character's own), shown on any party member's sheet.
    if (e.controllerId === this.game.playerId) {
      const bags = inventoriesOf(state);
      const entries = [...Object.entries(bags.party ?? {}), ...Object.entries(bags[id] ?? {})];
      sheet.sections = [
        ...sheet.sections,
        {
          title: this.game.texts.combat?.inventory ?? 'Mochila del grupo',
          items: entries.length
            ? entries.map(([item, n]) => {
                const def = this.game.items?.[item];
                return { label: `${def?.label ?? item}${n > 1 ? ` ×${n}` : ''}`, ...(def?.text ? { text: def.text } : {}) };
              })
            : [{ label: this.game.texts.combat?.emptyBag ?? 'Nada. Ni una corona.' }],
        },
      ];
    }
    const glossary = this.ruleset.glossary;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', e.name);

    const head = document.createElement('header');
    head.append(portrait(this.manifest, e.spriteId, 96));
    const titles = document.createElement('div');
    const name = document.createElement('h2');
    name.textContent = e.name;
    titles.append(name);
    if (sheet.subtitle) {
      const sub = document.createElement('p');
      sub.className = 'subtitle';
      sub.textContent = sheet.subtitle;
      titles.append(sub);
    }
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.setAttribute('aria-label', this.game.texts.combat?.close ?? 'Cerrar');
    close.addEventListener('click', () => this.close());
    head.append(titles, close);

    const body = document.createElement('div');
    body.className = 'body';
    for (const section of sheet.sections) {
      const sec = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = section.title;
      sec.append(h);
      if (section.rows?.length) {
        const dl = document.createElement('dl');
        for (const row of section.rows) {
          const dt = document.createElement('dt');
          dt.textContent = row.label;
          const dd = document.createElement('dd');
          dd.textContent = row.value ?? '';
          dl.append(dt, dd);
          if (row.term && glossary[row.term]) dl.append(this.help(dt, `${glossary[row.term]!.label}: ${glossary[row.term]!.text}`));
        }
        sec.append(dl);
      }
      for (const item of section.items ?? []) {
        const div = document.createElement('div');
        div.className = 'item';
        const label = document.createElement('strong');
        label.textContent = item.label;
        div.append(label);
        if (item.text) {
          const p = document.createElement('p');
          p.textContent = item.text;
          div.append(p);
        }
        sec.append(div);
      }
      body.append(sec);
    }
    // Equipped gear (weapon/armour/ring/cloak): shown separately from the shared bag, each
    // with a "Cambiar" button that reopens the give-it-to-someone flow (src/main.ts).
    if (e.controllerId === this.game.playerId && this.ruleset.equippedItems) {
      const equipped = this.ruleset.equippedItems(e);
      const sec = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = this.game.texts.combat?.equipment ?? 'Equipo';
      sec.append(h);
      if (equipped.length) {
        for (const itemId of equipped) {
          const def = this.game.items?.[itemId];
          const div = document.createElement('div');
          div.className = 'item';
          const label = document.createElement('strong');
          label.textContent = def?.label ?? itemId;
          div.append(label);
          if (def?.text) {
            const p = document.createElement('p');
            p.textContent = def.text;
            div.append(p);
          }
          if (this.onChangeGear) {
            const btn = document.createElement('button');
            btn.textContent = this.game.texts.combat?.changeGear ?? 'Cambiar';
            btn.addEventListener('click', () => this.onChangeGear!(itemId));
            div.append(btn);
          }
          sec.append(div);
        }
      } else {
        const p = document.createElement('p');
        p.textContent = this.game.texts.combat?.noGear ?? 'Nada equipado.';
        sec.append(p);
      }
      body.append(sec);
    }
    panel.append(head, body);
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    body.scrollTop = scrollTop;
  }

  /** A "?" after the label that toggles a plain-language explanation below the row. */
  private help(dt: HTMLElement, text: string): HTMLElement {
    const explain = document.createElement('div');
    explain.className = 'explain';
    explain.hidden = true;
    explain.textContent = text;
    const button = document.createElement('button');
    button.className = 'help';
    button.textContent = '?';
    button.addEventListener('click', () => (explain.hidden = !explain.hidden));
    dt.append(' ', button);
    return explain;
  }
}

/** Portraits of the player's party, always on screen; tap one to open its sheet. */
export class PartyBar {
  private root = document.querySelector<HTMLElement>('#party')!;
  /** One persistent button per member, so portraits are drawn once. */
  private members = new Map<string, { button: HTMLButtonElement; hp: HTMLElement }>();

  constructor(
    private game: GameDefinition,
    private ruleset: Ruleset,
    private manifest: AssetManifest,
    private onPick: (id: string) => void,
  ) {}

  render(state: GameState, activeId: string | null): void {
    const health = Object.entries(this.ruleset.resources).find(([, r]) => r.role === 'health')?.[0] ?? 'hp';
    const party = Object.values(state.entities)
      .filter((e) => e.controllerId === this.game.playerId && !e.tags.includes('object'))
      .sort((a, b) => Number(b.id === this.game.leaderId) - Number(a.id === this.game.leaderId));
    for (const id of this.members.keys()) if (!party.some((e) => e.id === id)) this.members.delete(id);
    this.root.replaceChildren(
      ...party.map((e) => {
        let m = this.members.get(e.id);
        if (!m) {
          const button = document.createElement('button');
          button.className = 'member';
          button.title = e.name;
          button.setAttribute('aria-label', e.name);
          const hp = document.createElement('i');
          const bar = document.createElement('span');
          bar.className = 'hp';
          bar.append(hp);
          button.append(portrait(this.manifest, e.spriteId, 48), bar);
          button.addEventListener('click', () => this.onPick(e.id));
          m = { button, hp };
          this.members.set(e.id, m);
        }
        const hp = e.resources[health];
        m.hp.style.width = `${hp ? Math.round((100 * hp.current) / Math.max(1, hp.max)) : 0}%`;
        m.button.classList.toggle('active', e.id === activeId);
        m.button.classList.toggle('down', !this.ruleset.isStanding(e));
        return m.button;
      }),
    );
  }
}
