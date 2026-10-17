import { describe, expect, it } from 'vitest';
import { SYSTEM_ISSUER, nextAiCommand, occupies, type BaseCommand, type GameState } from '../../../engine';
import { willy } from '../../../rulesets/willy';
import { ARENA_IDS, ENEMY_IDS, PARTY_IDS, buildWorld, engine } from './setup';

/**
 * AI vs AI combat soak for the Willy ruleset: every class vs a pack of rats, on every
 * arena (plain, a raised platform, a wall to route around, and a void pit to push
 * creatures into). Same invariants as the Intereses combat soak.
 */

const DEEP = process.env.QA_DEEP === '1';
const SEEDS = DEEP ? Array.from({ length: 12 }, (_, i) => i + 1) : [1, 2];
const MAX_ROUNDS = 80;
const MAX_COMMANDS = 3000;

function assertSaneState(state: GameState, repro: string) {
  const standing = Object.values(state.entities).filter((e) => occupies(willy, e));
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

describe('Willy combat soak (AI vs AI, every class)', () => {
  for (const arenaId of ARENA_IDS) {
    for (const seed of SEEDS) {
      it(`every class vs rats on arena "${arenaId}" terminates cleanly (seed ${seed})`, () => {
        const world = buildWorld(seed, arenaId);
        const participants = [...PARTY_IDS, ...ENEMY_IDS];
        const started = engine.apply(world, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants } as BaseCommand & { participants: string[] });
        expect(started.ok, started.ok ? '' : `startCombat failed: ${JSON.stringify(started.error)}`).toBe(true);
        if (!started.ok) return;

        let state = started.state;
        const commands: BaseCommand[] = [];
        let guard = 0;
        while (state.turn.mode === 'combat') {
          guard++;
          const repro = `arena=${arenaId} seed=${seed} round=${state.turn.round} commandsSoFar=${commands.length}`;
          expect(guard, `${repro}: exceeded ${MAX_COMMANDS} commands without the fight ending`).toBeLessThanOrEqual(MAX_COMMANDS);
          expect(state.turn.round, `${repro}: exceeded ${MAX_ROUNDS} rounds`).toBeLessThanOrEqual(MAX_ROUNDS);

          const activeId = state.turn.activeEntityId;
          expect(activeId, `${repro}: in combat with no active entity`).toBeTruthy();
          let cmd: BaseCommand;
          expect(() => {
            cmd = nextAiCommand(willy, state, activeId!);
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

        expect(state.turn.mode, `arena=${arenaId} seed=${seed}: combat never ended after ${commands.length} commands`).toBe('exploration');

        // Deterministic replay.
        const replayWorld = buildWorld(seed, arenaId);
        const replayStart = engine.apply(replayWorld, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants } as BaseCommand & { participants: string[] });
        expect(replayStart.ok).toBe(true);
        if (!replayStart.ok) return;
        let replayState = replayStart.state;
        for (const [i, cmd] of commands.entries()) {
          const r = engine.apply(replayState, cmd);
          expect(r.ok, `arena=${arenaId} seed=${seed}: replay diverged at command #${i}`).toBe(true);
          if (r.ok) replayState = r.state;
        }
        expect(JSON.stringify(replayState), `arena=${arenaId} seed=${seed}: replay produced a different final state`).toBe(JSON.stringify(state));
      });
    }
  }
});
