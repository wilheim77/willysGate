import { applyOutcome } from './combat';
import { type BaseCommand, type CommandHandler, type GameEvent, fail, requireControlled } from './command-types';
import { type Vec2, gridDistance, posKey } from './grid';
import { RngCursor } from './rng';
import type { CheckResult } from './ruleset';
import type { GameState, JsonValue } from './state';

/**
 * Traps: hidden until someone notices them, armed until triggered or disarmed. The engine
 * keeps them and decides *when* (stepping in, walking near, trying to disarm); the ruleset
 * decides *what* (passive Perception, a DEX save, 2d6 piercing) from the trap's params.
 */
export interface Trap {
  id: string;
  tiles: Vec2[];
  hidden: boolean;
  armed: boolean;
  /** Ruleset data, e.g. { detect: 13, save: 'dex', dc: 13, damage: '2d6', type: 'piercing' }. */
  params: Record<string, JsonValue>;
  /** How to disarm it: a check through the ruleset. Failing by `triggerOnFailBy` or more sets it off. */
  disarm?: { check: string; dc: number; triggerOnFailBy?: number };
}

/** Walking within this many tiles of a hidden trap gives a chance to notice it. */
export const NOTICE_RANGE = 2;
/** The disarmer must stand this close to one of the trap's tiles. */
export const DISARM_RANGE = 2;

export function trapsOf(state: GameState): Trap[] {
  return (state.systems.traps as unknown as Trap[] | undefined) ?? [];
}

export function withTraps(state: GameState, traps: Trap[]): GameState {
  return { ...state, systems: { ...state.systems, traps: traps as unknown as JsonValue } };
}

export function trapAt(state: GameState, p: Vec2): Trap | undefined {
  const key = posKey(p);
  return trapsOf(state).find((t) => t.tiles.some((x) => posKey(x) === key));
}

function updateTrap(state: GameState, id: string, change: Partial<Trap>): GameState {
  return withTraps(state, trapsOf(state).map((t) => (t.id === id ? { ...t, ...change } : t)));
}

export function distanceToTrap(trap: Trap, p: Vec2): number {
  return Math.min(...trap.tiles.map((t) => gridDistance(t, p)));
}

export interface TrapEvent extends GameEvent {
  type: 'trapSpotted' | 'trapTriggered' | 'trapDisarmed' | 'trapDisarmFailed';
  trapId: string;
  entityId: string;
  /** The disarm roll, for the UI. */
  result?: CheckResult;
}

/**
 * Called by the move command after each step. Returns the new state, events, and whether
 * the walk must stop (stepped on a trap, or just spotted one).
 */
export function trapsAfterStep(state: GameState, entityId: string, rng: RngCursor, ruleset: Parameters<typeof applyOutcome>[0]): { state: GameState; events: GameEvent[]; stop: boolean } {
  let next = state;
  const events: GameEvent[] = [];
  const mover = next.entities[entityId];
  if (!mover) return { state: next, events, stop: false };

  const under = trapsOf(next).find((t) => t.armed && t.tiles.some((x) => x.x === mover.position.x && x.y === mover.position.y));
  if (under) {
    next = updateTrap(next, under.id, { armed: false, hidden: false });
    events.push({ type: 'trapTriggered', trapId: under.id, entityId } as TrapEvent);
    if (ruleset.triggerTrap) {
      const r = applyOutcome(ruleset, next, ruleset.triggerTrap(next, entityId, under, rng), rng);
      next = r.state;
      events.push(...r.events);
    }
    return { state: next, events, stop: true };
  }

  let spotted = false;
  for (const t of trapsOf(next)) {
    if (!t.hidden || !t.armed || distanceToTrap(t, mover.position) > NOTICE_RANGE) continue;
    if (ruleset.noticeTrap?.(next, entityId, t)) {
      next = updateTrap(next, t.id, { hidden: false });
      events.push({ type: 'trapSpotted', trapId: t.id, entityId } as TrapEvent);
      spotted = true;
    }
  }
  return { state: next, events, stop: spotted };
}

export interface DisarmTrapCommand extends BaseCommand {
  type: 'disarmTrap';
  entityId: string;
  trapId: string;
}

export const disarmTrap: CommandHandler<DisarmTrapCommand> = (state, cmd, { ruleset }) => {
  const actor = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!actor.ok) return actor;
  if (state.turn.mode === 'combat' && state.turn.activeEntityId !== cmd.entityId) return fail('not_your_turn', 'Not your turn');
  if (!ruleset.canAct(actor.entity)) return fail('cannot_act', `${cmd.entityId} cannot act`);
  const trap = trapsOf(state).find((t) => t.id === cmd.trapId);
  if (!trap || trap.hidden || !trap.armed || !trap.disarm) return fail('invalid_target', 'No trap to disarm there');
  if (distanceToTrap(trap, actor.entity.position) > DISARM_RANGE) return fail('out_of_range', 'Too far from the trap');

  const rng = new RngCursor(state.rng);
  const result = ruleset.resolveCheck(state, { actorId: cmd.entityId, check: trap.disarm.check, target: trap.disarm.dc }, rng);
  if (result.success) {
    const next = updateTrap(state, trap.id, { armed: false });
    return { ok: true, state: { ...next, rng: rng.state }, events: [{ type: 'trapDisarmed', trapId: trap.id, entityId: cmd.entityId, result } as TrapEvent] };
  }
  const events: GameEvent[] = [{ type: 'trapDisarmFailed', trapId: trap.id, entityId: cmd.entityId, result } as TrapEvent];
  let next = state;
  const by = trap.disarm.triggerOnFailBy;
  if (by !== undefined && result.total <= trap.disarm.dc - by) {
    next = updateTrap(next, trap.id, { armed: false });
    events.push({ type: 'trapTriggered', trapId: trap.id, entityId: cmd.entityId } as TrapEvent);
    if (ruleset.triggerTrap) {
      const r = applyOutcome(ruleset, next, ruleset.triggerTrap(next, cmd.entityId, trap, rng), rng);
      next = r.state;
      events.push(...r.events);
    }
  }
  return { ok: true, state: { ...next, rng: rng.state }, events };
};
