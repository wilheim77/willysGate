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
  const meta = game.achievements;
  if (!meta) return;

  // --- The banner ---
  const banner = document.createElement('div');
  banner.className = 'achievement-toast';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  document.body.append(banner);
  const queue: AchievementView[] = [];
  let timer = 0;
  const next = () => {
    const a = queue.shift();
    if (!a) {
      banner.hidden = true;
      document.body.classList.remove('has-achievement');
      return;
    }
    const text = document.createElement('div');
    text.className = 'text';
    const kicker = document.createElement('span');
    kicker.className = 'kicker';
    kicker.textContent = a.again ? '¡Otra vez! (sin caja: ya la ganaste)' : '¡Logro desbloqueado!';
    const name = document.createElement('strong');
    name.textContent = a.name;
    const desc = document.createElement('p');
    desc.textContent = a.description;
    text.append(kicker, name, desc);
    if (a.line) {
      const said = document.createElement('p');
      said.className = 'said';
      said.textContent = `🎙 ${a.line}`;
      text.append(said);
    }
    if (a.reward) {
      const reward = document.createElement('p');
      reward.className = 'reward';
      reward.textContent = `🎁 ${a.reward}`;
      text.append(reward);
    }
    banner.replaceChildren(uiIcon(manifest, a.icon ?? '', 48), text);
    banner.hidden = false;
    document.body.classList.add('has-achievement');
    banner.classList.remove('pop');
    void banner.offsetWidth;
    banner.classList.add('pop');
    clearTimeout(timer);
    // Long enough to read the narrator's line too.
    timer = window.setTimeout(next, 3500 + (a.line?.length ?? 0) * 45);
  };
  banner.addEventListener('click', () => {
    clearTimeout(timer);
    next();
  });
  store.subscribe((change) => {
    if (change.kind !== 'events') return;
    const fresh = change.events.map((e) => meta.unlocked(e, change.kind === 'events' ? store.state : undefined)).filter((a): a is AchievementView => !!a);
    if (!fresh.length) return;
    const idle = banner.hidden;
    queue.push(...fresh);
    if (idle) next();
    refreshCount();
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
  store.subscribe((change) => {
    if (change.kind === 'reset') refreshCount();
  });
  refreshCount();

  const panel = document.createElement('div');
  panel.className = 'meta-panel';
  panel.hidden = true;
  document.body.append(panel);
  const close = () => (panel.hidden = true);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });
  button.addEventListener('click', () => {
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
  });
}
