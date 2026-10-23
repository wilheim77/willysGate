import type { AssetManifest } from '../assets/manifest';
import type { GameDefinition, RewardBoxResult, RewardBoxView } from '../game/definition';
import type { GameStore } from '../game/store';
import { hasUiArt, uiIcon } from './portraits';

/**
 * Reward boxes (GameDefinition.rewardBoxes): a 🎁 counter in the top bar and the opening moment.
 * The box drops in, shakes (harder for better tiers, never by content: no false hopes), the lid
 * flies, and the cards come out face down; tap each to turn it, or «Revelar todo». Exact odds are
 * one tap away. Tapping anywhere speeds it up; nothing is timed against the player.
 */
export function setupRewardBoxes(store: GameStore, game: GameDefinition, manifest: AssetManifest): void {
  const rb = game.rewardBoxes;
  if (!rb) return;
  const button = document.createElement('button');
  button.className = 'boxes-button';
  button.title = 'Cajas de botín';
  button.setAttribute('aria-label', 'Cajas de botín');
  document.querySelector('.hud-top nav')!.prepend(button);
  let shown = -1;
  const refresh = () => {
    const n = rb.pending(store.state).length;
    button.textContent = `🎁${n}`;
    button.classList.toggle('has-boxes', n > 0);
    if (n > shown && shown >= 0) {
      button.classList.remove('bump');
      void button.offsetWidth;
      button.classList.add('bump');
    }
    shown = n;
  };
  store.subscribe(() => refresh());
  refresh();

  const overlay = document.createElement('div');
  overlay.className = 'box-overlay';
  overlay.hidden = true;
  document.body.append(overlay);
  const close = () => {
    overlay.hidden = true;
    overlay.replaceChildren();
  };

  const button2 = (label: string, onClick: () => void, cls = '') => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  };

  const boxArt = (box: RewardBoxView, id: string | undefined, size: number) => {
    const holder = document.createElement('div');
    holder.className = `box-art tier-${box.tier}`;
    holder.style.setProperty('--tier', box.color);
    if (id && hasUiArt(manifest, id)) holder.append(uiIcon(manifest, id, size));
    else holder.classList.add('css-box');
    return holder;
  };

  /** The list of waiting boxes. */
  const showList = () => {
    const boxes = rb.pending(store.state);
    const panel = document.createElement('div');
    panel.className = 'box-panel';
    const h = document.createElement('h2');
    h.textContent = boxes.length ? `Cajas por abrir · ${boxes.length}` : 'No hay cajas por abrir';
    panel.append(h);
    if (!boxes.length) {
      const p = document.createElement('p');
      p.textContent = 'Se ganan con logros, jefes, élites y plantas limpias. Ninguna se compra.';
      panel.append(p);
    }
    const list = document.createElement('div');
    list.className = 'box-list';
    for (const b of boxes) {
      const row = document.createElement('button');
      row.className = 'box-row';
      row.style.setProperty('--tier', b.color);
      const txt = document.createElement('span');
      txt.innerHTML = '<strong></strong><small></small>';
      txt.querySelector('strong')!.textContent = b.name;
      txt.querySelector('small')!.textContent = b.reason ?? '';
      row.append(boxArt(b, b.art?.closed, 48), txt);
      row.addEventListener('click', () => openOne(b));
      list.append(row);
    }
    // Many boxes at once: open them all and see everything on one screen.
    if (boxes.length > 1) panel.append(button2(`Abrir todas (${boxes.length})`, () => openAll(boxes), 'primary'));
    panel.append(list, button2('Cerrar', close));
    overlay.replaceChildren(panel);
    overlay.hidden = false;
  };

  const showOdds = (box: RewardBoxView, back: () => void) => {
    const panel = document.createElement('div');
    panel.className = 'box-panel';
    const h = document.createElement('h2');
    h.textContent = `Probabilidades · ${box.name}`;
    const ul = document.createElement('ul');
    for (const line of rb.odds(box.tier)) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.append(li);
    }
    panel.append(h, ul, button2('Volver', back));
    overlay.replaceChildren(panel);
  };

  /** Every waiting box at once: all the cards face up, everything into the bag. */
  const openAll = (boxes: RewardBoxView[]) => {
    const results: RewardBoxResult[] = [];
    for (const b of boxes) {
      const r = store.dispatch(rb.open(b.id, game.playerId) as never);
      const res = r.ok ? rb.result(r.events) : null;
      if (res) results.push(res);
    }
    const panel = document.createElement('div');
    panel.className = 'box-panel box-all';
    const h = document.createElement('h2');
    h.textContent = `${results.length} cajas abiertas`;
    const grid = document.createElement('div');
    grid.className = 'all-items';
    for (const it of results.flatMap((r) => r.items)) {
      const row = document.createElement('div');
      row.className = 'all-item';
      row.style.setProperty('--rar', it.color);
      const t = document.createElement('span');
      t.innerHTML = '<strong></strong><small></small>';
      t.querySelector('strong')!.textContent = it.label;
      t.querySelector('small')!.textContent = `${it.rarityLabel}${it.rule ? ` · ${it.rule}` : ''}`;
      row.append(uiIcon(manifest, it.icon ?? '', 32), t);
      grid.append(row);
    }
    const coins = results.reduce((s, r) => s + r.coins, 0);
    const p = document.createElement('p');
    p.className = 'coins';
    p.textContent = coins ? `+${coins} ${results[0]?.coinsLabel ?? ''}` : '';
    // Opening may have earned more (an achievement for boxes opened).
    const more = rb.pending(store.state);
    panel.append(h, grid, p, button2('A la mochila', close, 'primary'), ...(more.length ? [button2(`Abrir las nuevas (${more.length})`, () => (more.length > 1 ? openAll(more) : openOne(more[0]!)))] : []));
    overlay.replaceChildren(panel);
    overlay.hidden = false;
  };

  /** The moment: drop, tap to open, shake, lid, cards. */
  const openOne = (box: RewardBoxView) => {
    const stage = document.createElement('div');
    stage.className = `box-stage tier-${box.tier}`;
    stage.style.setProperty('--tier', box.color);
    const title = document.createElement('h2');
    title.textContent = box.name;
    const sub = document.createElement('p');
    sub.className = 'sub';
    sub.textContent = box.description ?? '';
    const art = boxArt(box, box.art?.closed, 160);
    art.classList.add('drop');
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Toca la caja para abrirla';
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(button2('Ver probabilidades', () => showOdds(box, () => openOne(box))), button2('Luego', close));
    stage.append(title, sub, art, hint, actions);
    overlay.replaceChildren(stage);
    overlay.hidden = false;
    let opened = false;
    art.addEventListener('click', () => {
      if (opened) return;
      opened = true;
      actions.replaceChildren();
      hint.textContent = '';
      const r = store.dispatch(rb.open(box.id, game.playerId) as never);
      if (!r.ok) {
        hint.textContent = 'No se ha podido abrir.';
        return;
      }
      const result = rb.result(r.events);
      if (result) reveal(box, result, stage, art);
    });
  };

  const reveal = (box: RewardBoxView, result: RewardBoxResult, stage: HTMLElement, art: HTMLElement) => {
    const order = ['bronce', 'plata', 'oro', 'legendaria'];
    const best = result.items.reduce((m, i) => (order.indexOf(i.rarity) > order.indexOf(m.rarity) ? i : m), result.items[0] ?? { rarity: box.tier, color: box.color });
    let fast = false;
    stage.addEventListener('click', () => (fast = true));
    const wait = (ms: number) => new Promise((res) => setTimeout(res, fast ? ms / 4 : ms));
    const frame = (id: string | undefined) => {
      if (!id || !hasUiArt(manifest, id)) return;
      art.replaceChildren(uiIcon(manifest, id, 160));
    };
    void (async () => {
      art.classList.remove('drop');
      art.classList.add('shake');
      await wait(700 + 250 * order.indexOf(box.tier));
      art.classList.remove('shake');
      for (const id of box.art?.lid ?? []) {
        frame(id);
        await wait(110);
      }
      frame(box.art?.open);
      if (box.art?.burst && hasUiArt(manifest, box.art.burst)) {
        const burst = uiIcon(manifest, box.art.burst, 256);
        burst.classList.add('burst');
        art.prepend(burst);
      }
      stage.style.setProperty('--beam', best.color);
      stage.classList.add('beam', `best-${best.rarity}`);
      await wait(350);
      const fan = document.createElement('div');
      fan.className = 'cards';
      const cards = result.items.map((it, i) => {
        const card = document.createElement('button');
        card.className = 'card';
        card.style.setProperty('--rar', it.color);
        card.style.setProperty('--i', String(i));
        const back = document.createElement('span');
        back.className = 'back';
        back.textContent = '?';
        const face = document.createElement('span');
        face.className = 'face';
        const icon = uiIcon(manifest, it.icon ?? '', 48);
        const name = document.createElement('strong');
        name.textContent = it.label;
        const rar = document.createElement('em');
        rar.textContent = it.rarityLabel;
        const rule = document.createElement('small');
        rule.textContent = it.rule ?? '';
        face.append(icon, name, rar, rule);
        card.append(back, face);
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          card.classList.add('flipped');
          done();
        });
        return card;
      });
      fan.append(...cards);
      const coins = document.createElement('p');
      coins.className = 'coins';
      const footer = document.createElement('div');
      footer.className = 'actions';
      const all = button2('Revelar todo', () => {
        cards.forEach((c) => c.classList.add('flipped'));
        done();
      });
      footer.append(all);
      stage.append(fan, coins, footer);
      const done = () => {
        if (!cards.every((c) => c.classList.contains('flipped'))) return;
        if (result.coins) coins.textContent = `+${result.coins} ${result.coinsLabel ?? ''}`;
        const more = rb.pending(store.state).length;
        footer.replaceChildren(button2('A la mochila', close, 'primary'), ...(more ? [button2(`Abrir otra (${more})`, showList)] : []));
      };
    })();
  };

  button.addEventListener('click', () => {
    const boxes = rb.pending(store.state);
    if (boxes.length === 1) openOne(boxes[0]!);
    else showList();
  });
}
