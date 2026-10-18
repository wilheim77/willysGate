import type { ActionOutcome, GameEvent, GameState, RngCursor, Ruleset } from '../../engine';
import { hasTrait } from './character';

/**
 * Class disadvantages that react to something elsewhere in the game rather than to Willy's own
 * actions (RULESET.md → desventajas). Kept out of the ruleset's main afterCommand chain so each
 * one stays a one-line addition here instead of reaching into another subsystem's internals.
 *
 * Influencer's «Necesita likes» was written against "the audience drops below the floor's
 * minimum" (classes.json), which design later made impossible (the audience never drops below
 * it: docs/willy/DESIGN.md §12, the "Zapping" achievement). The real trigger is the audience
 * actually stalling: a loss from boredom or monotony (audienceChanged, causa aburrimiento or
 * monotonia — rulesets/willy/show/audience.ts), which does fire.
 */
const NECESITA_LIKES_CAUSAS = new Set(['aburrimiento', 'monotonia']);

export function traitsAfterCommand(_ruleset: Ruleset, state: GameState, events: GameEvent[], _rng: RngCursor): ActionOutcome {
  const out: ActionOutcome = { effects: [], events: [] };
  const willy = Object.values(state.entities).find((e) => e.controllerId.startsWith('player') && hasTrait(e, 'necesita-likes'));
  if (!willy) return out;
  const stalled = events.some((e) => e.type === 'audienceChanged' && NECESITA_LIKES_CAUSAS.has(String((e as unknown as { causa?: string }).causa)));
  if (stalled) out.effects.push({ type: 'applyCondition', entityId: willy.id, condition: 'mareado', remainingTurns: 2 });
  return out;
}
