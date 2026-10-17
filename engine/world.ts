import { type BaseCommand, type CommandHandler, type CommandResult, type GameEvent, SYSTEM_ISSUER, fail } from './command-types';
import { type GridMap, type Vec2, posKey, tileAt } from './grid';
import { LIGHTING_SYSTEM, type LightingState } from './lighting';
import type { Entity, GameState, JsonValue } from './state';

/**
 * Several maps in one game (the road, the village, the mine). Only one is loaded in
 * `state.map`; the others wait in `systems.world.stashed` exactly as they were left, so
 * going back finds the same corpses and the same open doors. A map seen for the first
 * time is built by the game's content (`EngineContent.maps`).
 */
export interface MapSetup {
  map: GridMap;
  /** Everything that lives on this map (not the travelling party). */
  entities: Entity[];
  /** Named arrival points. */
  spawns: Record<string, Vec2>;
  /** Per-map systems: lighting, surfaces, traps, zones... */
  systems?: Record<string, JsonValue>;
}

export type MapBuilder = () => MapSetup;

/** Systems that belong to a map and travel with it into the stash. */
export const MAP_SYSTEMS = ['surfaces', 'traps', 'zones', LIGHTING_SYSTEM, 'spawns'] as const;

interface StashedMap {
  map: GridMap;
  entities: Record<string, Entity>;
  systems: Record<string, JsonValue>;
}

export interface WorldState {
  current: string;
  stashed: Record<string, StashedMap>;
}

export function worldOf(state: GameState): WorldState {
  return (state.systems.world as unknown as WorldState | undefined) ?? { current: state.map.id, stashed: {} };
}

/** Named arrival points of the loaded map (kept in systems.spawns by whoever builds it). */
export function spawnsOf(state: GameState): Record<string, Vec2> {
  return (state.systems.spawns as unknown as Record<string, Vec2> | undefined) ?? {};
}

export interface MapChangedEvent extends GameEvent {
  type: 'mapChanged';
  from: string;
  to: string;
  spawn: string;
}

/**
 * Moves `travellers` to `mapId`, arriving at `spawn` (and the free tiles around it).
 * Everything else stays behind, stashed with the old map.
 */
export function changeMap(state: GameState, builders: Record<string, MapBuilder>, mapId: string, spawn: string, travellers: string[]): CommandResult {
  const world = worldOf(state);
  if (mapId === state.map.id) return fail('invalid_target', `Already on ${mapId}`);
  const stashedTarget = world.stashed[mapId];
  const built = stashedTarget ? null : builders[mapId]?.();
  if (!stashedTarget && !built) return fail('invalid_target', `No map "${mapId}"`);

  // Leave the current map as it is.
  const goers = new Set(travellers.filter((id) => state.entities[id]));
  const staying = Object.fromEntries(Object.entries(state.entities).filter(([id]) => !goers.has(id)));
  const carried = (state.systems[LIGHTING_SYSTEM] as unknown as LightingState | undefined)?.lights.filter((l) => l.attachedTo && goers.has(l.attachedTo)) ?? [];
  const leftSystems: Record<string, JsonValue> = {};
  for (const k of MAP_SYSTEMS) if (state.systems[k] !== undefined) leftSystems[k] = state.systems[k]!;
  const leftLighting = leftSystems[LIGHTING_SYSTEM] as unknown as LightingState | undefined;
  if (leftLighting) leftSystems[LIGHTING_SYSTEM] = { ...leftLighting, lights: leftLighting.lights.filter((l) => !(l.attachedTo && goers.has(l.attachedTo))) } as unknown as JsonValue;
  const stashed = { ...world.stashed, [state.map.id]: { map: state.map, entities: staying, systems: leftSystems } };
  delete stashed[mapId];

  // Arrive.
  const target = stashedTarget ?? { map: built!.map, entities: Object.fromEntries(built!.entities.map((e) => [e.id, e])), systems: { ...(built!.systems ?? {}), spawns: built!.spawns as unknown as JsonValue } };
  const spawns = (target.systems.spawns as unknown as Record<string, Vec2> | undefined) ?? {};
  const origin = spawns[spawn];
  if (!origin) return fail('invalid_target', `Map ${mapId} has no spawn "${spawn}"`);
  const taken = new Set(Object.values(target.entities).map((e) => posKey(e.position)));
  const placed: Record<string, Entity> = {};
  for (const id of goers) {
    const at = freeTileNear(target.map, origin, taken);
    taken.add(posKey(at));
    placed[id] = { ...state.entities[id]!, position: at };
  }
  const systems: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(state.systems)) if (!(MAP_SYSTEMS as readonly string[]).includes(k)) systems[k] = v;
  Object.assign(systems, target.systems);
  const arrivedLighting = systems[LIGHTING_SYSTEM] as unknown as LightingState | undefined;
  if (carried.length) systems[LIGHTING_SYSTEM] = { ambient: arrivedLighting?.ambient ?? 1, lights: [...(arrivedLighting?.lights ?? []), ...carried] } as unknown as JsonValue;
  systems.world = { current: mapId, stashed } as unknown as JsonValue;

  const next: GameState = { ...state, map: target.map, entities: { ...target.entities, ...placed }, systems };
  return { ok: true, state: next, events: [{ type: 'mapChanged', from: state.map.id, to: mapId, spawn } as MapChangedEvent] };
}

/** The spawn tile if free, else the nearest walkable free tile (breadth-first). */
function freeTileNear(map: GridMap, from: Vec2, taken: Set<string>): Vec2 {
  const seen = new Set([posKey(from)]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    if (tileAt(map, p)?.walkable && !taken.has(posKey(p))) return p;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (n.x < 0 || n.y < 0 || n.x >= map.width || n.y >= map.height || seen.has(posKey(n))) continue;
      seen.add(posKey(n));
      queue.push(n);
    }
  }
  return from;
}

/** Walk out through an exit: the party (every entity of the issuer) travels together. */
export interface TravelCommand extends BaseCommand {
  type: 'travel';
  /** Who stands on the exit. */
  entityId: string;
  mapId: string;
  spawn: string;
}

export const travel: CommandHandler<TravelCommand> = (state, cmd, { content }) => {
  if (state.turn.mode === 'combat') return fail('cannot_act', 'No travelling mid-fight');
  if (state.systems.dialogue) return fail('cannot_act', 'Finish the conversation first');
  const builders = content?.maps ?? {};
  let issuer = cmd.issuer;
  if (cmd.issuer !== SYSTEM_ISSUER) {
    const walker = state.entities[cmd.entityId];
    if (!walker || walker.controllerId !== cmd.issuer) return fail('not_your_entity', 'Not your entity');
    // Only through an exit zone that leads there.
    const zones = (state.systems.zones as unknown as { layer: string; x: number; y: number; width: number; height: number; properties: Record<string, unknown> }[] | undefined) ?? [];
    const exit = zones.find(
      (z) => z.layer === 'exits' && z.properties.to === cmd.mapId && z.properties.spawn === cmd.spawn &&
        walker.position.x >= z.x && walker.position.x < z.x + z.width && walker.position.y >= z.y && walker.position.y < z.y + z.height,
    );
    if (!exit) return fail('out_of_range', 'Not standing on that exit');
    // Story gates: the abbey door opens only with an audience, the crypt only with the key.
    const req = exit.properties.requiresFlag;
    const unless = exit.properties.unlessFlag;
    if ((req && !state.flags[String(req)]) || (unless && state.flags[String(unless)])) return fail('cannot_act', 'That way is closed for now');
  } else {
    issuer = state.entities[cmd.entityId]?.controllerId ?? cmd.issuer;
  }
  const party = Object.values(state.entities).filter((e) => e.controllerId === issuer).map((e) => e.id);
  return changeMap(state, builders, cmd.mapId, cmd.spawn, party);
};
