import type { ActionOutcome, Effect, GameEvent, GameState, JsonValue, RngCursor, Ruleset } from '../../engine';
import { hasTrait } from './character';
import { cloneMeta, itemDef, metaOf, setMeta } from './meta';

/**
 * Ultramarinos Maripuri, minimal first version (docs/willy/DESIGN.md §11): she sells a few
 * consumables, one of each per Camerino, for tokens. The menu is a conversation
 * (content/willy/dialogues/camerino.ts): each item is a choice tagged `comprar:<item>:<price>`,
 * shown only while it can be bought (dialogue condition `tiendaQueda`). This hook charges for it,
 * puts it in the bag and marks it sold out in this Camerino. «Regateo» (Tasador): 20 % off.
 * Selling, the full stock (loot-tables.json → mercado) and the shop panel come later.
 */

export const soldFlag = (mapId: string, item: string) => `tienda:${mapId}:${item}`;

/** The price Willy pays: the listed one, 20 % less for a Tasador («Regateo»). */
export function shopPrice(state: GameState, listed: number): number {
  const w = state.entities.willy;
  return w && (hasTrait(w, 'regateo') || w.tags.includes('clase:tasador')) ? Math.ceil(listed * 0.8) : listed;
}

export const shopConditions = {
  /** Still on the shelf in this Camerino, and Willy can pay for it. */
  tiendaQueda: (s: GameState, _id: string, p: Record<string, JsonValue>): boolean => {
    const item = String(p.item);
    if (s.flags[soldFlag(s.map.id, item)] || !itemDef(item)) return false;
    return (s.entities.willy?.resources.fichas?.current ?? 0) >= shopPrice(s, Number(p.precio ?? 0));
  },
};

export function shopAfterCommand(_ruleset: Ruleset, state: GameState, events: GameEvent[], _rng: RngCursor): ActionOutcome {
  const effects: Effect[] = [];
  const out: GameEvent[] = [];
  for (const raw of events as unknown as Record<string, unknown>[]) {
    if (raw.type !== 'dialogueChoice') continue;
    const tag = ((raw.tags as string[] | undefined) ?? []).find((t) => t.startsWith('comprar:'));
    if (!tag) continue;
    const [, item, listed] = tag.split(':');
    const def = item ? itemDef(item) : undefined;
    const price = shopPrice(state, Number(listed ?? 0));
    const chips = state.entities.willy?.resources.fichas?.current ?? 0;
    if (!def || chips < price || state.flags[soldFlag(state.map.id, def.id)]) continue;
    const meta = cloneMeta(metaOf(state));
    meta.obtenidos[def.id] = (meta.obtenidos[def.id] ?? 0) + 1;
    effects.push(
      { type: 'modifyResource', entityId: 'willy', resource: 'fichas', delta: -price },
      { type: 'giveItem', owner: 'party', item: def.id, count: def.usos ?? 1 },
      { type: 'setFlag', flag: soldFlag(state.map.id, def.id), value: true },
      setMeta(meta),
    );
    out.push({ type: 'itemBought', item: def.id, nombre: def.nombre, precio: price } as GameEvent);
  }
  return { effects, events: out };
}
