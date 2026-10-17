import { SaveError, type Vec2, surfaceAt, tileAt } from '../../engine';
import type { GameDefinition } from '../game/definition';
import { SaveSlots } from '../game/saves';
import type { GameStore } from '../game/store';

const ACTIONS = ['save', 'load', 'export', 'import', 'new'] as const;

/** DOM overlay: save/load buttons and status line. Talks to the game only through the store. */
export class Hud {
  private message = document.querySelector<HTMLElement>('#message')!;
  private tileInfo = document.querySelector<HTMLElement>('#tile-info')!;
  private fileInput = document.querySelector<HTMLInputElement>('#import-file')!;
  private slots: SaveSlots;
  private messageTimer = 0;
  /** Called after "Nueva": the client opens character creation. */
  onNewGame: () => void = () => undefined;
  /** Starting-map override for new games (?mapa=). */
  startOptions: { start?: string } | undefined;

  constructor(
    private store: GameStore,
    private game: GameDefinition,
  ) {
    this.slots = new SaveSlots(store.engine);
    document.querySelector('.title')!.textContent = game.title;
    const nav = document.querySelector('.hud-top nav')!;
    for (const action of ACTIONS) {
      const button = document.createElement('button');
      button.dataset.action = action;
      button.textContent = game.texts.ui[action];
      nav.append(button);
    }
    nav.addEventListener('click', (ev) => {
      const action = (ev.target as HTMLElement).closest('button')?.dataset.action;
      if (action) void this.run(action);
    });
    this.fileInput.addEventListener('change', () => void this.importSelected());

  }

  say(text: string, isError = false): void {
    this.message.textContent = text;
    this.message.classList.toggle('error', isError);
    clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => (this.message.textContent = ''), 4000);
  }

  sayError(code: string): void {
    this.say(this.game.texts.errors[code] ?? this.game.texts.ui.genericError, true);
  }

  showTile(pos: Vec2 | null): void {
    const tile = pos && tileAt(this.store.state.map, pos);
    const { terrain, ui } = this.game.texts;
    const surface = pos ? surfaceAt(this.store.state, pos) : undefined;
    const surfaceLabel = surface ? ` · ${this.store.engine.ruleset.surfaces?.[surface.type]?.label ?? surface.type}` : '';
    this.tileInfo.textContent = pos && tile ? `(${pos.x}, ${pos.y}) · ${terrain[tile.terrain] ?? tile.terrain} · ${ui.height} ${tile.height}${surfaceLabel}` : '';
  }

  private async run(action: string): Promise<void> {
    const t = this.game.texts.ui;
    switch (action) {
      case 'save': {
        const ok = this.slots.save(this.store.state);
        this.say(ok ? t.saved : t.saveFailed, !ok);
        break;
      }
      case 'load':
        try {
          const state = this.slots.load();
          if (!state) return this.say(t.noSave, true);
          this.store.load(state);
          this.say(t.loaded);
        } catch (e) {
          this.reportError(e);
        }
        break;
      case 'export':
        this.slots.exportToFile(this.store.state);
        this.say(t.exported);
        break;
      case 'import':
        this.fileInput.click();
        break;
      case 'new':
        if (!confirm(t.confirmNew)) return;
        this.store.load(this.game.newGame(this.store.engine, randomSeed(), this.startOptions));
        this.say(t.newGame);
        this.onNewGame();
        break;
    }
  }

  private async importSelected(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file) return;
    try {
      this.store.load(await this.slots.importFromFile(file));
      this.say(this.game.texts.ui.imported);
    } catch (e) {
      this.reportError(e);
    }
  }

  private reportError(e: unknown): void {
    if (e instanceof SaveError) this.say(e.message, true);
    else throw e;
  }
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
