import creditsSource from '../../CREDITS.md?raw';
import type { GameDefinition } from '../game/definition';
import { renderMarkdown } from './markdown';

/**
 * "Créditos" overlay, opened from the title screen: the full content of the repo's
 * CREDITS.md (SRD 5.1 CC-BY attribution, art and audio licences), rendered readable on a
 * phone as a scrollable panel. One shared file covers both games — showing the whole
 * thing is simpler than splitting it per game and never under-attributes either one.
 */
export class CreditsScreen {
  private root = document.querySelector<HTMLElement>('#credits')!;
  private rendered = false;

  constructor(private game: GameDefinition) {
    this.root.addEventListener('click', (ev) => {
      if (ev.target === this.root) this.close();
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !this.root.hidden) this.close();
    });
  }

  open(): void {
    if (!this.rendered) {
      this.render();
      this.rendered = true;
    }
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    // 'credits' is title-screen-only, like 'newGameButton'/'continue' in titleScreen.ts:
    // not part of UiTexts.ui's strict key union, so read it through a loose cast.
    const title = (this.game.texts.ui as Record<string, string>).credits ?? 'Créditos';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);

    const head = document.createElement('header');
    const h2 = document.createElement('h2');
    h2.textContent = title;
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '✕';
    close.setAttribute('aria-label', this.game.texts.combat?.close ?? 'Cerrar');
    close.addEventListener('click', () => this.close());
    head.append(h2, close);

    const body = document.createElement('div');
    body.className = 'body';
    body.append(renderMarkdown(creditsSource));

    panel.append(head, body);
    this.root.replaceChildren(panel);
  }
}
