import { describe, expect, it } from 'vitest';
import { worldOf, zonesOf, type BaseCommand, type GameState } from '../../engine';
import { ACT_MAPS, START_MAP } from '../../content/intereses/world';
import { ACT_MAP_IDS, buildActWorld, makeEngine } from './setup';

/**
 * Travels through every real exit of the act, starting from a fresh game, until every map
 * in content/intereses/world.ts's ACT_MAPS has been visited (or proven unreachable) -
 * issued as the player (not the system), so `travel`'s `requiresFlag`/`unlessFlag` gate
 * (engine/world.ts) is genuinely exercised: hero has to be standing on the exit, and any
 * flag the exit needs is set directly on the state first (this file is about the gate
 * mechanism and the map graph, not about *how* a player earns each flag through dialogue -
 * that's goldenPath.test.ts).
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

/** Places `hero` on the exit's tile and sets/clears whatever flag it gates on. Teleports
 *  rather than pathfinding there: some exits sit behind their own obstacle (a closed door
 *  prop, opened by its own dialogue) - a *separate* gate from the one this file is about
 *  (the `requiresFlag`/`unlessFlag` check in engine/world.ts's `travel`), and whether every
 *  exit is physically walkable is tests/content/maps.test.ts's job, not this one's. */
function openAndStandAt(state: GameState, exit: ExitZone): GameState {
  const req = exit.properties.requiresFlag;
  const unless = exit.properties.unlessFlag;
  return {
    ...state,
    flags: { ...state.flags, ...(req ? { [String(req)]: true } : {}), ...(unless ? { [String(unless)]: false } : {}) },
    entities: { ...state.entities, hero: { ...state.entities.hero!, position: { x: exit.x, y: exit.y } } },
  };
}

describe('act travel: every exit, from a fresh game', () => {
  const engine = makeEngine();

  it(`reaches every map in ACT_MAPS from "${START_MAP}" by following real exit zones as the player`, () => {
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

        const standingOnIt = openAndStandAt(state, exit);
        let result: ReturnType<typeof engine.apply>;
        expect(() => {
          result = engine.apply(standingOnIt, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: to, spawn } as BaseCommand & {
            entityId: string;
            mapId: string;
            spawn: string;
          });
        }, `${repro}: travel threw`).not.toThrow();
        expect(result!.ok, result!.ok ? '' : `${repro}: travel failed with its gate open: ${JSON.stringify((result! as { error: unknown }).error)}`).toBe(true);
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
    expect(unreached, `maps never reached by following real exits from ${START_MAP}: ${unreached.join(', ')}`).toEqual([]);
    expect(hops.length).toBeGreaterThan(0);
  });

  it('refuses a gated exit when its flag is not set, and admits it once the flag is', () => {
    const state = buildActWorld(engine, 1, 'plaza');
    const toAbadia = exitsOf(state).find((z) => z.properties.to === 'abadia')!;
    expect(toAbadia.properties.requiresFlag, 'plaza -> abadia should still require audiencia_concedida').toBe('audiencia_concedida');
    expect(state.flags.audiencia_concedida, 'no flag is set in a fresh game').toBeUndefined();

    const standing: GameState = { ...state, entities: { ...state.entities, hero: { ...state.entities.hero!, position: { x: toAbadia.x, y: toAbadia.y } } } };

    const blocked = engine.apply(standing, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: 'abadia', spawn: String(toAbadia.properties.spawn) } as BaseCommand & {
      entityId: string;
      mapId: string;
      spawn: string;
    });
    expect(blocked.ok, 'travel should refuse a gated exit with the flag unset').toBe(false);

    const withFlag: GameState = { ...standing, flags: { ...standing.flags, audiencia_concedida: true } };
    const allowed = engine.apply(withFlag, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: 'abadia', spawn: String(toAbadia.properties.spawn) } as BaseCommand & {
      entityId: string;
      mapId: string;
      spawn: string;
    });
    expect(allowed.ok, allowed.ok ? '' : `travel should succeed once the flag is set: ${JSON.stringify((allowed as { error: unknown }).error)}`).toBe(true);
  });

  it('abadia\'s crypt exit to mina is now gated on the real "llave_cripta" flag (d1_abadia_final grants it)', () => {
    // Was a placeholder "TODO:llave_cripta" (never settable) when this test was first
    // written; the content has since been finished with the real flag name, granted by
    // defending the abbey (d1_abadia_final.json). This test now checks the real gate both
    // ways, and would need updating again if the flag name or its source ever changes.
    const state = buildActWorld(engine, 1, 'abadia');
    const cryptExit = exitsOf(state).find((z) => z.properties.to === 'mina')!;
    expect(cryptExit.properties.requiresFlag).toBe('llave_cripta');
    const setters = Object.entries(engine.content.dialogues).filter(([, tree]) =>
      Object.values(tree.nodes).some(
        (node) =>
          (node.effects ?? []).some((e) => e.type === 'setFlag' && e.flag === 'llave_cripta') ||
          (node.choices ?? []).some((c) => (c.effects ?? []).some((e) => e.type === 'setFlag' && e.flag === 'llave_cripta')),
      ),
    );
    expect(setters.map(([id]) => id), 'nothing grants llave_cripta any more').toContain('d1_abadia_final');

    const standing: GameState = { ...state, entities: { ...state.entities, hero: { ...state.entities.hero!, position: { x: cryptExit.x, y: cryptExit.y } } } };
    const blocked = engine.apply(standing, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: 'mina', spawn: String(cryptExit.properties.spawn) } as BaseCommand & {
      entityId: string;
      mapId: string;
      spawn: string;
    });
    expect(blocked.ok, 'the crypt should stay closed with no key').toBe(false);

    const withKey: GameState = { ...standing, flags: { ...standing.flags, llave_cripta: true } };
    const allowed = engine.apply(withKey, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: 'mina', spawn: String(cryptExit.properties.spawn) } as BaseCommand & {
      entityId: string;
      mapId: string;
      spawn: string;
    });
    expect(allowed.ok, allowed.ok ? '' : `the crypt should open with the key: ${JSON.stringify((allowed as { error: unknown }).error)}`).toBe(true);
  });
});
