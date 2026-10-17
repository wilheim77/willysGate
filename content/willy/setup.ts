import { type CreationChoices, type Engine, type Entity, type GameState, type JsonValue, type MapBuilder, type MapSetup, type Vec2, withLighting, withZones } from '../../engine';
import { buildWilly, createWilly } from '../../rulesets/willy';
import { generateFloor } from './gen/floor';
import type { RivalRecord } from './gen/rivals';
import { MAPS } from './maps';

/**
 * The game's start and the casting, without any client imports (so tests and a future server
 * can use them). content/willy/game.ts wires these into the GameDefinition.
 *
 * Each floor is generated when Willy first arrives (R21: the map builder sees the state), from
 * the run's seed and what happened before: the rivals already met, and whether they were beaten,
 * made a pact with or ran away. Once built, a floor stays in the world's stash like any map, so
 * a save keeps it as it was even if the generator changes later.
 */

export const PLAYER = 'player:1';
export const FACTION = 'concursantes';

/** The floors of a season. */
export const FLOORS = [1, 2, 3, 4, 5];

export function rivalsOf(state: GameState | undefined): RivalRecord[] {
  return ((state?.systems?.rivals as unknown as RivalRecord[] | undefined) ?? []).slice();
}

/**
 * Floor `n` for this run. Its systems carry the updated rival list (a new rival, or one coming
 * back), which travel merges into the state when Willy arrives.
 */
export function buildFloor(n: number, state: GameState | undefined): MapSetup {
  const rivals = rivalsOf(state);
  const floor = generateFloor(state?.seed ?? 0, n, { rivals });
  if (!floor.rival) return floor.setup;
  const others = rivals.filter((r) => r.id !== floor.rival!.id);
  return { ...floor.setup, systems: { ...floor.setup.systems, rivals: [...others, floor.rival] as unknown as JsonValue } };
}

/** Map builders for the engine's travel command (EngineContent.maps). */
export const maps: Record<string, MapBuilder> = {
  ...MAPS,
  ...Object.fromEntries(FLOORS.map((n) => [`planta-${n}`, (ctx?: { state: GameState }) => buildFloor(n, ctx?.state)])),
};

function startOn(setup: MapSetup, base: GameState): GameState {
  const systems = setup.systems ?? {};
  let state: GameState = {
    ...base,
    systems: { ...base.systems, rivals: [] as unknown as JsonValue, ...systems, spawns: setup.spawns as unknown as JsonValue, world: { current: setup.map.id, stashed: {} } as unknown as JsonValue },
  };
  if (systems.lighting) state = withLighting(state, systems.lighting as never);
  if (systems.zones) state = withZones(state, systems.zones as never);
  return state;
}

/**
 * A new season: Willy (a Butanero until the casting) in the Camerino. `start` (the client's
 * ?mapa=) begins on another map: a floor ('planta-3') or 'prueba-castro'.
 */
export function newWillyGame(engine: Engine, seed: number, options?: { start?: string }): GameState {
  const startId = options?.start && maps[options.start] ? options.start : 'camerino';
  // A floor needs the seed: build it against a bare state that carries it.
  const start = maps[startId]!({ state: { seed: seed >>> 0, systems: {} } as unknown as GameState });
  const at: Vec2 = start.spawns.llegada ?? Object.values(start.spawns)[0] ?? { x: 1, y: 1 };
  const willyEntity: Entity = createWilly({ id: 'willy', controllerId: PLAYER, factionId: FACTION, position: at, spriteId: 'willy-butanero', classId: 'butanero' });
  const base = engine.newGame({ seed, map: start.map, entities: [willyEntity, ...start.entities] });
  return startOn(start, base);
}

/** The casting: Willy is rebuilt in place with the chosen class (same spot, id and controller). */
export function applyCasting(state: GameState, choices: CreationChoices): GameState {
  const w = state.entities.willy!;
  const built = buildWilly(choices, { id: w.id, controllerId: w.controllerId, factionId: w.factionId, position: w.position });
  return { ...state, entities: { ...state.entities, willy: built } };
}
