import type { ActionOutcome, Effect, GameState, JsonValue, RngCursor } from '../../engine';
import { standing } from './resolve';

/**
 * The Camerino's regulars (docs/willy/DESIGN.md §11): what their conversations
 * (content/willy/dialogues/camerino.ts) ask of the ruleset.
 *
 * - `onRest`, the engine's `rest` dialogue effect: kind 'bar' is Paco's café (the whole party back
 *   to full health and energy, once per Camerino: a flag per map says so) and kind 'parte' is
 *   Xelda's «firmar el parte» (nothing to restore: the engine announces `rested` and the client
 *   keeps its checkpoint there).
 * - Dialogue conditions: which Camerino this is (0: before floor 1; N: after floor N) and whether
 *   Paco's bar is still free.
 */

/** 0 for the first Camerino, N for the one after floor N; undefined anywhere else. */
export function camerinoNumber(mapId: string): number | undefined {
  if (mapId === 'camerino') return 0;
  const m = /^camerino-(\d+)$/.exec(mapId);
  return m ? Number(m[1]) : undefined;
}

export const barFlag = (mapId: string): string => `bar:${mapId}`;

export function onRest(state: GameState, partyIds: string[], kind: string, _rng: RngCursor): ActionOutcome {
  const effects: Effect[] = [];
  if (kind === 'bar') {
    for (const id of partyIds) {
      const e = state.entities[id];
      if (!e || !standing(e)) continue;
      for (const resource of ['vida', 'energia']) {
        const pool = e.resources[resource];
        if (pool && pool.current < pool.max) effects.push({ type: 'modifyResource', entityId: id, resource, delta: pool.max - pool.current });
      }
    }
    effects.push({ type: 'setFlag', flag: barFlag(state.map.id), value: true });
  }
  return { effects, events: [] };
}

export const camerinoConditions = {
  /** The Camerino number is between `min` and `max` (either may be left out). */
  camerinoEn: (s: GameState, _id: string, p: Record<string, JsonValue>): boolean => {
    const n = camerinoNumber(s.map.id);
    return n !== undefined && n >= Number(p.min ?? 0) && n <= Number(p.max ?? 99);
  },
  /** Paco hasn't served this party a café in this Camerino yet. */
  barLibre: (s: GameState): boolean => !s.flags[barFlag(s.map.id)],
};
