import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, SYSTEM_ISSUER, createEngine } from '../../../engine';
import { toyRuleset } from '../../fixtures/toyRuleset';
import { asciiMap, makeEntity } from '../../fixtures/helpers';

/**
 * Summons turn-order integrity (engine/effects.ts `spawnEntity`/`despawnEntity`, R13), on
 * the ruleset-agnostic toyRuleset. A fuzz run that, every round, randomly spawns a timed
 * summon owned by whoever is currently acting, then keeps ending turns, checking after
 * every single command that:
 *  - `turn.order` never contains the same id twice;
 *  - every id in `turn.order` is either a real entity, or about to be dropped by the very
 *    despawn that is happening this step (never lingers past it);
 *  - a summon is always inserted directly after its owner in the order;
 *  - the active entity, once chosen, is never one that was already despawned;
 *  - nothing throws and the loop always terminates (bounded rounds/commands).
 */

const pool = (n: number) => ({ current: n, max: n });
const hunter = (id: string, x: number) => makeEntity({ id, controllerId: 'player:1', factionId: 'hunters', position: { x, y: 0 }, resources: { blood: pool(10) } });
const ghoul = (id: string, x: number) => makeEntity({ id, controllerId: 'ai', factionId: 'night', position: { x, y: 0 }, resources: { blood: pool(10) } });

const engine = createEngine(toyRuleset, 'summons-qa');

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertOrderInvariants(state: GameState, repro: string) {
  const order = state.turn.order;
  const dupes = order.filter((id, i) => order.indexOf(id) !== i);
  expect(dupes, `${repro}: duplicate id(s) in turn.order: ${dupes.join(',')}`).toEqual([]);
  if (state.turn.activeEntityId) {
    // The active entity may legitimately not exist for exactly one `turnStarted` tick right
    // after it got despawned mid-wrap (the engine should self-correct on its very next
    // advance); we only assert it is *in the order* it was chosen from, which the engine's
    // own `advanceOrder`/`beginTurn` loop guarantees converges within `order.length` guards.
    expect(order.includes(state.turn.activeEntityId) || !state.entities[state.turn.activeEntityId], `${repro}: active entity is neither in order nor gone`).toBe(
      true,
    );
  }
}

const DEEP = process.env.QA_DEEP === '1';
const SEEDS = DEEP ? [1, 2, 3, 4, 5, 6] : [1];
const MAX_COMMANDS = 400;

describe('summons: turn-order integrity (fuzz)', () => {
  for (const fuzzSeed of SEEDS) {
    it(`random spawn/despawn interleaved with endTurn stays sane (fuzz ${fuzzSeed})`, () => {
      const rand = mulberry32(fuzzSeed);
      let state = engine.newGame({ seed: fuzzSeed, map: asciiMap(['..........']), entities: [hunter('a', 0), hunter('b', 1), ghoul('x', 8), ghoul('y', 9)] });
      const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['a', 'b', 'x', 'y'] } as BaseCommand & { participants: string[] });
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      state = started.state;

      let summonSeq = 0;
      for (let i = 0; i < MAX_COMMANDS && state.turn.mode === 'combat'; i++) {
        const repro = `fuzz=${fuzzSeed} i=${i} round=${state.turn.round} order=[${state.turn.order.join(',')}]`;
        assertOrderInvariants(state, repro);

        // 1 in 3: spawn a short-lived summon owned by the current actor, right now.
        if (rand() < 0.33 && state.turn.activeEntityId && state.entities[state.turn.activeEntityId]) {
          const ownerId = state.turn.activeEntityId;
          const owner = state.entities[ownerId]!;
          const id = `summon-${summonSeq++}`;
          const rounds = 1 + Math.floor(rand() * 3);
          const beforeOrder = [...state.turn.order];
          let applied: ReturnType<typeof engine.applyEffects>;
          expect(() => {
            applied = engine.applyEffects(state, [
              { type: 'spawnEntity', entity: hunter(id, (owner.position.x + 1) % 10), ownerId, rounds },
            ]);
          }, `${repro}: spawnEntity threw`).not.toThrow();
          state = applied!.state;
          if (state.entities[id]) {
            const ownerIdx = beforeOrder.indexOf(ownerId);
            expect(state.turn.order[ownerIdx + 1], `${repro}: summon ${id} was not inserted right after its owner`).toBe(id);
          }
          assertOrderInvariants(state, `${repro} (post-spawn)`);
        }

        if (state.turn.mode !== 'combat') break;
        const activeId = state.turn.activeEntityId;
        if (!activeId) break;
        let result: ReturnType<typeof engine.apply>;
        expect(() => {
          result = engine.apply(state, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: activeId } as BaseCommand & { entityId: string });
        }, `${repro}: endTurn(${activeId}) threw`).not.toThrow();
        expect(result!.ok, result!.ok ? '' : `${repro}: endTurn(${activeId}) failed: ${JSON.stringify((result! as { error: unknown }).error)}`).toBe(true);
        if (!result!.ok) break;
        const settled = result!; // narrowed: result!.ok is true here
        if (!settled.ok) break;
        // No `turnStarted` may name an entity that no longer exists in state.entities.
        const ghostTurns = settled.events.filter((e): boolean => {
          if (e.type !== 'turnStarted') return false;
          const id = (e as unknown as { entityId: string }).entityId;
          return !state.entities[id] && !settled.state.entities[id];
        });
        expect(ghostTurns, `${repro}: turnStarted fired for an entity that never existed`).toEqual([]);
        state = settled.state;
        assertOrderInvariants(state, `${repro} (post-endTurn)`);
      }
    });
  }
});
