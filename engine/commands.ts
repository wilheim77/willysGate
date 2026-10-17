import { act, applyOutcome, checkCombatEnd, endTurn, inCombat, isAdjacent, isHostile, startCombat } from './combat';
import { type BaseCommand, type CommandHandler, type GameEvent, fail, requireControlled } from './command-types';
import { type Vec2, inBounds, posKey } from './grid';
import { type PathResult, findPath } from './pathfinding';
import { surfaceAt } from './surfaces';
import { type EngineContent, chooseOption, dialogueOf, interact, startDialogue } from './dialogue';
import { RngCursor } from './rng';
import type { Ruleset } from './ruleset';
import type { Entity, GameState } from './state';

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
/** Whether an entity takes up its tile (see Ruleset.occupiesTile). */
export function occupies(ruleset: Ruleset, e: Entity): boolean {
  return ruleset.occupiesTile ? ruleset.occupiesTile(e) : ruleset.isStanding(e);
}

export function blockedTiles(ruleset: Ruleset, state: GameState, exceptId: string): Set<string> {
  return new Set(
    Object.values(state.entities)
      .filter((e) => e.id !== exceptId && occupies(ruleset, e))
      .map((e) => posKey(e.position)),
  );
}

/** Extra movement cost of entering a tile, from its surface (rubble, deep water...). */
export function surfaceCost(ruleset: Ruleset, state: GameState): (p: Vec2) => number {
  const defs = ruleset.surfaces ?? {};
  return (p) => {
    const s = surfaceAt(state, p);
    return s ? (defs[s.type]?.extraMoveCost ?? 0) : 0;
  };
}

/** How much a mover would rather not step on a tile (fire, electrified water...). */
export function surfaceHazard(ruleset: Ruleset, state: GameState): (p: Vec2) => number {
  const defs = ruleset.surfaces ?? {};
  return (p) => {
    const s = surfaceAt(state, p);
    return s ? (defs[s.type]?.hazard ?? 0) : 0;
  };
}

/**
 * The path a move command takes: the cheapest one that steers around hazards when it
 * can afford to, otherwise simply the cheapest. Clients use it to draw the same path.
 */
export function movePath(ruleset: Ruleset, state: GameState, moverId: string, to: Vec2, budget = Infinity): PathResult | null {
  const mover = state.entities[moverId]!;
  const base = { blocked: blockedTiles(ruleset, state, moverId), rules: ruleset.movement, extraCost: surfaceCost(ruleset, state) };
  return findPath(state.map, mover.position, to, { ...base, maxCost: budget, avoid: surfaceHazard(ruleset, state) }) ?? findPath(state.map, mover.position, to, base);
}

const move: CommandHandler<MoveCommand> = (state, cmd, { ruleset }) => {
  if (dialogueOf(state)) return fail('cannot_act', 'Finish the conversation first');
  const actor = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!actor.ok) return actor;
  const { entity } = actor;
  if (!inBounds(state.map, cmd.to)) return fail('out_of_bounds', 'Destination outside the map');

  const fighting = inCombat(state, entity.id);
  if (fighting) {
    if (state.turn.activeEntityId !== entity.id) return fail('not_your_turn', `It is ${state.turn.activeEntityId}'s turn`);
    if (!ruleset.canAct(entity)) return fail('cannot_act', `${entity.id} cannot act`);
  }

  const budget = fighting ? ruleset.movementBudget(entity, state) - state.turn.movementUsed : Infinity;
  const result = movePath(ruleset, state, entity.id, cmd.to, budget);
  if (!result) return fail('no_path', 'No path to destination');
  if (fighting) {
    const left = ruleset.movementBudget(entity, state) - state.turn.movementUsed;
    if (result.cost > left) return fail('out_of_range', `Path costs ${result.cost}, ${left} movement left`);
  }
  if (result.path.length === 0) return { ok: true, state, events: [] };

  // Walk step by step: in combat, leaving an enemy's reach gives it a chance to react
  // (an opportunity attack in 5e); anywhere, stepping into a surface triggers it.
  // Either can stop the move.
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
    const reactors = !fighting
      ? []
      : Object.values(next.entities).filter(
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
      const r = applyOutcome(ruleset, placeAt(next, prev), outcome, rng);
      next = r.state;
      events.push(...r.events);
    }
    const stillUp = next.entities[entity.id];
    if (!stillUp || !ruleset.isStanding(stillUp) || !ruleset.canAct(stillUp)) break;
    const tileFrom = next.map.tiles[prev.y * next.map.width + prev.x]!;
    const tileTo = next.map.tiles[step.y * next.map.width + step.x]!;
    spent += 1 + Math.max(0, tileTo.height - tileFrom.height) * ruleset.movement.climbCost + surfaceCost(ruleset, next)(step);
    segment.push(step);
    prev = step;
    next = placeAt(next, step);
    const surface = surfaceAt(next, step);
    if (surface && ruleset.onSurface) {
      events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
      from = step;
      segment = [];
      const before = new Set(next.entities[entity.id]!.conditions.map((c) => c.id));
      const r = applyOutcome(ruleset, next, ruleset.onSurface(next, entity.id, surface.type, 'enter', rng), rng);
      next = r.state;
      events.push(...r.events);
      const after = next.entities[entity.id];
      // A new condition (slipped and fell, stunned...) ends the walk where it happened.
      const struck = !!after && after.conditions.some((c) => !before.has(c.id));
      if (!after || struck || !ruleset.isStanding(after) || !ruleset.canAct(after) || (after.position.x !== step.x || after.position.y !== step.y)) {
        prev = after?.position ?? step;
        break;
      }
    }
  }
  if (segment.length) events.push({ type: 'entityMoved', entityId: entity.id, from, path: segment } as EntityMovedEvent);
  next = { ...placeAt(next, prev), rng: rng.state, turn: fighting ? { ...next.turn, movementUsed: next.turn.movementUsed + spent } : next.turn };
  const ended = checkCombatEnd(ruleset, next);
  return { ok: true, state: ended.state, events: [...events, ...ended.events] };
};

export const ENGINE_COMMANDS: Readonly<Record<string, CommandHandler>> = { move, startCombat, endTurn, act, startDialogue, chooseOption, interact };

/** Validates a command against the state and returns the new state plus events. Pure: never mutates `state`. */
export function applyCommand(ruleset: Ruleset, state: GameState, command: BaseCommand, content?: EngineContent): ReturnType<CommandHandler> {
  const handler = ENGINE_COMMANDS[command.type] ?? ruleset.commands[command.type];
  if (!handler) return fail('unknown_command', `Unknown command type "${command.type}"`);
  return handler(state, command, { ruleset, ...(content ? { content } : {}) });
}
