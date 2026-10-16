import { type Vec2, inBounds, posKey } from './grid';
import { findPath } from './pathfinding';
import type { ControllerId, GameState } from './state';

/** Every state change goes through a command. The UI never mutates GameState directly. */
export type Command = MoveCommand;

export interface MoveCommand {
  type: 'move';
  /** Controller sending the command; must own the entity. */
  issuer: ControllerId;
  entityId: string;
  to: Vec2;
}

/** Events describe what happened so the renderer can animate it. */
export type GameEvent = EntityMovedEvent;

export interface EntityMovedEvent {
  type: 'entityMoved';
  entityId: string;
  from: Vec2;
  /** Tiles walked, excluding `from`, ending at the destination. */
  path: Vec2[];
}

export type CommandErrorCode =
  | 'unknown_entity'
  | 'not_your_entity'
  | 'out_of_bounds'
  | 'no_path'
  | 'out_of_range';

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: CommandError };

type Handler<C extends Command> = (state: GameState, command: C) => CommandResult;
type HandlerMap = { [K in Command['type']]: Handler<Extract<Command, { type: K }>> };

const fail = (code: CommandErrorCode, message: string): CommandResult => ({ ok: false, error: { code, message } });

const handlers: HandlerMap = {
  move(state, cmd) {
    const entity = state.entities[cmd.entityId];
    if (!entity) return fail('unknown_entity', `No entity "${cmd.entityId}"`);
    if (entity.controllerId !== cmd.issuer) return fail('not_your_entity', `${cmd.issuer} does not control ${entity.id}`);
    if (!inBounds(state.map, cmd.to)) return fail('out_of_bounds', 'Destination outside the map');

    const blocked = new Set(
      Object.values(state.entities)
        .filter((e) => e.id !== entity.id)
        .map((e) => posKey(e.position)),
    );
    const result = findPath(state.map, entity.position, cmd.to, { blocked });
    if (!result) return fail('no_path', 'No path to destination');
    if (state.turn.mode === 'combat' && result.cost > entity.speed) {
      return fail('out_of_range', `Path costs ${result.cost}, speed is ${entity.speed}`);
    }
    if (result.path.length === 0) return { ok: true, state, events: [] };

    const next: GameState = {
      ...state,
      entities: { ...state.entities, [entity.id]: { ...entity, position: { ...cmd.to } } },
    };
    return {
      ok: true,
      state: next,
      events: [{ type: 'entityMoved', entityId: entity.id, from: { ...entity.position }, path: result.path }],
    };
  },
};

/** Validates a command against the state and returns the new state plus events. Pure: never mutates `state`. */
export function applyCommand(state: GameState, command: Command): CommandResult {
  const handler = handlers[command.type] as Handler<Command> | undefined;
  if (!handler) throw new Error(`Unhandled command type: ${(command as { type: string }).type}`);
  return handler(state, command);
}
