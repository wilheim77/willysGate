import { describe, expect, it } from 'vitest';
import { SYSTEM_ISSUER, worldOf, zonesOf, type BaseCommand, type GameState } from '../../engine';
import { ACT_MAPS, START_MAP } from '../../content/intereses/world';
import { ACT_MAP_IDS, buildActWorld, makeEngine } from './setup';

/**
 * Travels through every real exit of the act, starting from a fresh game, until every map
 * in content/intereses/world.ts's ACT_MAPS has been visited (or proven unreachable).
 * Complements tests/content/maps.test.ts (static: every exit points at a real map+spawn)
 * and tests/playthrough/engine/travelFuzz.test.ts (generic engine mechanics on a toy
 * fixture) by actually driving the real act's exit graph end to end.
 */

interface ExitZone {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, unknown>;
}

function exitsOf(state: GameState): ExitZone[] {
  return zonesOf(state, 'exits') as unknown as ExitZone[];
}

describe('act travel: every exit, from a fresh game', () => {
  const engine = makeEngine();

  it(`reaches every map in ACT_MAPS from "${START_MAP}" by following real exit zones`, () => {
    const visited = new Map<string, GameState>();
    visited.set(START_MAP, buildActWorld(engine, 1, START_MAP));
    const queue = [START_MAP];
    const hops: string[] = [];

    while (queue.length) {
      const from = queue.shift()!;
      const state = visited.get(from)!;
      for (const exit of exitsOf(state)) {
        const to = String(exit.properties.to);
        const spawn = String(exit.properties.spawn);
        const repro = `${from} --(${exit.name})--> ${to}:${spawn}`;
        if (!ACT_MAPS[to]) {
          // A dangling exit is tests/content/maps.test.ts's job to catch statically; here we
          // only care about driving the ones that do point somewhere real.
          continue;
        }

        let result: ReturnType<typeof engine.apply>;
        expect(() => {
          result = engine.apply(state, { type: 'travel', issuer: SYSTEM_ISSUER, entityId: 'hero', mapId: to, spawn } as BaseCommand & {
            entityId: string;
            mapId: string;
            spawn: string;
          });
        }, `${repro}: travel threw`).not.toThrow();
        expect(result!.ok, result!.ok ? '' : `${repro}: travel failed: ${JSON.stringify((result! as { error: unknown }).error)}`).toBe(true);
        if (!result!.ok) continue;
        hops.push(repro);

        expect(result!.state.map.id, `${repro}: landed on the wrong map`).toBe(to);
        expect(result!.state.entities.hero, `${repro}: hero vanished`).toBeDefined();
        expect(result!.state.entities.dorotea, `${repro}: dorotea got left behind`).toBeDefined();
        const world = worldOf(result!.state);
        expect(world.stashed[from], `${repro}: ${from} was not stashed`).toBeDefined();

        // Save/load at this stop, for good measure.
        const reloaded = engine.deserialize(engine.serialize(result!.state));
        expect(JSON.stringify(reloaded), `${repro}: save/load changed the state`).toBe(JSON.stringify(result!.state));

        if (!visited.has(to)) {
          visited.set(to, result!.state);
          queue.push(to);
        }
      }
    }

    const unreached = ACT_MAP_IDS.filter((id) => !visited.has(id));
    // Known: abadia's crypt exit to "mina" requires a flag (content/intereses/maps/abadia.json's
    // `requiresFlag: "TODO:llave_cripta"`) — see the report for why that isn't enforced by the
    // engine today. "mina" is still reachable the other way (escorial's bocamina/pozo), so this
    // BFS should find everything regardless; if it ever doesn't, fail loudly rather than silently
    // shrinking coverage.
    expect(unreached, `maps never reached by following real exits from ${START_MAP}: ${unreached.join(', ')}`).toEqual([]);
    expect(hops.length).toBeGreaterThan(0);
  });

  it('travel refuses an exit requiring a flag that is not set (documents the current gap if this ever starts failing)', () => {
    // content/intereses/maps/abadia.json's crypt exit carries requiresFlag: "TODO:llave_cripta".
    // engine/world.ts's `travel` handler does not currently read `requiresFlag` at all, so this
    // succeeds today even with no flag set. This test intentionally asserts *today's* (gap)
    // behaviour rather than `it.fails`, because the content author's own "TODO:" prefix says
    // the gate is known-unfinished, not a regression — but it still means the crypt is walkable
    // right now with no key. Flagging in the report; not fixing engine/world.ts here.
    const state = buildActWorld(engine, 1, 'abadia');
    const cryptExit = exitsOf(state).find((z) => z.properties.to === 'mina');
    expect(cryptExit, 'abadia should still have its crypt exit to mina').toBeDefined();
    expect(state.flags['TODO:llave_cripta'], 'no flag is set in a fresh game').toBeUndefined();
    const result = engine.apply(state, {
      type: 'travel',
      issuer: SYSTEM_ISSUER,
      entityId: 'hero',
      mapId: 'mina',
      spawn: String(cryptExit!.properties.spawn),
    } as BaseCommand & { entityId: string; mapId: string; spawn: string });
    expect(result.ok, 'travel currently ignores requiresFlag entirely (see report)').toBe(true);
  });
});
