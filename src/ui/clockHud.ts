import type { GameStore } from '../game/store';

/**
 * A countdown on screen when the game keeps one in `state.systems.clock`
 * ({ label, remaining, total } in seconds, `hidden` to keep it off screen; a game's ruleset or
 * content owns the rest of it).
 * Generic: no clock system, no timer. Amber under 25 %, red under 10 %, flashing at zero.
 */
export function setupClockHud(store: GameStore): void {
  const box = document.createElement('div');
  box.id = 'clock-hud';
  box.hidden = true;
  document.body.append(box);
  const render = () => {
    const c = store.state.systems.clock as { label?: string; remaining?: number; total?: number; hidden?: boolean } | null | undefined;
    if (!c || c.hidden || typeof c.remaining !== 'number' || !c.total) {
      box.hidden = true;
      return;
    }
    const t = Math.max(0, Math.ceil(c.remaining));
    const pct = c.remaining / c.total;
    box.hidden = false;
    box.textContent = `${c.label ?? ''} ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`.trim();
    box.classList.toggle('low', pct <= 0.25 && pct > 0.1);
    box.classList.toggle('critical', pct <= 0.1 && c.remaining > 0);
    box.classList.toggle('expired', c.remaining <= 0);
  };
  store.subscribe(render);
  render();
}
