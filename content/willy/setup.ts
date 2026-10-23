import { type CreationChoices, type Engine, applyEffects, type Entity, type GameState, type JsonValue, type MapBuilder, type MapSetup, type Vec2, withLighting, withZones } from '../../engine';
import { CLASSES, buildWilly, cloneMeta, createCompanion, createWilly, metaOf, setMeta, startingItemEffects, willy } from '../../rulesets/willy';
import { FLOOR_COUNT, generateFloor } from './gen/floor';
import type { RivalRecord } from './gen/rivals';
import { MAPS } from './maps';
import './show';
import './meta-content';
import './tutorial';

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

/** The floors of a season (floors.json → pisos). */
export const FLOORS = Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1);

export function rivalsOf(state: GameState | undefined): RivalRecord[] {
  return ((state?.systems?.rivals as unknown as RivalRecord[] | undefined) ?? []).slice();
}

/**
 * Floor `n` for this run. Its systems carry the updated rival list (a new rival, or one coming
 * back), which travel merges into the state when Willy arrives.
 */
/** How many times Willy has gone back to a Camerino (Con repetición); reshuffles the floors ahead. */
export const ATTEMPT_FLAG = 'willy:intento';

export function buildFloor(n: number, state: GameState | undefined): MapSetup {
  const rivals = rivalsOf(state);
  // Con repetición: after Willy falls, the floor is rebuilt differently («la mazmorra se recoloca»).
  const attempt = Number(state?.flags?.[ATTEMPT_FLAG] ?? 0);
  // Rivals already met in this browser (the profile, as the run started) are not repeated.
  const recentRivals = ((state?.systems?.perfil as { rivalesRecientes?: string[] } | undefined)?.rivalesRecientes ?? []).slice();
  const floor = generateFloor(((state?.seed ?? 0) + attempt * 7919) >>> 0, n, { rivals, recentRivals });
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
  // The class's companion joins at the Camerino (a new casting replaces the old one).
  const entities = Object.fromEntries(Object.entries(state.entities).filter(([, e]) => !e.tags.includes(`companero-de:${w.id}`)));
  entities.willy = built;
  const classId = built.tags.find((t) => t.startsWith('clase:'))?.slice('clase:'.length) ?? '';
  const spot = freeNeighbour(state, w.position, entities);
  const mate = spot ? createCompanion(classId, built, spot) : undefined;
  if (mate) entities[mate.id] = mate;
  return withStartingItems({ ...state, entities }, built.id, classId);
}

/**
 * The class's starting items (classes.json → objetosIniciales): tools in hand and equipment worn,
 * consumables in the party's bag. A new casting takes back the previous class's kit first.
 */
function withStartingItems(state: GameState, willyId: string, classId: string): GameState {
  const ids = CLASSES[classId]?.objetosIniciales ?? [];
  const meta = cloneMeta(metaOf(state));
  const cleared: GameState = { ...state, systems: { ...state.systems, inventory: { ...((state.systems.inventory as Record<string, JsonValue> | undefined) ?? {}), party: {} } as unknown as JsonValue } };
  const { effects, equipo } = startingItemEffects(cleared, cleared.entities[willyId]!, ids);
  meta.equipo = { ...meta.equipo, [willyId]: equipo };
  return applyEffects(willy, cleared, [...effects, setMeta(meta)]).state;
}

function freeNeighbour(state: GameState, at: Vec2, entities: Record<string, Entity>): Vec2 | undefined {
  const taken = new Set(Object.values(entities).map((e) => `${e.position.x},${e.position.y}`));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0]] as const) {
    const p = { x: at.x + dx, y: at.y + dy };
    const t = state.map.tiles[p.y * state.map.width + p.x];
    if (p.x >= 0 && p.y >= 0 && p.x < state.map.width && p.y < state.map.height && t?.walkable && !taken.has(`${p.x},${p.y}`)) return p;
  }
  return undefined;
}
