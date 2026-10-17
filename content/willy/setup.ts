import { type CreationChoices, type Engine, type GameState, type JsonValue, type MapSetup, withLighting, withZones } from '../../engine';
import { buildWilly, createWilly } from '../../rulesets/willy';
import { MAPS } from './maps';

/**
 * The game's start and the casting, without any client imports (so tests and a future server
 * can use them). content/willy/game.ts wires these into the GameDefinition.
 */

export const PLAYER = 'player:1';
export const FACTION = 'concursantes';

/** Map builders for the engine's travel command (EngineContent.maps). */
export const maps = MAPS;

/** Loads a map setup as the starting state (the same shape travel uses for the others). */
function startOn(setup: MapSetup, base: GameState): GameState {
  const systems = setup.systems ?? {};
  let state: GameState = { ...base, systems: { ...base.systems, ...systems, spawns: setup.spawns as unknown as JsonValue, world: { current: setup.map.id, stashed: {} } as unknown as JsonValue } };
  if (systems.lighting) state = withLighting(state, systems.lighting as never);
  if (systems.zones) state = withZones(state, systems.zones as never);
  return state;
}

/** A new season: Willy (a Butanero until the casting) in the Camerino. */
export function newWillyGame(engine: Engine, seed: number): GameState {
  const camerino = maps.camerino();
  const willyEntity = createWilly({ id: 'willy', controllerId: PLAYER, factionId: FACTION, position: camerino.spawns.llegada!, spriteId: 'willy-butanero', classId: 'butanero' });
  const base = engine.newGame({ seed, map: camerino.map, entities: [willyEntity, ...camerino.entities] });
  return startOn(camerino, base);
}

/** The casting: Willy is rebuilt in place with the chosen class (same spot, id and controller). */
export function applyCasting(state: GameState, choices: CreationChoices): GameState {
  const w = state.entities.willy!;
  const built = buildWilly(choices, { id: w.id, controllerId: w.controllerId, factionId: w.factionId, position: w.position });
  return { ...state, entities: { ...state.entities, willy: built } };
}
