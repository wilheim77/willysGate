import { describe, expect, it } from 'vitest';
import { type GameState, progressOf } from '../../engine';
import levelups from '../../content/intereses/levelups.json';
import { ALL_COMBOS, type Combo, comboLabel, runRoute } from './routes';

/**
 * The XP curve of Intereses (content/intereses/levelups.json "thresholds"), checked on the
 * golden path: the engine levels the party by itself (engine/progression.ts), so the harness
 * sees exactly what a player would. The party starts at level 3, should reach level 4 around
 * the middle of the act (after the trial, by the night of the torches; a player who fights the
 * callejón gets it before the Escorial, as docs/ENCOUNTERS.md wants) and level 5 before the final fight (on arrival at the Vault),
 * on every D1-D4 route. Plain `npm test` runs the four
 * smoke routes; `QA_DEEP=1 npm run test:qa` runs all of them.
 *
 * Retuning: change the thresholds in levelups.json; the table this test prints shows the PX
 * each route has at each milestone.
 */

/** Story milestones in act order, and how to spot them in the state. */
const MILESTONES: { id: string; reached: (s: GameState) => boolean }[] = [
  { id: 'prologo', reached: (s) => !!s.flags.prologo_mineros_resuelto },
  { id: 'juicio', reached: (s) => !!s.flags.juicio_resuelto },
  { id: 'callejon', reached: (s) => s.map.id === 'callejon' },
  { id: 'investigacion', reached: (s) => !!s.flags.pista_plata_nueva && !!s.flags.pista_pozo },
  { id: 'llega_escorial', reached: (s) => s.map.id === 'escorial' },
  { id: 'escorial', reached: (s) => !!s.flags.escorial_libre },
  { id: 'd1', reached: (s) => !!s.flags.d1_resuelto },
  { id: 'd2', reached: (s) => !!s.flags.d2_resuelta },
  { id: 'boveda', reached: (s) => s.map.id === 'boveda' },
  { id: 'epilogo', reached: (s) => !!s.flags.epilogo_visto },
];

type Snapshot = { xp: number; level: number };

function curve(combo: Combo, seed = 1): { at: Record<string, Snapshot>; final: Snapshot; wiped: boolean } {
  const at: Record<string, Snapshot> = {};
  const snap = (s: GameState): Snapshot => ({ xp: progressOf(s), level: s.entities.hero?.stats.level ?? 0 });
  const { state, wiped } = runRoute(combo, seed, (s) => {
    for (const m of MILESTONES) if (!at[m.id] && m.reached(s)) at[m.id] = snap(s);
  });
  return { at, final: snap(state), wiped };
}

describe('XP curve: level 3 -> 4 mid-act -> 5 before the final fight', () => {
  it('the thresholds are content, ascending, from level 4', () => {
    const t = Object.entries(levelups.thresholds).map(([l, p]) => [Number(l), p] as const);
    expect(t.map(([l]) => l)).toEqual([4, 5]);
    expect(t[0]![1]).toBeLessThan(t[1]![1]);
  });

  for (const combo of ALL_COMBOS) {
    it(`${comboLabel(combo)}`, () => {
      const { at, final, wiped } = curve(combo);
      // eslint-disable-next-line no-console
      console.log(`${comboLabel(combo)}: ${MILESTONES.map((m) => `${m.id} ${at[m.id] ? `${at[m.id]!.xp}PX/n${at[m.id]!.level}` : '-'}`).join(' | ')} | final ${final.xp}PX/n${final.level}${wiped ? ' (wiped)' : ''}`);
      // A late wipe (mine, Vault) is the no-rests balance issue goldenPathMatrix reports; the
      // curve only needs the party to get to the Vault.
      void wiped;
      expect(at.juicio?.level, 'still level 3 when the trial is settled (level 4 is mid-act, not the prologue)').toBe(3);
      expect(at.d1?.level, 'level 4 by the night of the torches').toBeGreaterThanOrEqual(4);
      expect(at.boveda, 'reaches the Vault').toBeDefined();
      expect(at.boveda!.level, 'level 5 before the final fight').toBe(5);
    }, 120_000);
  }
});
