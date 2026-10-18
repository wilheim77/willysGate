import type { ActionOutcome, Effect, GameEvent, GameState, RngCursor, Ruleset } from '../../engine';
import { audienceOf } from './show/audience';
import { sponsorsOf } from './show/sponsors';

/**
 * The end of a won season (docs/willy/STORY.md §4). When the final boss (the entity the game
 * tags `jefe-final`) is defeated for real, the season is decided: the clock stops, the flag
 * DEFEATED_FLAG opens the ending conversation (the game's trigger), and SECRET_FLAG says whether
 * the secret ending is offered. The conversation sets FINAL_FLAG to 'A', 'B' or 'C'; that ends
 * the run: `runEnded { resultado: 'victoria', final }` for achievements and the Narrador, and
 * RESULT_FLAG for the game's summary screen.
 */

export const DEFEATED_FLAG = 'willy:presentadorDerrotado';
export const SECRET_FLAG = 'willy:finalSecreto';
/** Set by talking to Xelda about the contract (the game's dialogue). */
export const CONTRACT_FLAG = 'willy:contratoLeido';
export const FINAL_FLAG = 'willy:final';
export const RESULT_FLAG = 'willy:resultado';
export const FINAL_BOSS_TAG = 'jefe-final';

/** The secret ending: 50 million viewers, three sponsors in favour or fans, and the contract read. */
export const SECRET_ENDING = { audiencia: 50_000_000, patrocinadores: 3 };

export function secretEndingMet(state: GameState): boolean {
  const viewers = audienceOf(state)?.valor ?? 0;
  const friends = Object.values(sponsorsOf(state)?.porId ?? {}).filter((s) => !s.retirado && (s.estado === 'aFavor' || s.estado === 'fan')).length;
  return viewers >= SECRET_ENDING.audiencia && friends >= SECRET_ENDING.patrocinadores && state.flags[CONTRACT_FLAG] === true;
}

/** The season is over (won, ending chosen): nothing else should tick. */
export const seasonDecided = (state: GameState) => state.flags[DEFEATED_FLAG] === true;

export function endingAfterCommand(_ruleset: Ruleset, state: GameState, events: GameEvent[], _rng: RngCursor): ActionOutcome {
  const effects: Effect[] = [];
  const out: GameEvent[] = [];
  if (!state.flags[DEFEATED_FLAG]) {
    const beaten = events.some((e) => e.type === 'entityDefeated' && state.entities[(e as unknown as { entityId: string }).entityId]?.tags.includes(FINAL_BOSS_TAG));
    if (beaten) {
      effects.push({ type: 'setFlag', flag: DEFEATED_FLAG, value: true }, { type: 'setFlag', flag: SECRET_FLAG, value: secretEndingMet(state) });
      out.push({ type: 'seasonWon', finalSecreto: secretEndingMet(state) } as GameEvent);
    }
  }
  const chosen = events.find((e) => e.type === 'flagChanged' && (e as unknown as { flag: string }).flag === FINAL_FLAG) as unknown as { value: string } | undefined;
  if (chosen && !state.flags[RESULT_FLAG] && state.flags[DEFEATED_FLAG]) {
    effects.push({ type: 'setFlag', flag: RESULT_FLAG, value: 'victoria' });
    out.push({
      type: 'runEnded',
      resultado: 'victoria',
      final: String(chosen.value),
      modoEliminacion: String(state.flags.modoEliminacion ?? 'repeticion'),
      planta: Number(state.map.id.match(/planta-(\d+)/)?.[1] ?? 0),
    } as GameEvent);
  }
  return { effects, events: out };
}
