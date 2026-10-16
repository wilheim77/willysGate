import type { Theme } from '../game/definition';

/** Applies a game's theme to the HUD via CSS custom properties. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(theme.colors)) root.setProperty(`--${name}`, value);
  root.setProperty('--font', theme.fontFamily);
  if (theme.fontUrl) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = theme.fontUrl;
    document.head.append(link);
  }
}
