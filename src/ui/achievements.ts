import type { AssetManifest } from '../assets/manifest';
import type { AchievementView, GameDefinition } from '../game/definition';
import type { GameStore } from '../game/store';
import { uiIcon } from './portraits';

/**
 * Achievements in the client (GameDefinition.achievements): a banner when one unlocks, one at a
 * time (tap to dismiss), and a 🏆 list in the top bar grouped by category, with hidden ones as
 * «???» and their hint. The rules live in the ruleset; this only shows them.
 */
export function setupAchievements(store: GameStore, game: GameDefinition, manifest: AssetManifest): void {
  if (!game.achievements) return;
  const meta = game.achievements;

  // --- The banner ---
  //
  // Pacing (user feedback: too many in a row): one banner at a time, never over a fight, a
  // conversation, the box screen or another banner. Unlocks wait while something is on, are
  // gathered for a moment, and several together become one summary banner («🏆 3 logros
  // nuevos: …», tap to open the list). After a banner, the next waits a while, so a burst of
  // unlocks becomes one summary instead of a string of banners. Silent achievements (the
  // trivial ones) never get a banner: they only count in the list.
  const GATHER_MS = 1500;
  const GAP_MS = 10_000;
  const banner = document.createElement('div');
  banner.className = 'achievement-toast';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  document.body.append(banner);
  const pending: AchievementView[] = [];
  let timer = 0;
  let flushTimer = 0;
  let lastClosedAt = -Infinity;
  let opensList = false;

  const busy = () =>
    !banner.hidden ||
    store.state.turn.mode === 'combat' ||
    document.querySelector<HTMLElement>('#dialogue')?.hidden === false ||
    document.querySelector<HTMLElement>('.box-overlay')?.hidden === false ||
    document.querySelector<HTMLElement>('#title')?.hidden === false ||
    document.querySelector<HTMLElement>('#creation')?.hidden === false;

  const hide = () => {
    clearTimeout(timer);
    banner.hidden = true;
    document.body.classList.remove('has-achievement');
    lastClosedAt = performance.now();
    if (pending.length) schedule(GAP_MS);
  };

  const schedule = (ms: number) => {
    clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flush, ms);
  };

  const flush = () => {
    if (!pending.length) return;
    const wait = GAP_MS - (performance.now() - lastClosedAt);
    if (busy() || wait > 0) return schedule(Math.max(1000, wait));
    const shown = pending.splice(0);
    const text = document.createElement('div');
    text.className = 'text';
    const kicker = document.createElement('span');
    kicker.className = 'kicker';
    const name = document.createElement('strong');
    const desc = document.createElement('p');
    let icon = shown[0]!.icon ?? '';
    let ms = 4000;
    if (shown.length === 1) {
      const a = shown[0]!;
      kicker.textContent = a.again ? '¡Otra vez! (sin caja: ya la ganaste)' : '¡Logro desbloqueado!';
      name.textContent = a.name;
      desc.textContent = a.description;
      text.append(kicker, name, desc);
      if (a.line) {
        const said = document.createElement('p');
        said.className = 'said';
        said.textContent = `🎙 ${a.line}`;
        text.append(said);
        ms += a.line.length * 45;
      }
      if (a.reward) {
        const reward = document.createElement('p');
        reward.className = 'reward';
        reward.textContent = `🎁 ${a.reward}`;
        text.append(reward);
      }
      opensList = false;
    } else {
      kicker.textContent = 'Toca para ver la lista';
      name.textContent = `🏆 ${shown.length} logros nuevos`;
      const names = shown.slice(0, 4).map((a) => a.name);
      desc.textContent = `${names.join(', ')}${shown.length > 4 ? ` y ${shown.length - 4} más` : ''}.`;
      text.append(name, desc, kicker);
      const boxes = shown.filter((a) => a.reward).length;
      if (boxes) {
        const reward = document.createElement('p');
        reward.className = 'reward';
        reward.textContent = `🎁 ${boxes} ${boxes === 1 ? 'caja' : 'cajas'}`;
        text.append(reward);
      }
      icon = 'logro-cat-primeros-pasos';
      opensList = true;
    }
    banner.replaceChildren(uiIcon(manifest, icon, 48), text);
    banner.hidden = false;
    document.body.classList.add('has-achievement');
    banner.classList.remove('pop');
    void banner.offsetWidth;
    banner.classList.add('pop');
    clearTimeout(timer);
    timer = window.setTimeout(hide, ms);
  };

  banner.addEventListener('click', () => {
    const list = opensList;
    hide();
    if (list) openList();
  });
  store.subscribe((change) => {
    if (change.kind === 'reset') {
      pending.length = 0;
      hide();
      refreshCount();
      return;
    }
    const fresh = change.events.map((e) => meta.unlocked(e, store.state)).filter((a): a is AchievementView => !!a);
    if (fresh.length) refreshCount();
    const loud = fresh.filter((a) => !a.silent);
    if (loud.length) {
      pending.push(...loud);
      schedule(GATHER_MS);
    } else if (pending.length && change.events.some((e) => e.type === 'combatEnded')) schedule(GATHER_MS);
  });

  // --- The list ---
  const button = document.createElement('button');
  button.className = 'achievements-button';
  button.title = 'Logros';
  button.setAttribute('aria-label', 'Logros');
  document.querySelector('.hud-top nav')!.prepend(button);
  const refreshCount = () => {
    const all = meta.list(store.state);
    button.textContent = `🏆${all.filter((a) => a.unlocked).length}`;
  };
  refreshCount();

  const panel = document.createElement('div');
  panel.className = 'meta-panel';
  panel.hidden = true;
  document.body.append(panel);
  const close = () => (panel.hidden = true);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  function openList(): void {
    const all = meta.list(store.state);
    const box = document.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'dialog');
    const head = document.createElement('header');
    const h = document.createElement('h2');
    h.textContent = `Logros · ${all.filter((a) => a.unlocked).length}/${all.length}`;
    const x = document.createElement('button');
    x.className = 'close';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Cerrar');
    x.addEventListener('click', close);
    head.append(h, x);
    const body = document.createElement('div');
    body.className = 'body';
    const cats = Object.keys(meta.categories);
    // Unlocked first within each category, so progress reads at a glance.
    for (const cat of cats) {
      const items = all.filter((a) => a.category === cat).sort((a, b) => Number(b.unlocked) - Number(a.unlocked));
      if (!items.length) continue;
      const sec = document.createElement('section');
      const t = document.createElement('h3');
      t.textContent = `${meta.categories[cat]} · ${items.filter((a) => a.unlocked).length}/${items.length}`;
      sec.append(t);
      for (const a of items) {
        const row = document.createElement('div');
        row.className = `achievement${a.unlocked ? ' got' : ''}${a.earlier ? ' earlier' : ''}`;
        const secret = a.hidden && !a.unlocked;
        const icon = uiIcon(manifest, a.unlocked ? (a.icon ?? '') : 'logro-bloqueado', 32);
        const txt = document.createElement('div');
        const n = document.createElement('strong');
        n.textContent = secret ? '???' : a.name;
        const d = document.createElement('p');
        d.textContent = secret ? (a.hint ?? 'Logro oculto.') : a.description;
        txt.append(n, d);
        if (a.earlier) {
          const e = document.createElement('p');
          e.className = 'earlier-note';
          e.textContent = 'En otra temporada';
          txt.append(e);
        }
        if (a.reward && !secret && !a.earlier) {
          const r = document.createElement('p');
          r.className = 'reward';
          r.textContent = `🎁 ${a.reward}`;
          txt.append(r);
        }
        row.append(icon, txt);
        sec.append(row);
      }
      body.append(sec);
    }
    box.append(head, body);
    panel.replaceChildren(box);
    panel.hidden = false;
  }
  button.addEventListener('click', openList);
}
