import type { GameDefinition, HudExtension, PanelSection, ToastView } from '../game/definition';
import type { GameStore } from '../game/store';

/**
 * Generic renderer for a game's HudExtension: counters under the top bar (right side, so the
 * party portraits keep the left), message bubbles that never pause the game, and one panel with
 * sections and buttons that dispatch commands. Everything game-specific comes as plain views.
 */
export function setupShowHud(store: GameStore, game: GameDefinition, onError: (code: string) => void): void {
  const ext = game.hud;
  if (!ext) return;

  const meters = document.createElement('div');
  meters.id = 'meters';
  document.body.append(meters);

  const bubbles = document.createElement('div');
  bubbles.id = 'bubbles';
  bubbles.setAttribute('aria-live', 'polite');
  document.body.append(bubbles);

  const panel = ext.panel ? mountPanel(store, game, ext.panel, onError) : undefined;

  const previous = new Map<string, string>();
  const renderMeters = () => {
    const views = ext.meters?.(store.state) ?? [];
    meters.replaceChildren(
      ...views.map((m) => {
        const el = document.createElement(m.opensPanel && panel ? 'button' : 'div');
        el.className = 'meter';
        el.dataset.id = m.id;
        if (m.color) el.style.setProperty('--meter', m.color);
        if (m.title) {
          el.title = m.title;
          el.setAttribute('aria-label', m.title);
        }
        const before = previous.get(m.id);
        if (before !== undefined && before !== m.value) el.classList.add('changed');
        previous.set(m.id, m.value);
        el.innerHTML = `<span class="icon">${m.icon}</span><span class="text"><b></b>${m.label ? '<small></small>' : ''}</span>${m.fill !== undefined ? '<i class="bar"><i></i></i>' : ''}${m.opensPanel && ext.panel?.badge ? '<em class="badge" hidden></em>' : ''}`;
        el.querySelector('b')!.textContent = m.value;
        if (m.label) el.querySelector('small')!.textContent = m.label;
        if (m.fill !== undefined) (el.querySelector('.bar > i') as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, m.fill)) * 100)}%`;
        const badge = el.querySelector<HTMLElement>('.badge');
        const n = ext.panel?.badge?.(store.state) ?? 0;
        if (badge && n > 0) {
          badge.hidden = false;
          badge.textContent = String(n);
        }
        if (el instanceof HTMLButtonElement) el.addEventListener('click', () => panel!.open());
        return el;
      }),
    );
  };

  const showBubble = (t: ToastView) => {
    const el = document.createElement('div');
    el.className = 'bubble';
    if (t.color) el.style.setProperty('--bubble', t.color);
    el.innerHTML = `<span class="badge"></span><div><b></b><p></p></div>`;
    el.querySelector('.badge')!.textContent = t.badge ?? '★';
    el.querySelector('b')!.textContent = t.title;
    el.querySelector('p')!.textContent = t.text;
    el.addEventListener('click', () => el.remove());
    bubbles.append(el);
    // At most three on screen; each goes by itself.
    while (bubbles.children.length > 3) bubbles.firstElementChild!.remove();
    window.setTimeout(() => el.remove(), 4500 + t.text.length * 45);
  };

  store.subscribe((change, state) => {
    renderMeters();
    panel?.refresh();
    if (change.kind !== 'events' || !ext.toast) return;
    for (const e of change.events) {
      const t = ext.toast(e, state);
      if (t) showBubble(t);
    }
  });
  renderMeters();
}

function mountPanel(store: GameStore, game: GameDefinition, spec: NonNullable<HudExtension['panel']>, onError: (code: string) => void) {
  const root = document.createElement('div');
  root.id = 'show-panel';
  root.hidden = true;
  root.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><header><h2></h2><button class="close" aria-label="Cerrar">✕</button></header><div class="body"></div></div>`;
  root.querySelector('h2')!.textContent = `${spec.icon} ${spec.title}`;
  document.body.append(root);
  const body = root.querySelector<HTMLElement>('.body')!;
  const close = () => (root.hidden = true);
  root.querySelector('.close')!.addEventListener('click', close);
  root.addEventListener('click', (ev) => {
    if (ev.target === root) close();
  });

  const section = (s: PanelSection) => {
    const el = document.createElement('section');
    if (s.color) el.style.setProperty('--section', s.color);
    el.innerHTML = `<header>${s.badge ? '<span class="badge"></span>' : ''}<div><h3></h3>${s.subtitle ? '<small></small>' : ''}</div></header>`;
    if (s.badge) el.querySelector('.badge')!.textContent = s.badge;
    el.querySelector('h3')!.textContent = s.title;
    if (s.subtitle) el.querySelector('small')!.textContent = s.subtitle;
    if (s.bar) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.innerHTML = '<i></i><span></span>';
      (bar.firstElementChild as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, s.bar.fill)) * 100)}%`;
      if (s.bar.color) bar.style.setProperty('--section', s.bar.color);
      bar.querySelector('span')!.textContent = s.bar.label;
      el.append(bar);
    }
    for (const line of s.lines ?? []) {
      const p = document.createElement('p');
      p.textContent = line;
      el.append(p);
    }
    if (s.actions?.length) {
      const row = document.createElement('div');
      row.className = 'actions';
      for (const a of s.actions) {
        const b = document.createElement('button');
        b.textContent = a.label;
        if (a.primary) b.classList.add('primary');
        b.addEventListener('click', () => {
          const r = store.dispatch(a.command);
          if (!r.ok) onError(r.error.code);
        });
        row.append(b);
      }
      el.append(row);
    }
    return el;
  };

  const refresh = () => {
    if (root.hidden) return;
    const top = body.scrollTop;
    body.replaceChildren(...spec.sections(store.state, game.playerId).map(section));
    body.scrollTop = top;
  };
  return {
    open: () => {
      root.hidden = false;
      refresh();
    },
    refresh,
  };
}
