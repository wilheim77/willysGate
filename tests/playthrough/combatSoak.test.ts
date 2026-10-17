import { describe, expect, it } from 'vitest';
import {
  SYSTEM_ISSUER,
  nextAiCommand,
  occupies,
  type BaseCommand,
  type GameState,
} from '../../engine';
import { dnd5e } from '../../rulesets/dnd5e';
import { ACT_MAP_IDS, PARTY_IDS, buildActWorld, buildTestWorld, hostileGroups, makeEngine } from './setup';

/**
 * AI vs AI combat soak, on every map that actually ships a hostile faction standing from
 * the start (party vs. noncombatant NPCs never "fights": nobody considers the other side
 * hostile, so it would just stall to the round cap — that is a harness false positive, not
 * a bug, so those maps are skipped and logged instead). Both sides are driven by the
 * generic `nextAiCommand`. Every command applied must stay ok; the fight must end; no
 * entity may double up on a tile; no resource may go negative; and replaying the exact
 * same command list on a fresh state from the same seed must reproduce the final state
 * exactly (determinism of the seeded RNG through the whole command log).
 */

// Heavy run: `QA_DEEP=1 npm run test:qa`. Plain `npm test`/`npm run check` only runs a
// light smoke pass so the regular dev loop stays fast.
const DEEP = process.env.QA_DEEP === '1';
const SEEDS = DEEP ? Array.from({ length: 20 }, (_, i) => i + 1) : [1, 2];
const MAX_ROUNDS = 60;
const MAX_COMMANDS = 2000;

function assertSaneState(state: GameState, repro: string) {
  const standing = Object.values(state.entities).filter((e) => occupies(dnd5e, e));
  const seen = new Map<string, string>();
  for (const e of standing) {
    const key = `${e.position.x},${e.position.y}`;
    expect(seen.has(key), `${repro}: ${e.id} and ${seen.get(key)} both occupy ${key}`).toBe(false);
    seen.set(key, e.id);
  }
  for (const e of Object.values(state.entities)) {
    for (const [resource, pool] of Object.entries(e.resources)) {
      expect(pool.current, `${repro}: ${e.id}.${resource} went negative (${pool.current})`).toBeGreaterThanOrEqual(0);
      expect(pool.current, `${repro}: ${e.id}.${resource} exceeds its max`).toBeLessThanOrEqual(pool.max);
    }
  }
}

function runSoak(engine: ReturnType<typeof makeEngine>, buildWorld: (seed: number) => GameState, label: string, seed: number, participants: string[]) {
  const world = buildWorld(seed);
  const started = engine.apply(world, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants } as BaseCommand & { participants: string[] });
  expect(started.ok, started.ok ? '' : `${label}: startCombat failed: ${JSON.stringify((started as { error: unknown }).error)}`).toBe(true);
  if (!started.ok) return;

  let state = started.state;
  const commands: BaseCommand[] = [];
  let guard = 0;
  while (state.turn.mode === 'combat') {
    guard++;
    const repro = `${label} seed=${seed} round=${state.turn.round} commandsSoFar=${commands.length}`;
    expect(guard, `${repro}: exceeded ${MAX_COMMANDS} commands without the fight ending`).toBeLessThanOrEqual(MAX_COMMANDS);
    expect(state.turn.round, `${repro}: exceeded ${MAX_ROUNDS} rounds`).toBeLessThanOrEqual(MAX_ROUNDS);

    const activeId = state.turn.activeEntityId;
    expect(activeId, `${repro}: in combat with no active entity`).toBeTruthy();
    let cmd: BaseCommand;
    expect(() => {
      cmd = nextAiCommand(dnd5e, state, activeId!);
    }, `${repro}: nextAiCommand threw for ${activeId}`).not.toThrow();

    let result: ReturnType<typeof engine.apply>;
    expect(() => {
      result = engine.apply(state, cmd!);
    }, `${repro}: applying AI command ${JSON.stringify(cmd!)} threw`).not.toThrow();
    expect(result!.ok, result!.ok ? '' : `${repro}: AI command ${JSON.stringify(cmd!)} failed: ${JSON.stringify((result! as { error: unknown }).error)}`).toBe(
      true,
    );
    if (!result!.ok) break;

    commands.push(cmd!);
    state = result!.state;
    assertSaneState(state, repro);
  }

  expect(state.turn.mode, `${label} seed=${seed}: combat never ended after ${commands.length} commands`).toBe('exploration');

  // Deterministic replay: same seed, same command log, same final state.
  const replayStart = engine.apply(buildWorld(seed), { type: 'startCombat', issuer: SYSTEM_ISSUER, participants } as BaseCommand & { participants: string[] });
  expect(replayStart.ok).toBe(true);
  if (!replayStart.ok) return;
  let replayState = replayStart.state;
  for (const [i, cmd] of commands.entries()) {
    const r = engine.apply(replayState, cmd);
    expect(r.ok, `${label} seed=${seed}: replay diverged at command #${i} (${JSON.stringify(cmd)})`).toBe(true);
    if (r.ok) replayState = r.state;
  }
  expect(JSON.stringify(replayState), `${label} seed=${seed}: replay produced a different final state than the original run`).toBe(JSON.stringify(state));
}

describe('combat soak (AI vs AI)', () => {
  const engine = makeEngine();

  for (const mapId of ACT_MAP_IDS) {
    // Compute once (seed doesn't affect which factions exist) just to decide whether to skip.
    const groups = hostileGroups(buildActWorld(engine, 1, mapId));
    const hostileFactions = Object.keys(groups);
    if (hostileFactions.length === 0) {
      it.skip(`${mapId}: no hostile faction present at a fresh game (noncombatant until a dialogue starts the fight) - nothing to soak here`, () => {});
      continue;
    }
    const participants = [...PARTY_IDS, ...hostileFactions.flatMap((f) => groups[f]!)];
    for (const seed of SEEDS) {
      it(`${mapId}: party vs ${hostileFactions.join('+')} terminates cleanly (seed ${seed})`, () => {
        runSoak(engine, (s) => buildActWorld(engine, s, mapId), mapId, seed, participants);
      });
    }
  }

  // The legacy generic test arena still ships with the game (?mapa=test); keep soaking it too.
  for (const seed of SEEDS) {
    it(`test: the legacy generic arena terminates cleanly (seed ${seed})`, () => {
      runSoak(engine, (s) => buildTestWorld(engine, s), 'test', seed, [...PARTY_IDS, 'garran', 'anselmo', 'bandit-1', 'bandit-2', 'thug', 'skeleton']);
    });
  }
});
