import { describe, expect, it } from 'vitest';
import { SYSTEM_ISSUER, nextAiCommand, type BaseCommand } from '../../engine';
import { dnd5e } from '../../rulesets/dnd5e';
import { buildWorld, ENEMY_IDS, makeEngine, PARTY_IDS } from './setup';

/**
 * Save/load roundtrip: at random points during a combat run, serializing then
 * deserializing must reproduce the exact same state (and the game must be able to keep
 * going from the deserialized copy exactly as from the original).
 */

// Heavy run: `QA_DEEP=1 npm run test:qa`. Plain `npm test`/`npm run check` only runs a
// light smoke pass so the regular dev loop stays fast.
const DEEP = process.env.QA_DEEP === '1';
const SEEDS = DEEP ? [1, 2, 3, 4, 5] : [1];
const CHECKPOINT_EVERY = 7;

describe('save/load roundtrip', () => {
  const engine = makeEngine();

  for (const seed of SEEDS) {
    it(`combat state survives serialize/deserialize at several checkpoints (seed ${seed})`, () => {
      const world = buildWorld(engine, seed);
      const participants = [...PARTY_IDS, ...ENEMY_IDS];
      const started = engine.apply(world, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants } as BaseCommand & { participants: string[] });
      expect(started.ok).toBe(true);
      if (!started.ok) return;

      let state = started.state;
      let step = 0;
      let checkpoints = 0;
      while (state.turn.mode === 'combat' && step < 400 && checkpoints < 15) {
        step++;
        if (step % CHECKPOINT_EVERY === 0) {
          checkpoints++;
          const json = engine.serialize(state);
          let reloaded: ReturnType<typeof engine.deserialize>;
          expect(() => (reloaded = engine.deserialize(json)), `seed=${seed} step=${step}: deserialize threw`).not.toThrow();
          expect(JSON.stringify(reloaded!), `seed=${seed} step=${step}: reloaded state differs from the saved one`).toBe(JSON.stringify(state));

          // The reloaded copy must behave identically going forward: same next AI command.
          const activeId = state.turn.activeEntityId!;
          const fromOriginal = nextAiCommand(dnd5e, state, activeId);
          const fromReloaded = nextAiCommand(dnd5e, reloaded!, activeId);
          expect(JSON.stringify(fromReloaded), `seed=${seed} step=${step}: reloaded state picks a different AI command`).toBe(JSON.stringify(fromOriginal));
        }

        const activeId = state.turn.activeEntityId!;
        const cmd = nextAiCommand(dnd5e, state, activeId);
        const result = engine.apply(state, cmd);
        expect(result.ok, `seed=${seed} step=${step}: AI command failed`).toBe(true);
        if (!result.ok) break;
        state = result.state;
      }
      expect(checkpoints, `seed=${seed}: fight ended too fast to exercise any checkpoint`).toBeGreaterThan(0);
    });
  }
});
