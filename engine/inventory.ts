import type { GameState, JsonValue } from './state';

/**
 * Items carried, as counts per owner. An owner is an entity id or a shared pool such as
 * 'party'. Item ids and what they do belong to the game's content and ruleset.
 */
export type Inventories = Record<string, Record<string, number>>;

export function inventoriesOf(state: GameState): Inventories {
  return (state.systems.inventory as Inventories | undefined) ?? {};
}

export function itemCount(state: GameState, owner: string, item: string): number {
  return inventoriesOf(state)[owner]?.[item] ?? 0;
}

/** Adds (or with a negative delta removes) items; counts never go below zero. */
export function withItems(state: GameState, owner: string, item: string, delta: number): GameState {
  const all = inventoriesOf(state);
  const bag = { ...(all[owner] ?? {}) };
  const count = Math.max(0, (bag[item] ?? 0) + delta);
  if (count === 0) delete bag[item];
  else bag[item] = count;
  return { ...state, systems: { ...state.systems, inventory: { ...all, [owner]: bag } as unknown as JsonValue } };
}
