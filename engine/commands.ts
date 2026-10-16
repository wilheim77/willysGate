import { type Vec2, inBounds, posKey } from './grid';
import { findPath } from './pathfinding';
import type { Ruleset } from './ruleset';
import type { ControllerId, Entity, GameState } from './state';

/**
 * Every state change goes through a command. The UI never mutates GameState directly.
 * The engine handles generic commands (move...); the ruleset registers its own (attack...).
 */
export interface BaseCommand {
  type: string;
  /** Controller sending the command; must own the acting entity. */
  issuer: ControllerId;
}

export interface MoveCommand extends BaseCommand {
  type: 'move';
  entityId: string;
  to: Vec2;
}

/** Events describe what happened so the renderer can animate it. */
export interface GameEvent {
  type: string;
}

export interface EntityMovedEvent extends GameEvent {
  type: 'entityMoved';
  entityId: string;
  from: Vec2;
  /** Tiles walked, excluding `from`, ending at the destination. */
  path: Vec2[];
}

/** Engine error codes. Rulesets may add their own; the UI maps codes to text. */
export type EngineErrorCode =
  | 'unknown_command'
  | 'unknown_entity'
  | 'not_your_entity'
  | 'out_of_bounds'
  | 'no_path'
  | 'out_of_range';

export interface CommandError {
  code: string;
  /** Developer-facing detail (English). */
  message: string;
}

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: CommandError };

export interface CommandContext {
  ruleset: Ruleset;
}

// `any` lets each handler narrow to its own command type; applyCommand routes by `type`.
export type CommandHandler<C extends BaseCommand = any> = (state: GameState, command: C, ctx: CommandContext) => CommandResult;

export const fail = (code: string, message: string): CommandResult => ({ ok: false, error: { code, message } });

/** Looks up the acting entity and checks the issuer controls it. */
export function requireControlled(
  state: GameState,
  issuer: ControllerId,
  entityId: string,
): { ok: true; entity: Entity } | { ok: false; error: CommandError } {
  const entity = state.entities[entityId];
  if (!entity) return { ok: false, error: { code: 'unknown_entity', message: `No entity "${entityId}"` } };
  if (entity.controllerId !== issuer) {
    return { ok: false, error: { code: 'not_your_entity', message: `${issuer} does not control ${entityId}` } };
  }
  return { ok: true, entity };
}

const move: CommandHandler<MoveCommand> = (state, cmd, { ruleset }) => {
  const actor = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!actor.ok) return actor;
  const { entity } = actor;
  if (!inBounds(state.map, cmd.to)) return fail('out_of_bounds', 'Destination outside the map');

  const blocked = new Set(
    Object.values(state.entities)
      .filter((e) => e.id !== entity.id)
      .map((e) => posKey(e.position)),
  );
  const result = findPath(state.map, entity.position, cmd.to, { blocked, rules: ruleset.movement });
  if (!result) return fail('no_path', 'No path to destination');
  if (state.turn.mode === 'combat') {
    const budget = ruleset.movementBudget(entity, state);
    if (result.cost > budget) return fail('out_of_range', `Path costs ${result.cost}, budget is ${budget}`);
  }
  if (result.path.length === 0) return { ok: true, state, events: [] };

  const next: GameState = {
    ...state,
    entities: { ...state.entities, [entity.id]: { ...entity, position: { ...cmd.to } } },
  };
  const event: EntityMovedEvent = { type: 'entityMoved', entityId: entity.id, from: { ...entity.position }, path: result.path };
  return { ok: true, state: next, events: [event] };
};

export const ENGINE_COMMANDS: Readonly<Record<string, CommandHandler>> = { move };

/** Validates a command against the state and returns the new state plus events. Pure: never mutates `state`. */
export function applyCommand(ruleset: Ruleset, state: GameState, command: BaseCommand): CommandResult {
  const handler = ENGINE_COMMANDS[command.type] ?? ruleset.commands[command.type];
  if (!handler) return fail('unknown_command', `Unknown command type "${command.type}"`);
  return handler(state, command, { ruleset });
}

/** Narrows a generic event to a known event type, e.g. isEvent<EntityMovedEvent>(e, 'entityMoved'). */
export function isEvent<E extends GameEvent>(event: GameEvent, type: E['type']): event is E {
  return event.type === type;
}
