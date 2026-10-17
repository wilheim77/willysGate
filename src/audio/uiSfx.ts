import type { AudioManager } from './AudioManager';

/**
 * Click sounds for plain DOM interactions that aren't engine events (dialogue choices
 * *are* engine events — `dialogueChoice` — and are wired through the manifest instead;
 * see content/<game>/assets/audio.json). One delegated listener on `document`, so no
 * `src/ui/*` file needs to know audio exists.
 */
const RULES: { selector: string; sfx: string }[] = [
  { selector: '#party button.member', sfx: 'uiClick' }, // opens the character sheet
  { selector: '#sheet .close', sfx: 'uiCancel' }, // closes it
  { selector: '#creation button', sfx: 'uiClick' },
];

export function attachUiSfx(manager: AudioManager): void {
  document.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    for (const rule of RULES) {
      const el = target.closest<HTMLButtonElement>(rule.selector);
      if (el && !el.disabled) {
        manager.playSfx(rule.sfx);
        return;
      }
    }
  });
}
