import type { Resolver, WillyEvent } from '../resolve';
import { WILLY_ID as WILLY } from './config';

/**
 * The show pays in loot boxes, items and coins. Boxes and items belong to the meta systems
 * (loot boxes, inventory); this is the one place the show hands them over, so the show never
 * runs a parallel box system.
 *
 * - grantBox: emits boxDelivered { caja, origen } (the Narrador's «cajaLlega» bank); the box
 *   system turns it into a box to open.
 * - grantItem: puts the item in Willy's pack and emits itemObtained { item, origen }.
 * - grantCoins: fichas (the Camerino's money), positive or negative.
 */

export function grantBox(r: Resolver, caja: string, origen: string): void {
  r.emit({ type: 'boxDelivered', caja, origen, entityId: WILLY } as unknown as WillyEvent);
}

export function grantItem(r: Resolver, item: string, origen: string): void {
  if (!r.state.entities[WILLY]) return;
  r.apply({ type: 'giveItem', owner: WILLY, item, count: 1 });
  r.emit({ type: 'itemObtained', item, origen, entityId: WILLY } as unknown as WillyEvent);
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
