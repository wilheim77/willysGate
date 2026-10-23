import type { GameDefinition } from '../game/definition';
import { ProfileStore } from '../game/profile';
import type { GameStore } from '../game/store';

/**
 * The browser's profile in the client (GameDefinition.profile): it is updated after every
 * command, handed to each new season, marked on the title screen («🔴 EN DIRECTO») and shown
 * on «Perfil / Récords», reachable from the title and the top bar.
 */
export function setupProfile(store: GameStore, game: GameDefinition): { inject(): void } | null {
  const def = game.profile;
  if (!def) return null;
  const profiles = new ProfileStore(store.engine);
  const today = () => new Date().toISOString().slice(0, 10);

  store.subscribe((change, state) => {
    if (change.kind !== 'events') return;
    const before = profiles.read();
    const after = def.update(before, change.events, state, today());
    if (JSON.stringify({ ...before, ...after }) !== JSON.stringify(before)) profiles.write(after);
  });

  // --- The screen ---
  const panel = document.createElement('div');
  panel.className = 'meta-panel profile-panel';
  panel.hidden = true;
  document.body.append(panel);
  const close = () => (panel.hidden = true);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  const open = () => {
    const view = def.screen(profiles.read());
    const box = document.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'dialog');
    const head = document.createElement('header');
    const h = document.createElement('h2');
    h.textContent = view.title;
    const x = document.createElement('button');
    x.className = 'close';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Cerrar');
    x.addEventListener('click', close);
    head.append(h, x);
    const body = document.createElement('div');
    body.className = 'body';
    for (const s of view.sections) {
      const sec = document.createElement('section');
      const t = document.createElement('h3');
      t.textContent = s.title;
      const dl = document.createElement('dl');
      for (const r of s.rows) {
        const dt = document.createElement('dt');
        dt.textContent = r.label;
        const dd = document.createElement('dd');
        dd.textContent = r.value;
        dl.append(dt, dd);
      }
      sec.append(t, dl);
      body.append(sec);
    }
    box.append(head, body);
    panel.replaceChildren(box);
    panel.hidden = false;
  };

  // --- On the title screen: the mark, and the way in ---
  const title = document.querySelector('#title .panel');
  const buttons = document.querySelector('#title .buttons');
  const badge = def.badge?.(profiles.read());
  if (title && badge) {
    const mark = document.createElement('p');
    mark.className = 'profile-badge';
    mark.textContent = badge;
    title.insertBefore(mark, buttons);
  }
  if (buttons) {
    const b = document.createElement('button');
    b.textContent = 'Perfil / Récords';
    b.addEventListener('click', open);
    buttons.append(b);
  }
  // And from the top bar, during a season.
  const top = document.createElement('button');
  top.textContent = '📊';
  top.title = 'Perfil y récords';
  top.setAttribute('aria-label', top.title);
  top.addEventListener('click', open);
  document.querySelector('.hud-top nav')?.prepend(top);

  return { inject: () => store.load(def.inject(store.state, profiles.read())) };
}
