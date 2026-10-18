import type { ActionOutcome } from '../../../engine';
import { grantItem as metaGrantItem, grantLootBox } from '../loot';
import { RARITIES, type Rarity, itemDef } from '../meta';
import type { Resolver, WillyEvent } from '../resolve';
import { WILLY_ID as WILLY } from './config';

/**
 * The show pays in loot boxes, items and coins. Boxes and items belong to the meta systems
 * (rulesets/willy/loot.ts): the show only hands them over, so there is one box queue and one
 * item path for everything.
 *
 * - grantBox: a box into the run's queue (loot.grantLootBox → boxDelivered { boxId, caja, origen, motivo }).
 * - grantItem: an item into the party's bag (loot.grantItem → itemObtained { item, nombre, rareza, origen }).
 * - grantCoins: fichas (the Camerino's money), positive or negative → coinsGranted { amount, origen }.
 */

function take(r: Resolver, o: ActionOutcome): void {
  r.apply(...o.effects);
  for (const e of o.events) r.emit(e);
}

/** `origen` is where it comes from (hito:5000, patrocinador:glorp, contrato:...). */
export function grantBox(r: Resolver, caja: string, origen: string): void {
  const tier = (RARITIES as string[]).includes(caja) ? (caja as Rarity) : 'bronce';
  take(r, grantLootBox(r.state, tier, origen, origen.startsWith('hito') || origen.startsWith('prima') ? 'audiencia' : 'patrocinio'));
}

export function grantItem(r: Resolver, item: string, origen: string): void {
  if (itemDef(item)) {
    take(r, metaGrantItem(r.state, item, origen));
    return;
  }
  // Without the item catalogue (ruleset tests), straight into Willy's pack.
  if (!r.state.entities[WILLY]) return;
  r.apply({ type: 'giveItem', owner: WILLY, item, count: 1 });
  r.emit({ type: 'itemObtained', item, origen } as unknown as WillyEvent);
}

export function grantCoins(r: Resolver, amount: number, origen: string): number {
  const w = r.state.entities[WILLY];
  const coins = w?.resources.fichas;
  if (!w || !coins || amount === 0) return 0;
  const delta = Math.max(-coins.current, amount);
  if (delta === 0) return 0;
  r.apply({ type: 'modifyResource', entityId: WILLY, resource: 'fichas', delta });
  r.emit({ type: 'coinsGranted', amount: delta, origen, entityId: WILLY } as unknown as WillyEvent);
  return delta;
}
