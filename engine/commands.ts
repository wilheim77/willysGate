import { act, applyOutcome, checkCombatEnd, endTurn, inCombat, isAdjacent, isHostile, startCombat } from './combat';
import { type BaseCommand, type CommandHandler, type GameEvent, fail, requireControlled } from './command-types';
import { type Vec2, inBounds, posKey } from './grid';
import { findPath } from './pathfinding';
import { RngCursor } from './rng';
import type { Ruleset } from './ruleset';
import type { GameState } from './state';

export * from './command-types';

export interface MoveCommand extends BaseCommand {
  type: 'move';
  entityId: string;
  to: Vec2;
}

export interface EntityMovedEvent extends GameEvent {
  type: 'entityMoved';
  entityId: string;
  from: Vec2;
  /** Tiles walked, excluding `from`. May stop short of the destination (interrupted). */
  path: Vec2[];
}

/** Tiles other creatures stand on (only those the ruleset still counts as standing block the way). */
export function blockedTiles(ruleset: Ruleset, state: GameState, exceptId: string): Set<string> {
  return new Set(
    Object.values(state.entities)
      .filter((e) => e.id !== exceptId && ruleset.isStanding(e))
      .map((e) => posKey(e.position)),
  );
}

const move: CommandHandler<MoveCommand> = (state, cmd, { ruleset }) => {
  const actor = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!actor.ok) return actor;
  const { entity } = actor;
  if (!inBounds(state.map, cmd.to)) return fail('out_of_bounds', 'Destination outside the map');

  const fighting = inCombat(state, entity.id);
  if (fighting) {
    if (state.turn.activeEntityId !== entity.id) return fail('not_your_turn', `It is ${state.turn.activeEntityId}'s turn`);
    if (!ruleset.canAct(entity)) return fail('cannot_act', `${entity.id} cannot act`);
  }

  const result = findPath(state.map, entity.position, cmd.to, { blocked: blockedTiles(ruleset, state, entity.id), rules: ruleset.movement });
  if (!result) return fail('no_path', 'No path to destination');
  if (fighting) {
    const left = ruleset.movementBudget(entity, state) - state.turn.movementUsed;
    if (result.cost > left) return fail('out_of_range', `Path costs ${result.cost}, ${left} movement left`);
  }
  if (result.path.length === 0) return { ok: true, state, events: [] };

  if (!fighting) {
    const next: GameState = { ...state, entities: { ...state.entities, [entity.id]: { ...entity, position: { ...cmd.to } } } };
    const moved: EntityMovedEvent = { type: 'entityMoved', entityId: entity.id, from: { ...entity.position }, path: result.path };
    return { ok: true, state: next, events: [moved] };
  }

  // In combat, walk step by step: leaving an enemy's reach gives it a chance to react
  // (an opportunity attack in 5e). A reaction can stop the move.
  const rng = new RngCursor(state.rng);
  let next = state;
  const events: GameEvent[] = [];
  let from = entity.position;
  let segment: Vec2[] = [];
  let spent = 0;
  let prev = entity.position;
  const placeAt = (s: GameState, p: Vec2): GameState => ({
    ...s,
    entities: { ...s.entities, [entity.id]: { ...s.entities[entity.id]!, position: { ...p } } },
  });

  for (const step of result.path) {
    const mover = next.entities[entity.id]!;
    const reactors = Object.values(next.entities).filter(
      (e) => inCombat(next, e.id) && isHostile(e, mover) && ruleset.canAct(e) && isAdjacent(e.position, prev) && !isAdjacent(e.position, step),
    );
    for (const reactor of reactors) {
      const outcome = ruleset.onLeaveReach?.(next, reactor.id, entity.id, rng);
      if (!outcome) continue;
      if (segment.length) {
        events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
        from = prev;
        segment = [];
      }
      const r = applyOutcome(ruleset, placeAt(next, prev), outcome);
      next = r.state;
      events.push(...r.events);
    }
    const stillUp = next.entities[entity.id];
    if (!stillUp || !ruleset.isStanding(stillUp) || !ruleset.canAct(stillUp)) break;
    const tileFrom = next.map.tiles[prev.y * next.map.width + prev.x]!;
    const tileTo = next.map.tiles[step.y * next.map.width + step.x]!;
    spent += 1 + Math.max(0, tileTo.height - tileFrom.height) * ruleset.movement.climbCost;
    segment.push(step);
    prev = step;
    next = placeAt(next, step);
  }
  if (segment.length) events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
  next = { ...placeAt(next, prev), rng: rng.state, turn: { ...next.turn, movementUsed: next.turn.movementUsed + spent } };
  const ended = checkCombatEnd(ruleset, next);
  return { ok: true, state: ended.state, events: [...events, ...ended.events] };
};

export const ENGINE_COMMANDS: Readonly<Record<string, CommandHandler>> = { move, startCombat, endTurn, act };

/** Validates a command against the state and returns the new state plus events. Pure: never mutates `state`. */
export function applyCommand(ruleset: Ruleset, state: GameState, command: BaseCommand): ReturnType<CommandHandler> {
  const handler = ENGINE_COMMANDS[command.type] ?? ruleset.commands[command.type];
  if (!handler) return fail('unknown_command', `Unknown command type "${command.type}"`);
  return handler(state, command, { ruleset });
}
