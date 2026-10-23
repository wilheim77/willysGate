import type { GameEvent, GameState } from '../../engine';
import { type Rarity, itemDef, metaOf, profileOf } from '../../rulesets/willy';
import type { AchievementView, GameDefinition, RewardBoxResult, RewardBoxView } from '../../src/game/definition';
import { META_CONTENT } from './meta-content';
import { narrate } from './narrator';

/**
 * How the client shows Willy's achievements and loot boxes (GameDefinition.achievements and
 * .rewardBoxes): names, colours and art ids from the data; the rules stay in the ruleset.
 */

const loot = META_CONTENT.loot;
const RARITY_LABEL = (r: Rarity) => loot.rarezas[r]?.nombre ?? r;

function rewardText(a: (typeof META_CONTENT.achievements)[number]): string | undefined {
  const box = a.recompensas.find((r) => r.tipo === 'caja' && r.nivel);
  return box ? loot.cajas[box.nivel!].nombre : undefined;
}

function view(a: (typeof META_CONTENT.achievements)[number], unlocked: boolean): AchievementView {
  return {
    id: a.id,
    name: a.nombre,
    description: a.descripcion,
    category: a.categoria,
    unlocked,
    hidden: a.oculto,
    ...(a.pista ? { hint: a.pista } : {}),
    ...(rewardText(a) ? { reward: rewardText(a)! } : {}),
    icon: `logro-cat-${a.categoria}`,
  };
}

export const achievements: NonNullable<GameDefinition['achievements']> = {
  categories: META_CONTENT.categories,
  list: (state) => {
    const got = new Set(metaOf(state).logros);
    const before = new Set(profileOf(state).logros);
    return META_CONTENT.achievements.map((a) => ({ ...view(a, got.has(a.id) || before.has(a.id)), ...(before.has(a.id) && !got.has(a.id) ? { earlier: true } : {}) }));
  },
  unlocked: (event, state) => {
    if (event.type !== 'achievementUnlocked') return null;
    const id = (event as GameEvent & { logroId?: string }).logroId;
    const a = META_CONTENT.achievements.find((x) => x.id === id);
    if (!a) return null;
    const again = !!(event as GameEvent & { repetido?: boolean }).repetido;
    const line = state ? narrate(event, state) : null;
    const v = { ...view(a, true), ...(line ? { line } : {}) };
    return again ? { ...v, again: true, reward: undefined } : v;
  },
};

function boxView(b: { id: string; nivel: Rarity; origen: string; motivo?: string }): RewardBoxView {
  const def = loot.cajas[b.nivel];
  const origin: Record<string, string> = { logro: 'Logro', jefe: 'Jefe de planta', combate: 'Combate', planta: 'Planta limpia', patrocinio: 'Patrocinio' };
  return {
    id: b.id,
    tier: b.nivel,
    name: def.nombre,
    color: loot.rarezas[b.nivel].color,
    description: def.descripcion,
    ...(b.motivo || origin[b.origen] ? { reason: [origin[b.origen.split(':')[0]!] ?? '', b.motivo && b.origen === 'logro' ? `«${b.motivo}»` : ''].filter(Boolean).join(': ') } : {}),
    art: { closed: `caja-${b.nivel}-cerrada`, lid: [1, 2, 3].map((n) => `caja-${b.nivel}-tapa-${n}`), open: `caja-${b.nivel}-abierta`, ...(b.nivel === 'legendaria' ? { burst: 'caja-legendaria-estrellas' } : {}) },
  };
}

export const rewardBoxes: NonNullable<GameDefinition['rewardBoxes']> = {
  pending: (state: GameState) => metaOf(state).cajas.map(boxView),
  open: (boxId, issuer) => ({ type: 'openBox', issuer, boxId }),
  result: (events) => {
    const e = events.find((x) => x.type === 'boxOpened') as (GameEvent & { caja: Rarity; objetos: { item: string; rareza: Rarity }[]; fichas: number }) | undefined;
    if (!e) return null;
    const out: RewardBoxResult = {
      tier: e.caja,
      items: e.objetos.map((o) => {
        const d = itemDef(o.item);
        return { id: o.item, label: d?.nombre ?? o.item, rarity: o.rareza, rarityLabel: RARITY_LABEL(o.rareza), color: loot.rarezas[o.rareza].color, ...(d?.regla ? { rule: d.regla } : {}), icon: `item-${o.item}`, frame: `marco-${o.rareza}` };
      }),
      coins: e.fichas,
      coinsLabel: 'fichas',
    };
    return out;
  },
  odds: (tier) => {
    const box = loot.cajas[tier as Rarity];
    if (!box) return [];
    const total = Object.values(box.pesosRareza).reduce((s, v) => s + v, 0);
    const lines = Object.entries(box.pesosRareza)
      .filter(([, w]) => w > 0)
      .map(([r, w]) => `${RARITY_LABEL(r as Rarity)}: ${((100 * w) / total).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % por objeto`);
    return [`${box.objetos} objetos y ${box.fichas[0]}-${box.fichas[1]} fichas.`, ...lines, ...(box.garantia ? [`Garantía: al menos un objeto de ${RARITY_LABEL(box.garantia)}.`] : []), 'Cada 8 cajas seguidas sin oro, la siguiente trae uno seguro; cada 20 sin legendario, uno legendario.'];
  },
};
