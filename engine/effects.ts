import { itemCount, withItems } from './inventory';
import type { GameEvent } from './command-types';
import type { Ruleset } from './ruleset';
import type { Tile, Vec2 } from './grid';
import type { AppliedCondition, Entity, FlagValue, GameState } from './state';
import { inBounds, posKey, tileAt } from './grid';
import { makeSurface, surfaceable, surfacesOf, withSurfaces } from './surfaces';

/**
 * Generic state changes produced by rules (a hit, a spell, a dialogue outcome).
 * The ruleset decides *what* happens (e.g. 7 fire damage after resistance becomes
 * modifyResource on the hit-point pool); the engine applies it and emits events.
 */
export type Effect =
  | { type: 'modifyResource'; entityId: string; resource: string; delta: number }
  | { type: 'applyCondition'; entityId: string; condition: string; sourceId?: string; remainingTurns?: number }
  | { type: 'removeCondition'; entityId: string; condition: string }
  | { type: 'setFlag'; flag: string; value: FlagValue }
  /** Raise or lower a pool's maximum (e.g. a spell granting extra hit points). Current moves with it. */
  | { type: 'modifyResourceMax'; entityId: string; resource: string; delta: number }
  /** Instant relocation (teleport); walking always goes through the move command. */
  | { type: 'setPosition'; entityId: string; position: Vec2 }
  /** Shove `distance` tiles along (dx, dy); stops at walls, creatures and ledges too high to be pushed up. */
  | { type: 'push'; entityId: string; dx: number; dy: number; distance: number }
  /** Lay a surface (oil from a barrel, Grease...) on tiles. */
  | { type: 'spawnSurface'; tiles: Vec2[]; surface: string; turns?: number }
  /** An element touches tiles (fire, cold, lightning, water): surfaces react per the ruleset. */
  | { type: 'applyElement'; tiles: Vec2[]; element: string }
  | { type: 'clearSurface'; tiles: Vec2[] }
  /** Items into (or, with a negative count, out of) an owner's inventory: an entity id or 'party'. */
  | { type: 'giveItem'; owner: string; item: string; count: number }
  /** Hand an entity to another controller and side (a companion joins, a guard turns hostile). */
  | { type: 'setController'; entityId: string; controllerId: string; factionId?: string }
  /** Change a map tile (a door opens, a bridge collapses). Omitted fields stay as they are. */
  | { type: 'setTile'; position: Vec2; walkable?: boolean; terrain?: string; height?: number }
  /** Change how a thing looks or what it is (a chest opens, a lever flips): sprite, name and tags. */
  /**
   * Bring something into play: a summon, a barrier, reinforcements. In combat it joins the
   * turn order right after its owner. With `rounds`, it vanishes after that many rounds.
   */
  | { type: 'spawnEntity'; entity: Entity; ownerId?: string; rounds?: number }
  /** Take something out of play (a summon ending, a barrier dropping). Gone, not dead. */
  | { type: 'despawnEntity'; entityId: string }
  /** Raise or lower a stat (levelling up, a curse): stats are the ruleset's numbers. */
  | { type: 'modifyStat'; entityId: string; stat: string; delta: number }
  | { type: 'setEntity'; entityId: string; spriteId?: string; name?: string; addTags?: string[]; removeTags?: string[] };

export interface ResourceChangedEvent extends GameEvent {
  type: 'resourceChanged';
  entityId: string;
  resource: string;
  from: number;
  to: number;
}

export interface ConditionChangedEvent extends GameEvent {
  type: 'conditionApplied' | 'conditionRemoved';
  entityId: string;
  condition: string;
}

export interface FlagChangedEvent extends GameEvent {
  type: 'flagChanged';
  flag: string;
  value: FlagValue;
}

export interface EntityTeleportedEvent extends GameEvent {
  type: 'entityTeleported';
  entityId: string;
  from: Vec2;
  to: Vec2;
}

/** Pushed creature: where it went, and what stopped it. */
export interface EntityPushedEvent extends GameEvent {
  type: 'entityPushed';
  entityId: string;
  from: Vec2;
  to: Vec2;
  /** What it hit if stopped early: a creature, a wall, or nothing. */
  collidedWith?: { entityId?: string; wall?: boolean };
  /** Shoved over the edge into a pit or off the stage. */
  into?: 'void';
  direction?: { dx: number; dy: number };
  /** Push distance left when it stopped (for chain shoves). */
  remaining?: number;
}

/** Dropped more levels than a step allows: the ruleset decides the damage. */
export interface EntityFellEvent extends GameEvent {
  type: 'entityFell';
  entityId: string;
  levels: number;
}

export interface SurfaceChangedEvent extends GameEvent {
  type: 'surfaceChanged';
  changes: { tile: Vec2; from: string | null; to: string | null }[];
}

export interface ItemsChangedEvent extends GameEvent {
  type: 'itemsChanged';
  owner: string;
  item: string;
  from: number;
  to: number;
}

export interface ControllerChangedEvent extends GameEvent {
  type: 'controllerChanged';
  entityId: string;
  controllerId: string;
  factionId: string;
}

export interface TileChangedEvent extends GameEvent {
  type: 'tileChanged';
  position: Vec2;
  tile: Tile;
}

export interface EntityChangedEvent extends GameEvent {
  type: 'entityChanged';
  entityId: string;
  spriteId: string;
}

export interface StatChangedEvent extends GameEvent {
  type: 'statChanged';
  entityId: string;
  stat: string;
  from: number;
  to: number;
}

export interface EntitySpawnedEvent extends GameEvent {
  type: 'entitySpawned';
  entityId: string;
  position: Vec2;
  ownerId?: string;
}

export interface EntityDespawnedEvent extends GameEvent {
  type: 'entityDespawned';
  entityId: string;
}

export type EffectEvent =
  | EntitySpawnedEvent
  | EntityDespawnedEvent
  | StatChangedEvent
  | EntityChangedEvent
  | ItemsChangedEvent
  | ControllerChangedEvent
  | TileChangedEvent
  | ResourceChangedEvent
  | ConditionChangedEvent
  | FlagChangedEvent
  | EntityTeleportedEvent
  | EntityPushedEvent
  | EntityFellEvent
  | SurfaceChangedEvent;

/**
 * Applies effects in order. Unknown entities/resources/conditions are content or
 * ruleset bugs, so they throw instead of failing silently. Pure: returns a new state.
 */
export function applyEffects(ruleset: Ruleset, state: GameState, effects: Effect[]): { state: GameState; events: EffectEvent[] } {
  let next = state;
  const events: EffectEvent[] = [];

  const updateEntity = (id: string, fn: (e: Entity) => Entity): void => {
    const entity = next.entities[id];
    if (!entity) throw new Error(`Effect targets unknown entity "${id}"`);
    next = { ...next, entities: { ...next.entities, [id]: fn(entity) } };
  };

  for (const effect of effects) {
    switch (effect.type) {
      case 'modifyResource': {
        if (!ruleset.resources[effect.resource]) throw new Error(`Unknown resource "${effect.resource}" in ruleset ${ruleset.id}`);
        updateEntity(effect.entityId, (e) => {
          const pool = e.resources[effect.resource];
          if (!pool) throw new Error(`Entity "${e.id}" has no resource "${effect.resource}"`);
          const to = Math.max(0, Math.min(pool.max, pool.current + effect.delta));
          if (to !== pool.current) {
            events.push({ type: 'resourceChanged', entityId: e.id, resource: effect.resource, from: pool.current, to });
          }
          return { ...e, resources: { ...e.resources, [effect.resource]: { ...pool, current: to } } };
        });
        break;
      }
      case 'applyCondition': {
        if (!ruleset.conditions[effect.condition]) throw new Error(`Unknown condition "${effect.condition}" in ruleset ${ruleset.id}`);
        updateEntity(effect.entityId, (e) => {
          const applied: AppliedCondition = { id: effect.condition };
          if (effect.sourceId !== undefined) applied.sourceId = effect.sourceId;
          if (effect.remainingTurns !== undefined) applied.remainingTurns = effect.remainingTurns;
          // Re-applying refreshes the condition instead of stacking it.
          const others = e.conditions.filter((c) => c.id !== effect.condition);
          events.push({ type: 'conditionApplied', entityId: e.id, condition: effect.condition });
          return { ...e, conditions: [...others, applied] };
        });
        break;
      }
      case 'removeCondition': {
        updateEntity(effect.entityId, (e) => {
          if (!e.conditions.some((c) => c.id === effect.condition)) return e;
          events.push({ type: 'conditionRemoved', entityId: e.id, condition: effect.condition });
          return { ...e, conditions: e.conditions.filter((c) => c.id !== effect.condition) };
        });
        break;
      }
      case 'modifyResourceMax': {
        if (!ruleset.resources[effect.resource]) throw new Error(`Unknown resource "${effect.resource}" in ruleset ${ruleset.id}`);
        updateEntity(effect.entityId, (e) => {
          const pool = e.resources[effect.resource] ?? { current: 0, max: 0 };
          const max = Math.max(0, pool.max + effect.delta);
          const current = Math.max(0, Math.min(max, pool.current + effect.delta));
          events.push({ type: 'resourceChanged', entityId: e.id, resource: effect.resource, from: pool.current, to: current });
          return { ...e, resources: { ...e.resources, [effect.resource]: { current, max } } };
        });
        break;
      }
      case 'setPosition': {
        updateEntity(effect.entityId, (e) => {
          events.push({ type: 'entityTeleported', entityId: e.id, from: { ...e.position }, to: { ...effect.position } });
          return { ...e, position: { ...effect.position } };
        });
        break;
      }
      case 'push': {
        const e = next.entities[effect.entityId];
        if (!e) throw new Error(`Effect targets unknown entity "${effect.entityId}"`);
        const sim = simulatePush(ruleset, next, e.id, effect.dx, effect.dy, effect.distance);
        if (sim.to.x !== e.position.x || sim.to.y !== e.position.y || sim.collidedWith) {
          const from = { ...e.position };
          updateEntity(e.id, (x) => ({ ...x, position: { ...sim.to } }));
          events.push({
            type: 'entityPushed',
            entityId: e.id,
            from,
            to: { ...sim.to },
            direction: { dx: Math.sign(effect.dx), dy: Math.sign(effect.dy) },
            remaining: sim.remaining,
            ...(sim.collidedWith ? { collidedWith: sim.collidedWith } : {}),
            ...(sim.intoVoid ? { into: 'void' } : {}),
          });
        }
        if (sim.dropped > 0) events.push({ type: 'entityFell', entityId: e.id, levels: sim.dropped });
        break;
      }
      case 'spawnSurface': {
        const defs = ruleset.surfaces ?? {};
        const layer = { ...surfacesOf(next) };
        const changes: SurfaceChangedEvent['changes'] = [];
        for (const t of effect.tiles) {
          if (!surfaceable(next, t)) continue;
          const key = posKey(t);
          changes.push({ tile: t, from: layer[key]?.type ?? null, to: effect.surface });
          layer[key] = makeSurface(defs, effect.surface, effect.turns);
        }
        next = withSurfaces(next, layer);
        if (changes.length) events.push({ type: 'surfaceChanged', changes });
        break;
      }
      case 'applyElement': {
        const defs = ruleset.surfaces ?? {};
        const reactions = ruleset.surfaceReactions ?? [];
        const layer = { ...surfacesOf(next) };
        const changes: SurfaceChangedEvent['changes'] = [];
        const queue = [...effect.tiles];
        const seen = new Set<string>();
        while (queue.length) {
          const t = queue.shift()!;
          const key = posKey(t);
          if (seen.has(key) || !surfaceable(next, t)) continue;
          seen.add(key);
          const current = layer[key]?.type ?? '';
          const reaction = reactions.find((r) => r.surface === current && r.element === effect.element);
          if (!reaction) continue;
          if (reaction.result === null) delete layer[key];
          else layer[key] = makeSurface(defs, reaction.result);
          changes.push({ tile: t, from: current || null, to: reaction.result });
          if (!reaction.spreads) continue;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const n = { x: t.x + dx, y: t.y + dy };
              if ((dx || dy) && layer[posKey(n)]?.type === current) queue.push(n);
            }
          }
        }
        next = withSurfaces(next, layer);
        if (changes.length) events.push({ type: 'surfaceChanged', changes });
        break;
      }
      case 'clearSurface': {
        const layer = { ...surfacesOf(next) };
        const changes: SurfaceChangedEvent['changes'] = [];
        for (const t of effect.tiles) {
          const key = posKey(t);
          if (!layer[key]) continue;
          changes.push({ tile: t, from: layer[key]!.type, to: null });
          delete layer[key];
        }
        next = withSurfaces(next, layer);
        if (changes.length) events.push({ type: 'surfaceChanged', changes });
        break;
      }
      case 'giveItem': {
        const before = itemCount(next, effect.owner, effect.item);
        next = withItems(next, effect.owner, effect.item, effect.count);
        const after = itemCount(next, effect.owner, effect.item);
        if (after !== before) events.push({ type: 'itemsChanged', owner: effect.owner, item: effect.item, from: before, to: after } as ItemsChangedEvent);
        break;
      }
      case 'setController': {
        const e = next.entities[effect.entityId];
        if (!e) throw new Error(`Effect targets unknown entity "${effect.entityId}"`);
        const updated = { ...e, controllerId: effect.controllerId, factionId: effect.factionId ?? e.factionId };
        next = { ...next, entities: { ...next.entities, [e.id]: updated } };
        events.push({ type: 'controllerChanged', entityId: e.id, controllerId: updated.controllerId, factionId: updated.factionId } as ControllerChangedEvent);
        break;
      }
      case 'setTile': {
        const { x, y } = effect.position;
        if (!inBounds(next.map, effect.position)) throw new Error(`setTile out of the map at ${x},${y}`);
        const index = y * next.map.width + x;
        const tile = next.map.tiles[index];
        if (!tile) break;
        const changed = {
          ...tile,
          ...(effect.walkable !== undefined ? { walkable: effect.walkable } : {}),
          ...(effect.terrain !== undefined ? { terrain: effect.terrain } : {}),
          ...(effect.height !== undefined ? { height: effect.height } : {}),
        };
        const tiles = [...next.map.tiles];
        tiles[index] = changed;
        next = { ...next, map: { ...next.map, tiles } };
        events.push({ type: 'tileChanged', position: { x, y }, tile: changed });
        break;
      }
      case 'spawnEntity': {
        const e = effect.entity;
        if (next.entities[e.id]) throw new Error(`spawnEntity: "${e.id}" already exists`);
        const at = e.position;
        const taken = Object.values(next.entities).some((o) => o.position.x === at.x && o.position.y === at.y && ruleset.isStanding(o) && !o.tags.includes('object'));
        if (!tileAt(next.map, at)?.walkable || taken) break;
        next = { ...next, entities: { ...next.entities, [e.id]: e } };
        if (next.turn.mode === 'combat') {
          const order = [...next.turn.order];
          const after = effect.ownerId ? order.indexOf(effect.ownerId) : -1;
          order.splice(after >= 0 ? after + 1 : order.length, 0, e.id);
          next = { ...next, turn: { ...next.turn, order } };
        }
        if (effect.rounds !== undefined) {
          const summons = { ...((next.systems.summons as unknown as Record<string, { ownerId?: string; roundsLeft: number }>) ?? {}) };
          summons[e.id] = { ...(effect.ownerId ? { ownerId: effect.ownerId } : {}), roundsLeft: effect.rounds };
          next = { ...next, systems: { ...next.systems, summons: summons as never } };
        }
        events.push({ type: 'entitySpawned', entityId: e.id, position: { ...at }, ...(effect.ownerId ? { ownerId: effect.ownerId } : {}) });
        break;
      }
      case 'despawnEntity': {
        if (!next.entities[effect.entityId]) break;
        const { [effect.entityId]: _gone, ...rest } = next.entities;
        const summons = { ...((next.systems.summons as unknown as Record<string, unknown>) ?? {}) };
        delete summons[effect.entityId];
        let turn = next.turn;
        if (turn.order.includes(effect.entityId)) {
          // The turn pointer stays on whoever is active; removing someone else just shortens the order.
          turn = { ...turn, order: turn.order.filter((id) => id !== effect.entityId) };
        }
        next = { ...next, entities: rest, turn, systems: { ...next.systems, summons: summons as never } };
        events.push({ type: 'entityDespawned', entityId: effect.entityId });
        break;
      }
      case 'modifyStat': {
        if (!ruleset.stats[effect.stat]) throw new Error(`Unknown stat "${effect.stat}" in ruleset ${ruleset.id}`);
        updateEntity(effect.entityId, (e) => {
          const from = e.stats[effect.stat] ?? 0;
          events.push({ type: 'statChanged', entityId: e.id, stat: effect.stat, from, to: from + effect.delta });
          return { ...e, stats: { ...e.stats, [effect.stat]: from + effect.delta } };
        });
        break;
      }
      case 'setEntity': {
        updateEntity(effect.entityId, (e) => {
          const removed = new Set(effect.removeTags ?? []);
          const tags = [...new Set([...e.tags.filter((t) => !removed.has(t)), ...(effect.addTags ?? [])])];
          const changed = { ...e, tags, ...(effect.spriteId ? { spriteId: effect.spriteId } : {}), ...(effect.name ? { name: effect.name } : {}) };
          events.push({ type: 'entityChanged', entityId: e.id, spriteId: changed.spriteId });
          return changed;
        });
        break;
      }
      case 'setFlag': {
        next = { ...next, flags: { ...next.flags, [effect.flag]: effect.value } };
        events.push({ type: 'flagChanged', flag: effect.flag, value: effect.value });
        break;
      }
    }
  }
  return { state: next, events };
}

/**
 * Where a push would leave a creature, without changing anything: used by the push
 * effect and by previews ("it will fall 2 levels"). Stops at walls, creatures, the map
 * edge and ledges too high to be pushed up; counts levels dropped beyond a normal step.
 */
export function simulatePush(
  ruleset: Ruleset,
  state: GameState,
  entityId: string,
  dx: number,
  dy: number,
  distance: number,
): { to: Vec2; dropped: number; collidedWith?: { entityId?: string; wall?: boolean }; intoVoid?: boolean; remaining: number } {
  const e = state.entities[entityId]!;
  let pos = { ...e.position };
  let dropped = 0;
  for (let i = 0; i < distance; i++) {
    const step = { x: pos.x + Math.sign(dx), y: pos.y + Math.sign(dy) };
    const here = tileAt(state.map, pos)!;
    const there = tileAt(state.map, step);
    // Off a cliff into nothing (a pit, the edge of the stage): gone, the ruleset decides what that means.
    if (inBounds(state.map, step) && there?.terrain === 'void') return { to: step, dropped, intoVoid: true, remaining: distance - i - 1 };
    if (!inBounds(state.map, step) || !there || !there.walkable || there.height - here.height > ruleset.movement.maxStep) {
      return { to: pos, dropped, collidedWith: { wall: true }, remaining: distance - i };
    }
    const blocker = Object.values(state.entities).find((o) => o.id !== e.id && o.position.x === step.x && o.position.y === step.y && (ruleset.occupiesTile ? ruleset.occupiesTile(o) : ruleset.isStanding(o)));
    if (blocker) return { to: pos, dropped, collidedWith: { entityId: blocker.id }, remaining: distance - i };
    const drop = here.height - there.height;
    if (drop > ruleset.movement.maxStep) dropped += drop;
    pos = step;
  }
  return { to: pos, dropped, remaining: 0 };
}
