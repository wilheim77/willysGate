import {
  type BaseCommand,
  type CommandHandler,
  type GameEvent,
  SYSTEM_ISSUER,
  fail,
  requireControlled,
} from './command-types';
import { type Effect, type EffectEvent, applyEffects } from './effects';
import { type Vec2, gridDistance } from './grid';
import { RngCursor } from './rng';
import { type ActionOutcome, type ActionTarget, type Ruleset, targetIds } from './ruleset';
import { EXPLORATION_TURN, type Entity, type GameState } from './state';

// --- Commands & events ------------------------------------------------------

export interface StartCombatCommand extends BaseCommand {
  type: 'startCombat';
  participants: string[];
}

export interface EndTurnCommand extends BaseCommand {
  type: 'endTurn';
  entityId: string;
}

export interface ActCommand extends BaseCommand {
  type: 'act';
  entityId: string;
  actionId: string;
  target: ActionTarget;
}

export interface CombatStartedEvent extends GameEvent {
  type: 'combatStarted';
  order: string[];
  initiative: Record<string, number>;
}

export interface TurnStartedEvent extends GameEvent {
  type: 'turnStarted';
  entityId: string;
  round: number;
}

export interface CombatEndedEvent extends GameEvent {
  type: 'combatEnded';
  /** Faction left standing, or null if nobody is. */
  winner: string | null;
}

export interface ActionPerformedEvent extends GameEvent {
  type: 'actionPerformed';
  actorId: string;
  actionId: string;
  target: ActionTarget;
}

// --- Helpers ------------------------------------------------------------------

/** Different factions fight each other. Finer relations (neutral, allied factions) can come later. */
export function isHostile(a: Entity, b: Entity): boolean {
  return a.factionId !== b.factionId;
}

export function isAdjacent(a: Vec2, b: Vec2): boolean {
  return gridDistance(a, b) === 1;
}

export function inCombat(state: GameState, entityId: string): boolean {
  return state.turn.mode === 'combat' && state.turn.order.includes(entityId);
}

/** Applies an outcome (effects + ruleset events) and returns the merged event list. */
export function applyOutcome(
  ruleset: Ruleset,
  state: GameState,
  outcome: ActionOutcome,
): { state: GameState; events: (GameEvent | EffectEvent)[] } {
  const applied = applyEffects(ruleset, state, outcome.effects);
  return { state: applied.state, events: [...outcome.events, ...applied.events] };
}

/** Refills every resource the ruleset marks as per-turn. */
function refreshTurnResources(ruleset: Ruleset, entity: Entity): Effect[] {
  return Object.entries(entity.resources)
    .filter(([id, r]) => ruleset.resources[id]?.refresh === 'turn' && r.current < r.max)
    .map(([id, r]) => ({ type: 'modifyResource', entityId: entity.id, resource: id, delta: r.max - r.current }));
}

/** Ends combat when at most one faction still has someone standing. */
export function checkCombatEnd(ruleset: Ruleset, state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.turn.mode !== 'combat') return { state, events: [] };
  const standing = new Set(
    state.turn.order
      .map((id) => state.entities[id])
      .filter((e): e is Entity => !!e && ruleset.isStanding(e))
      .map((e) => e.factionId),
  );
  if (standing.size > 1) return { state, events: [] };
  const winner = standing.size === 1 ? [...standing][0]! : null;
  const ended: CombatEndedEvent = { type: 'combatEnded', winner };
  let next: GameState = { ...state, turn: { ...EXPLORATION_TURN } };
  const events: GameEvent[] = [ended];
  if (ruleset.onCombatEnd) {
    const r = applyOutcome(ruleset, next, ruleset.onCombatEnd(next, winner));
    next = r.state;
    events.push(...r.events);
  }
  // Nobody tracks turns any more: per-turn resources come back.
  for (const e of Object.values(next.entities)) next = applyEffects(ruleset, next, refreshTurnResources(ruleset, e)).state;
  return { state: next, events };
}

/**
 * Starts `entityId`'s turn: refresh per-turn resources, run the ruleset's start-of-turn
 * rules, and skip ahead while the active entity cannot act (unconscious, dead...).
 */
function beginTurn(ruleset: Ruleset, state: GameState, entityId: string, rng: RngCursor): { state: GameState; events: GameEvent[] } {
  let next = state;
  const events: GameEvent[] = [];
  let id = entityId;
  for (let guard = 0; guard <= next.turn.order.length; guard++) {
    const entity = next.entities[id];
    next = { ...next, turn: { ...next.turn, activeEntityId: id, movementUsed: 0 } };
    events.push({ type: 'turnStarted', entityId: id, round: next.turn.round } as TurnStartedEvent);
    if (entity) {
      const refreshed = applyEffects(ruleset, next, refreshTurnResources(ruleset, entity));
      next = refreshed.state;
      if (ruleset.onTurnStart) {
        const r = applyOutcome(ruleset, next, ruleset.onTurnStart(next, id, rng));
        next = r.state;
        events.push(...r.events);
      }
    }
    const ended = checkCombatEnd(ruleset, next);
    if (ended.events.length) return { state: ended.state, events: [...events, ...ended.events] };
    const current = next.entities[id];
    if (current && ruleset.canAct(current)) return { state: next, events };
    const advanced = advanceOrder(next);
    next = advanced.state;
    id = advanced.nextId;
  }
  return { state: next, events };
}

/** Moves the turn pointer to the next participant, increasing the round when it wraps. */
function advanceOrder(state: GameState): { state: GameState; nextId: string } {
  const { order, activeEntityId, round } = state.turn;
  const index = order.indexOf(activeEntityId ?? '');
  const nextIndex = (index + 1) % order.length;
  return {
    state: { ...state, turn: { ...state.turn, round: nextIndex === 0 ? round + 1 : round } },
    nextId: order[nextIndex]!,
  };
}

/** Counts down timed conditions at the end of the entity's own turn. */
function decrementConditions(state: GameState, entityId: string): GameState {
  const e = state.entities[entityId];
  if (!e) return state;
  const conditions = e.conditions.map((c) => (c.remainingTurns === undefined ? c : { ...c, remainingTurns: c.remainingTurns - 1 }));
  return { ...state, entities: { ...state.entities, [entityId]: { ...e, conditions } } };
}

// --- Handlers -------------------------------------------------------------------

export const startCombat: CommandHandler<StartCombatCommand> = (state, cmd, { ruleset }) => {
  if (cmd.issuer !== SYSTEM_ISSUER) return fail('not_your_entity', 'Only the system starts combat');
  const participants = cmd.participants.filter((id) => state.entities[id]);
  const factions = new Set(participants.map((id) => state.entities[id]!.factionId));
  if (factions.size < 2) return fail('invalid_target', 'Combat needs at least two factions');

  const rng = new RngCursor(state.rng);
  const initiative: Record<string, number> = {};
  for (const id of participants) initiative[id] = ruleset.rollInitiative(state, id, rng);
  const order = [...participants].sort((a, b) => initiative[b]! - initiative[a]! || a.localeCompare(b));

  const started: GameState = {
    ...state,
    rng: rng.state,
    turn: { mode: 'combat', round: 1, activeEntityId: null, order, initiative, movementUsed: 0 },
  };
  const first = beginTurn(ruleset, started, order[0]!, rng);
  return {
    ok: true,
    state: { ...first.state, rng: rng.state },
    events: [{ type: 'combatStarted', order, initiative } as CombatStartedEvent, ...first.events],
  };
};

export const endTurn: CommandHandler<EndTurnCommand> = (state, cmd, { ruleset }) => {
  if (state.turn.mode !== 'combat') return fail('not_in_combat', 'No combat in progress');
  if (state.turn.activeEntityId !== cmd.entityId) return fail('not_your_turn', `It is ${state.turn.activeEntityId}'s turn`);
  if (cmd.issuer !== SYSTEM_ISSUER) {
    const actor = requireControlled(state, cmd.issuer, cmd.entityId);
    if (!actor.ok) return actor;
  }
  const ticked = decrementConditions(state, cmd.entityId);
  const expiredEffects: Effect[] = ticked.entities[cmd.entityId]!.conditions
    .filter((c) => c.remainingTurns !== undefined && c.remainingTurns <= 0)
    .map((c) => ({ type: 'removeCondition', entityId: cmd.entityId, condition: c.id }));
  const expired = applyEffects(ruleset, ticked, expiredEffects);

  const advanced = advanceOrder(expired.state);
  const rng = new RngCursor(advanced.state.rng);
  const begun = beginTurn(ruleset, advanced.state, advanced.nextId, rng);
  return { ok: true, state: { ...begun.state, rng: rng.state }, events: [...expired.events, ...begun.events] };
};

export const act: CommandHandler<ActCommand> = (state, cmd, { ruleset }) => {
  const actor = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!actor.ok) return actor;
  const { entity } = actor;
  if (state.turn.mode === 'combat' && inCombat(state, entity.id) && state.turn.activeEntityId !== entity.id) {
    return fail('not_your_turn', `It is ${state.turn.activeEntityId}'s turn`);
  }
  if (!ruleset.canAct(entity)) return fail('cannot_act', `${entity.id} cannot act`);

  const action = ruleset.listActions(state, entity.id).find((a) => a.id === cmd.actionId);
  if (!action) return fail('unknown_action', `No action "${cmd.actionId}" for ${entity.id}`);
  for (const [resource, amount] of Object.entries(action.cost)) {
    if ((entity.resources[resource]?.current ?? 0) < amount) return fail('not_enough_resources', `Needs ${amount} ${resource}`);
  }

  // Generic targeting checks; rules-specific ones (line of sight, conditions) are the ruleset's.
  if (action.target.kind === 'creature') {
    const ids = targetIds(cmd.target);
    if (ids.length === 0) return fail('invalid_target', 'Missing target');
    if (ids.length > (action.target.maxTargets ?? 1)) return fail('invalid_target', 'Too many targets');
    if (!action.target.allowRepeat && new Set(ids).size !== ids.length) return fail('invalid_target', 'Repeated target');
    for (const id of ids) {
      const target = state.entities[id];
      if (!target) return fail('invalid_target', `Unknown target ${id}`);
      if (gridDistance(entity.position, target.position) > action.target.range) return fail('out_of_range', 'Target out of range');
      const filter = action.target.filter ?? 'any';
      if (filter === 'hostile' && !isHostile(entity, target)) return fail('invalid_target', 'Target is not hostile');
      if (filter === 'ally' && isHostile(entity, target)) return fail('invalid_target', 'Target is not an ally');
    }
  } else {
    const targetPos = targetPosition(state, entity, action.target.kind, cmd.target);
    if (!targetPos) return fail('invalid_target', 'Missing or unknown target');
    if (gridDistance(entity.position, targetPos) > action.target.range) return fail('out_of_range', 'Target out of range');
  }
  const preview = ruleset.previewAction(state, entity.id, action.id, cmd.target);
  if (!preview.valid) return fail('action_invalid', preview.reason ?? 'Invalid action');

  const rng = new RngCursor(state.rng);
  const outcome = ruleset.performAction(state, entity.id, action.id, cmd.target, rng);
  const cost: Effect[] = Object.entries(action.cost).map(([resource, amount]) => ({
    type: 'modifyResource',
    entityId: entity.id,
    resource,
    delta: -amount,
  }));
  const performed: ActionPerformedEvent = { type: 'actionPerformed', actorId: entity.id, actionId: action.id, target: cmd.target };
  const paid = applyEffects(ruleset, { ...state, rng: rng.state }, cost);
  const resolved = applyOutcome(ruleset, paid.state, outcome);
  let next = resolved.state;
  const events: GameEvent[] = [performed, ...paid.events, ...resolved.events];

  // Out of combat nobody tracks turns: per-turn resources come straight back.
  if (state.turn.mode !== 'combat') {
    const actorNow = next.entities[entity.id];
    if (actorNow) next = applyEffects(ruleset, next, refreshTurnResources(ruleset, actorNow)).state;
  }
  const ended = checkCombatEnd(ruleset, next);
  return { ok: true, state: ended.state, events: [...events, ...ended.events] };
};

function targetPosition(state: GameState, actor: Entity, kind: 'self' | 'creature' | 'tile', target: ActionTarget): Vec2 | null {
  if (kind === 'self') return actor.position;
  if (kind === 'creature') return (target.entityId && state.entities[target.entityId]?.position) || null;
  return target.tile ?? null;
}
