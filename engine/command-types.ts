import type { EngineContent } from './dialogue';
import type { Ruleset } from './ruleset';
import type { ControllerId, Entity, GameState } from './state';

/**
 * Every state change goes through a command. The UI never mutates GameState directly.
 * The engine handles generic commands (move, startCombat, endTurn, act); the ruleset may
 * register its own.
 */
export interface BaseCommand {
  type: string;
  /** Controller sending the command; must own the acting entity. */
  issuer: ControllerId;
}

/** Issuer for commands the game itself triggers (encounters starting...). A server would own it. */
export const SYSTEM_ISSUER = 'system';

/** Events describe what happened so the renderer can animate it. */
export interface GameEvent {
  type: string;
}

/** Engine error codes. Rulesets may add their own; the UI maps codes to text. */
export type EngineErrorCode =
  | 'unknown_command'
  | 'unknown_entity'
  | 'not_your_entity'
  | 'out_of_bounds'
  | 'no_path'
  | 'out_of_range'
  | 'not_your_turn'
  | 'not_in_combat'
  | 'cannot_act'
  | 'unknown_action'
  | 'not_enough_resources'
  | 'invalid_target'
  | 'action_invalid';

export interface CommandError {
  code: string;
  /** Developer-facing detail (English), or the ruleset's Spanish reason for 'action_invalid'. */
  message: string;
}

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: CommandError };

export interface CommandContext {
  ruleset: Ruleset;
  /** Game content the engine looks up by id (dialogue trees...). */
  content?: EngineContent;
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

/** Narrows a generic event to a known event type, e.g. isEvent<EntityMovedEvent>(e, 'entityMoved'). */
export function isEvent<E extends GameEvent>(event: GameEvent, type: E['type']): event is E {
  return event.type === type;
}
