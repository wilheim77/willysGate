import type { CheckRequest, CheckResult, Ruleset } from './ruleset';
import { RngCursor } from './rng';
import type { GameState } from './state';

/** Runs a ruleset check and returns the state with the RNG advanced, plus the displayable result. */
export function performCheck(ruleset: Ruleset, state: GameState, request: CheckRequest): { state: GameState; result: CheckResult } {
  if (!state.entities[request.actorId]) throw new Error(`Check by unknown entity "${request.actorId}"`);
  const rng = new RngCursor(state.rng);
  const result = ruleset.resolveCheck(state, request, rng);
  return { state: { ...state, rng: rng.state }, result };
}
