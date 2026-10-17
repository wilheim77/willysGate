import type { GameEvent } from './command-types';
import type { Ruleset } from './ruleset';
import type { Vec2 } from './grid';
import type { AppliedCondition, Entity, FlagValue, GameState } from './state';
import { inBounds, posKey, tileAt } from './grid';
import { makeSurface, surfaceable, surfacesOf, withSurfaces } from './surfaces';

/**
 * Generic state changes produced by rules (a hit, a spell, a dialogue outcome).
 * The ruleset decides *what* happens (e.g. 7 fire damage after resistance becomes
 * modifyResource on the hit-point pool); the engine applies it and emits events.
 * Planned: push, spawnSurface (Phase 3).
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
  | { type: 'clearSurface'; tiles: Vec2[] };

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

export type EffectEvent =
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
          events.push({ type: 'entityPushed', entityId: e.id, from, to: { ...sim.to }, ...(sim.collidedWith ? { collidedWith: sim.collidedWith } : {}) });
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
        for (const t of effect.tiles) {
          if (!surfaceable(next, t)) continue;
          const key = posKey(t);
          const current = layer[key]?.type ?? '';
          const reaction = reactions.find((r) => r.surface === current && r.element === effect.element);
          if (!reaction) continue;
          if (reaction.result === null) delete layer[key];
          else layer[key] = makeSurface(defs, reaction.result);
          changes.push({ tile: t, from: current || null, to: reaction.result });
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
): { to: Vec2; dropped: number; collidedWith?: { entityId?: string; wall?: boolean } } {
  const e = state.entities[entityId]!;
  let pos = { ...e.position };
  let dropped = 0;
  for (let i = 0; i < distance; i++) {
    const step = { x: pos.x + Math.sign(dx), y: pos.y + Math.sign(dy) };
    const here = tileAt(state.map, pos)!;
    const there = tileAt(state.map, step);
    if (!inBounds(state.map, step) || !there || !there.walkable || there.height - here.height > ruleset.movement.maxStep) {
      return { to: pos, dropped, collidedWith: { wall: true } };
    }
    const blocker = Object.values(state.entities).find((o) => o.id !== e.id && o.position.x === step.x && o.position.y === step.y && ruleset.isStanding(o));
    if (blocker) return { to: pos, dropped, collidedWith: { entityId: blocker.id } };
    const drop = here.height - there.height;
    if (drop > ruleset.movement.maxStep) dropped += drop;
    pos = step;
  }
  return { to: pos, dropped };
}
