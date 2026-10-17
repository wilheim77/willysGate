import { describe, expect, it } from 'vitest';
import {
  type BaseCommand,
  type GameState,
  type MapSetup,
  createEngine,
  withZones,
  worldOf,
} from '../../../engine';
import { toyRuleset } from '../../fixtures/toyRuleset';
import { asciiMap, makeEntity } from '../../fixtures/helpers';

/**
 * Multi-map travel fuzz (engine/world.ts), on the deliberately non-D&D toyRuleset so this
 * stays provably ruleset-agnostic. Three maps in a loop (village -> mine -> cave -> village),
 * each with its own resident NPC and an exit zone to the next. A party of two wanders back
 * and forth at random; invariants checked after every hop:
 *  - exactly one map loaded, the rest stashed;
 *  - a stashed map's residents are byte-identical when revisited (nobody moves while offstage);
 *  - no entity id exists twice (loaded + stashed, or in two stashes);
 *  - the travelling party is never left behind or duplicated;
 *  - save/load survives at every stop.
 */

const pool = (n: number) => ({ current: n, max: n });

function residents(mapId: string): MapSetup {
  return {
    map: asciiMap(['......'], mapId),
    entities: [makeEntity({ id: `${mapId}-local`, controllerId: 'ai', factionId: 'locals', position: { x: 3, y: 0 }, resources: { blood: pool(5) } })],
    spawns: { in: { x: 0, y: 0 } },
  };
}

const MAPS = ['village', 'mine', 'cave'];
const NEXT: Record<string, string> = { village: 'mine', mine: 'cave', cave: 'village' };

const engine = createEngine(toyRuleset, 'travel-qa', { dialogues: {}, maps: Object.fromEntries(MAPS.map((m) => [m, () => residents(m)])) });

function initialWorld(): GameState {
  // One exit zone is stamped at the party's current position before each hop in the test
  // body (zones are per-map state, stashed/restored with everything else), so the party can
  // always "stand on" the exit it is about to use.
  const s = engine.newGame({
    seed: 1,
    map: asciiMap(['......'], 'village'),
    entities: [
      makeEntity({ id: 'hero', controllerId: 'player:1', factionId: 'party', position: { x: 5, y: 0 }, resources: { blood: pool(6) } }),
      makeEntity({ id: 'ally', controllerId: 'player:1', factionId: 'party', position: { x: 4, y: 0 }, resources: { blood: pool(6) } }),
      makeEntity({ id: 'village-local', controllerId: 'ai', factionId: 'locals', position: { x: 3, y: 0 }, resources: { blood: pool(5) } }),
    ],
  });
  // Unlike the other maps (built fresh by a MapBuilder, which stamps `in`), the starting map
  // is loaded directly through newGame, so it needs its own named spawn for when the loop
  // comes back around to it.
  return { ...s, systems: { ...s.systems, spawns: { in: { x: 0, y: 0 } } } };
}

const HOPS = 30;

describe('multi-map travel fuzz', () => {
  it(`wanders ${HOPS} hops around a 3-map loop without breaking stash/restore invariants`, () => {
    let state = initialWorld();
    const visited = new Set<string>([state.map.id]);

    for (let hop = 0; hop < HOPS; hop++) {
      const from = state.map.id;
      const to = NEXT[from]!;
      // Stamp the current map's exit at the party's arrival tile (0,0 on every map but the
      // first, (5,0) on village) so `travel`'s "standing on the exit" check always succeeds.
      const heroPos = state.entities.hero!.position;
      state = withZones(state, [{ name: `to-${to}`, layer: 'exits', x: heroPos.x, y: heroPos.y, width: 1, height: 1, properties: { to, spawn: 'in' } }]);

      const repro = `hop=${hop} from=${from} to=${to}`;
      let result: ReturnType<typeof engine.apply>;
      expect(() => {
        result = engine.apply(state, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: to, spawn: 'in' } as BaseCommand & { entityId: string; mapId: string; spawn: string });
      }, `${repro}: travel threw`).not.toThrow();
      expect(result!.ok, result!.ok ? '' : `${repro}: travel failed: ${JSON.stringify((result! as { error: unknown }).error)}`).toBe(true);
      if (!result!.ok) break;
      state = result!.state;
      const previouslyVisited = new Set(visited);
      visited.add(to);

      // --- Invariants ---
      expect(state.map.id, `${repro}: loaded map is not the destination`).toBe(to);
      const world = worldOf(state);
      expect(world.current, `${repro}: world.current disagrees with state.map.id`).toBe(to);
      expect(world.stashed[to], `${repro}: the map we just loaded is also still in the stash`).toBeUndefined();

      // Every id appears exactly once across (loaded entities) + (every stash's entities).
      const allIds: string[] = [...Object.keys(state.entities), ...Object.values(world.stashed).flatMap((m) => Object.keys(m.entities))];
      const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
      expect(dupes, `${repro}: duplicate entity id(s) across loaded+stashed: ${dupes.join(',')}`).toEqual([]);

      // The travelling party (hero, ally) is on the new map; everyone's local resident stayed
      // stashed with their own map, untouched (still full blood, still at (3,0)).
      expect(state.entities.hero, `${repro}: hero went missing`).toBeDefined();
      expect(state.entities.ally, `${repro}: ally went missing`).toBeDefined();
      expect(state.entities.hero!.position, `${repro}: hero did not land near the "in" spawn`).toEqual({ x: 0, y: 0 });
      for (const mapId of previouslyVisited) {
        if (mapId === to) continue;
        const stashedResident = world.stashed[mapId]?.entities[`${mapId}-local`];
        expect(stashedResident, `${repro}: ${mapId}'s resident vanished while stashed`).toBeDefined();
        if (stashedResident) {
          expect(stashedResident.resources.blood, `${repro}: ${mapId}'s stashed resident's blood changed while offstage`).toEqual(pool(5));
          expect(stashedResident.position, `${repro}: ${mapId}'s stashed resident moved while offstage`).toEqual({ x: 3, y: 0 });
        }
      }
      const currentResident = state.entities[`${to}-local`];
      expect(currentResident, `${repro}: ${to}'s own resident is missing on its own map`).toBeDefined();

      // Save/load roundtrip at every stop.
      const reloaded = engine.deserialize(engine.serialize(state));
      expect(JSON.stringify(reloaded), `${repro}: save/load roundtrip changed the state`).toBe(JSON.stringify(state));
    }

    expect(visited.size, 'the fuzz never actually left the starting map').toBeGreaterThan(1);
  });

  it('cannot travel to the map already loaded, or to an unknown map, or mid-combat', () => {
    const state = initialWorld();
    expect(engine.apply(state, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: 'village', spawn: 'in' } as BaseCommand & { entityId: string; mapId: string; spawn: string }).ok).toBe(false);
    expect(engine.apply(state, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: 'nowhere', spawn: 'in' } as BaseCommand & { entityId: string; mapId: string; spawn: string }).ok).toBe(false);
    const fighting: GameState = { ...state, turn: { ...state.turn, mode: 'combat', order: ['hero', 'village-local'] } };
    const withExit = withZones(fighting, [{ name: 'to-mine', layer: 'exits', x: 5, y: 0, width: 1, height: 1, properties: { to: 'mine', spawn: 'in' } }]);
    expect(engine.apply(withExit, { type: 'travel', issuer: 'player:1', entityId: 'hero', mapId: 'mine', spawn: 'in' } as BaseCommand & { entityId: string; mapId: string; spawn: string }).ok).toBe(false);
  });
});
