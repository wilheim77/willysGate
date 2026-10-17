import { describe, expect, it } from 'vitest';
import { SYSTEM_ISSUER, nextAiCommand, worldOf, type BaseCommand } from '../../engine';
import { dnd5e } from '../../rulesets/dnd5e';
import { PARTY_IDS, buildActWorld, buildTestWorld, hostileGroups, makeEngine } from './setup';

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

function soakWithCheckpoints(engine: ReturnType<typeof makeEngine>, label: string, seed: number, state: ReturnType<typeof buildTestWorld>, participants: string[]) {
  const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants } as BaseCommand & { participants: string[] });
  expect(started.ok, started.ok ? '' : `${label}: startCombat failed`).toBe(true);
  if (!started.ok) return;

  let s = started.state;
  let step = 0;
  let checkpoints = 0;
  while (s.turn.mode === 'combat' && step < 400 && checkpoints < 15) {
    step++;
    if (step % CHECKPOINT_EVERY === 0) {
      checkpoints++;
      const json = engine.serialize(s);
      let reloaded: ReturnType<typeof engine.deserialize>;
      expect(() => (reloaded = engine.deserialize(json)), `${label} seed=${seed} step=${step}: deserialize threw`).not.toThrow();
      expect(JSON.stringify(reloaded!), `${label} seed=${seed} step=${step}: reloaded state differs from the saved one`).toBe(JSON.stringify(s));

      // The reloaded copy must behave identically going forward: same next AI command.
      const activeId = s.turn.activeEntityId!;
      const fromOriginal = nextAiCommand(dnd5e, s, activeId);
      const fromReloaded = nextAiCommand(dnd5e, reloaded!, activeId);
      expect(JSON.stringify(fromReloaded), `${label} seed=${seed} step=${step}: reloaded state picks a different AI command`).toBe(JSON.stringify(fromOriginal));
    }

    const activeId = s.turn.activeEntityId!;
    const cmd = nextAiCommand(dnd5e, s, activeId);
    const result = engine.apply(s, cmd);
    expect(result.ok, `${label} seed=${seed} step=${step}: AI command failed`).toBe(true);
    if (!result.ok) break;
    s = result.state;
  }
  expect(checkpoints, `${label} seed=${seed}: fight ended too fast to exercise any checkpoint`).toBeGreaterThan(0);
}

describe('save/load roundtrip', () => {
  const engine = makeEngine();

  for (const seed of SEEDS) {
    it(`legacy test arena survives serialize/deserialize at several checkpoints (seed ${seed})`, () => {
      soakWithCheckpoints(engine, 'test', seed, buildTestWorld(engine, seed), [...PARTY_IDS, 'garran', 'anselmo', 'bandit-1', 'bandit-2', 'thug', 'skeleton']);
    });

    it(
      `real act map ("escorial") survives serialize/deserialize at several checkpoints (seed ${seed})`,
      () => {
        // Escorial's roster has grown with the content (now several Sinpaga plus a Callado),
        // so this fight takes meaningfully longer than the other checkpoints here.
        const world = buildActWorld(engine, seed, 'escorial');
        const groups = hostileGroups(world);
        const participants = [...PARTY_IDS, ...Object.values(groups).flat()];
        soakWithCheckpoints(engine, 'escorial', seed, world, participants);
      },
      15000,
    );
  }

  it('save/load survives a map change (systems.world stash/restore)', () => {
    const engine2 = makeEngine();
    const start = buildActWorld(engine2, 1, 'camino');
    const result = engine2.apply(start, { type: 'travel', issuer: SYSTEM_ISSUER, entityId: 'hero', mapId: 'plaza', spawn: 'entry-camino' } as BaseCommand & {
      entityId: string;
      mapId: string;
      spawn: string;
    });
    expect(result.ok, result.ok ? '' : `travel failed: ${JSON.stringify((result as { error: unknown }).error)}`).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.id).toBe('plaza');
    expect(worldOf(result.state).stashed.camino, 'camino should be stashed after leaving it').toBeDefined();
    const reloaded = engine2.deserialize(engine2.serialize(result.state));
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(result.state));
  });
});
