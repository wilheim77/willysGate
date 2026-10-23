import type { GameState } from '../../engine';
import { damageModifierHooks } from './resolve';

/**
 * Difficulty (RULESET.md → «Dificultad»), read from the run's flag `dificultad` (chosen before the
 * casting): the floor clock and the damage each side takes. Concursante is the numbers as
 * written. Kept simple on purpose: two multipliers per mode, all visible in the mode's text.
 */
export interface DifficultyMods {
  /** Floor clock length. */
  reloj: number;
  /** Damage the party (Willy, companions, summons) takes. */
  danoRecibido: number;
  /** Damage the enemies take (Prime time: they last longer). */
  danoEnemigos: number;
}

export const DIFFICULTIES: Record<string, DifficultyMods> = {
  turista: { reloj: 1.5, danoRecibido: 0.6, danoEnemigos: 1 },
  concursante: { reloj: 1, danoRecibido: 1, danoEnemigos: 1 },
  primetime: { reloj: 0.8, danoRecibido: 1, danoEnemigos: 0.8 },
};

export function difficultyOf(state: GameState): DifficultyMods {
  return DIFFICULTIES[String(state.flags.dificultad ?? 'concursante')] ?? DIFFICULTIES.concursante!;
}

const inParty = (id: string, state: GameState) => state.entities[id]?.controllerId.startsWith('player') ?? false;

damageModifierHooks.push((r, targetId, amount) => {
  const d = difficultyOf(r.state);
  const mult = inParty(targetId, r.state) ? d.danoRecibido : r.state.entities[targetId]?.factionId === 'monstruos' || r.state.entities[targetId]?.factionId === 'rivales' ? d.danoEnemigos : 1;
  // Never below 1: a hit that lands always hurts a little.
  return mult === 1 ? amount : Math.max(1, Math.round(amount * mult));
});
