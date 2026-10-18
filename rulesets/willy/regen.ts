import type { ActionOutcome, Effect, Entity, GameEvent, GameState, RngCursor, Ruleset } from '../../engine';
import { WILLY } from './data';
import { cloneMeta, metaOf, setMeta } from './meta';
import { standing } from './resolve';

/**
 * Health back while exploring (willy.json → regeneracion): every `pasos` tiles Willy walks out of
 * combat, he and his companion get `vida` of their maximum back; arriving at a Camerino the
 * make-up team leaves them as new. Steps are counted from the command's own events, so it is
 * deterministic and the balance sim can apply the same rule with explorationHealing().
 */

const isPartyMember = (e: Entity) => e.id === 'willy' || e.tags.includes('companero-de:willy');

/** Health each standing party member gets back for walking `steps` tiles (pure; for the sim too). */
export function explorationHealing(state: GameState, steps: number): Effect[] {
  const { pasos, vida } = WILLY.regeneracion;
  const ticks = Math.floor(steps / pasos);
  if (ticks <= 0) return [];
  const out: Effect[] = [];
  for (const e of Object.values(state.entities)) {
    const hp = e.resources.vida;
    if (!isPartyMember(e) || !standing(e) || !hp || hp.current >= hp.max) continue;
    const gain = Math.min(hp.max - hp.current, ticks * Math.max(1, Math.ceil(hp.max * vida)));
    out.push({ type: 'modifyResource', entityId: e.id, resource: 'vida', delta: gain });
  }
  return out;
}

export function regenHook(_ruleset: Ruleset, state: GameState, events: GameEvent[], _rng: RngCursor): ActionOutcome {
  if (!state.entities.willy) return { effects: [], events: [] };
  const effects: Effect[] = [];
  const out: GameEvent[] = [];
  // The Camerino: full health on arrival.
  const arrived = events.some((e) => e.type === 'mapChanged' && String((e as GameEvent & { to?: string }).to).startsWith('camerino'));
  if (arrived) {
    for (const e of Object.values(state.entities)) {
      const hp = e.resources.vida;
      if (isPartyMember(e) && standing(e) && hp && hp.current < hp.max) effects.push({ type: 'modifyResource', entityId: e.id, resource: 'vida', delta: Math.ceil((hp.max - hp.current) * WILLY.regeneracion.camerino) });
    }
    if (effects.length) out.push({ type: 'partyPatchedUp', where: 'camerino' } as GameEvent);
    return { effects, events: out };
  }
  if (state.turn.mode === 'combat') return { effects, events: out };
  let steps = 0;
  for (const e of events as unknown as { type: string; entityId?: string; path?: unknown[] }[]) {
    if (e.type === 'entityMoved' && e.entityId === 'willy') steps += e.path?.length ?? 0;
  }
  if (!steps) return { effects, events: out };
  const meta = cloneMeta(metaOf(state));
  const total = meta.pasos + steps;
  meta.pasosTotales += steps;
  const heal = explorationHealing(state, total);
  meta.pasos = total % WILLY.regeneracion.pasos;
  effects.push(...heal, setMeta(meta));
  if (heal.length) out.push({ type: 'regenerated', entityIds: heal.map((h) => (h as { entityId: string }).entityId) } as GameEvent);
  return { effects, events: out };
}
