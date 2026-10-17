import type { GameEvent } from './command-types';
import type { Ruleset } from './ruleset';
import type { Vec2 } from './grid';
import type { AppliedCondition, Entity, FlagValue, GameState } from './state';

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
  | { type: 'setPosition'; entityId: string; position: Vec2 };

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

export type EffectEvent = ResourceChangedEvent | ConditionChangedEvent | FlagChangedEvent | EntityTeleportedEvent;

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
      case 'setFlag': {
        next = { ...next, flags: { ...next.flags, [effect.flag]: effect.value } };
        events.push({ type: 'flagChanged', flag: effect.flag, value: effect.value });
        break;
      }
    }
  }
  return { state: next, events };
}
