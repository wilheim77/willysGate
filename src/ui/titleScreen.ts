import { assetUrl } from '../assets/manifest';
import type { GameDefinition } from '../game/definition';
import { SaveSlots } from '../game/saves';
import type { GameStore } from '../game/store';
import { CreditsScreen } from './creditsScreen';

/**
 * The first thing on screen: the game's key art, "Nueva partida" and, if there is a save,
 * "Continuar". New games go on to character creation.
 */
export class TitleScreen {
  private root = document.querySelector<HTMLElement>('#title')!;
  private credits: CreditsScreen;

  constructor(
    private store: GameStore,
    private game: GameDefinition,
    private onNewGame: () => void,
    /** Replays the game's intro cinematic, if it has one (adds a «Ver el prólogo» button). */
    private onWatchIntro?: () => void,
  ) {
    this.credits = new CreditsScreen(game);
  }

  open(): void {
    const t = this.game.texts.ui as Record<string, string>;
    const slots = new SaveSlots(this.store.engine);
    let saved = null;
    try {
      saved = slots.load();
    } catch {
      saved = null;
    }
    const panel = document.createElement('div');
    panel.className = 'panel';
    if (this.game.titleImage) {
      const img = document.createElement('img');
      img.src = assetUrl(this.game.titleImage);
      img.alt = this.game.title;
      panel.append(img);
    } else {
      const h = document.createElement('h1');
      h.textContent = this.game.title;
      panel.append(h);
    }
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    if (saved) {
      const cont = document.createElement('button');
      cont.textContent = t.continue ?? 'Continuar';
      cont.className = 'confirm';
      cont.addEventListener('click', () => {
        this.store.load(saved!);
        this.close();
      });
      buttons.append(cont);
    }
    const fresh = document.createElement('button');
    fresh.textContent = t.newGameButton ?? 'Nueva partida';
    if (!saved) fresh.className = 'confirm';
    fresh.addEventListener('click', () => {
      this.close();
      this.onNewGame();
    });
    buttons.append(fresh);
    if (this.onWatchIntro) {
      const intro = document.createElement('button');
      intro.textContent = t.watchIntro ?? 'Ver el prólogo';
      intro.addEventListener('click', () => this.onWatchIntro!());
      buttons.append(intro);
    }
    const credits = document.createElement('button');
    credits.textContent = t.credits ?? 'Créditos';
    credits.addEventListener('click', () => this.credits.open());
    buttons.append(credits);
    panel.append(buttons);
    this.root.replaceChildren(panel);
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }
}
