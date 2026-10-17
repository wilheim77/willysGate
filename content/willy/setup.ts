import { type CreationChoices, type Engine, type Entity, type GameState, type JsonValue, type MapBuilder, type MapSetup, type Vec2, withLighting, withZones } from '../../engine';
import { buildWilly, createWilly } from '../../rulesets/willy';
import { generateFloor } from './gen/floor';
import type { RivalRecord } from './gen/rivals';
import { MAPS } from './maps';

/**
 * The game's start and the casting, without any client imports (so tests and a future server
 * can use them). content/willy/game.ts wires these into the GameDefinition.
 *
 * The floors are generated from the run's seed when the season starts and kept in the world's
 * stash (systems.world.stashed), so the service lift finds them and a save keeps them byte for
 * byte, even if the generator changes later. MapBuilder takes no arguments, so it can't know
 * the run's seed: the builder for 'planta-1' below is only a fallback (ENGINE_REQUESTS R21).
 */

export const PLAYER = 'player:1';
export const FACTION = 'concursantes';

/** The floors generated so far (planta-1 for now; 2-5 when their room chunks exist). */
export const GENERATED_FLOORS = [1];

/** Map builders for the engine's travel command (EngineContent.maps). */
export const maps: Record<string, MapBuilder> = {
  ...MAPS,
  'planta-1': () => generateFloor(0, 1).setup,
};

function startOn(setup: MapSetup, base: GameState, stashed: Record<string, JsonValue>): GameState {
  const systems = setup.systems ?? {};
  let state: GameState = { ...base, systems: { ...base.systems, ...systems, spawns: setup.spawns as unknown as JsonValue, world: { current: setup.map.id, stashed } as unknown as JsonValue } };
  if (systems.lighting) state = withLighting(state, systems.lighting as never);
  if (systems.zones) state = withZones(state, systems.zones as never);
  return state;
}

function stash(setup: MapSetup): JsonValue {
  return { map: setup.map, entities: Object.fromEntries(setup.entities.map((e) => [e.id, e])), systems: { ...(setup.systems ?? {}), spawns: setup.spawns } } as unknown as JsonValue;
}

/** Every floor of the run, generated in order (later floors know the earlier rivals). */
export function generateRun(seed: number): { floors: Record<string, MapSetup>; rivals: RivalRecord[] } {
  const floors: Record<string, MapSetup> = {};
  const rivals: RivalRecord[] = [];
  for (const n of GENERATED_FLOORS) {
    const floor = generateFloor(seed, n, { rivals });
    floors[`planta-${n}`] = floor.setup;
    if (floor.rival) rivals.push(floor.rival);
  }
  return { floors, rivals };
}

/**
 * A new season: Willy (a Butanero until the casting) in the Camerino, with the floors already
 * generated. `start` (the client's ?mapa=) begins on another map: a floor or 'prueba-castro'.
 */
export function newWillyGame(engine: Engine, seed: number, options?: { start?: string }): GameState {
  const { floors, rivals } = generateRun(seed);
  const builders: Record<string, () => MapSetup> = { ...MAPS, ...Object.fromEntries(Object.entries(floors).map(([id, f]) => [id, () => f])) };
  const startId = options?.start && builders[options.start] ? options.start : 'camerino';
  const start = builders[startId]!();
  const at: Vec2 = start.spawns.llegada ?? Object.values(start.spawns)[0] ?? { x: 1, y: 1 };
  const willyEntity: Entity = createWilly({ id: 'willy', controllerId: PLAYER, factionId: FACTION, position: at, spriteId: 'willy-butanero', classId: 'butanero' });
  const base = engine.newGame({ seed, map: start.map, entities: [willyEntity, ...start.entities] });
  const stashed = Object.fromEntries(Object.entries(floors).filter(([id]) => id !== startId).map(([id, f]) => [id, stash(f)]));
  const state = startOn(start, base, stashed);
  return { ...state, systems: { ...state.systems, rivals: rivals as unknown as JsonValue } };
}

/** The casting: Willy is rebuilt in place with the chosen class (same spot, id and controller). */
export function applyCasting(state: GameState, choices: CreationChoices): GameState {
  const w = state.entities.willy!;
  const built = buildWilly(choices, { id: w.id, controllerId: w.controllerId, factionId: w.factionId, position: w.position });
  return { ...state, entities: { ...state.entities, willy: built } };
}
