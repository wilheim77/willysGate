import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, SYSTEM_ISSUER, createEngine, isEvent, nextAiCommand } from '../../engine';
import { asciiMap, deepFreeze, makeEntity } from '../fixtures/helpers';
import { toyRuleset } from '../fixtures/toyRuleset';

const engine = createEngine(toyRuleset, 'toy-game');
const pool = (n: number) => ({ current: n, max: n });
const fighter = (id: string, faction: string, x: number, y: number, extra: object = {}) =>
  makeEntity({
    id,
    factionId: faction,
    controllerId: faction === 'hunters' ? 'player:1' : 'ai',
    position: { x, y },
    stats: { will: id === 'van' ? 10 : 0, stride: 3 },
    resources: { blood: pool(6), action: pool(1), reaction: pool(1) },
    ...extra,
  });

function setup(): GameState {
  return deepFreeze(
    engine.newGame({
      seed: 5,
      map: asciiMap(['........', '........', '........']),
      entities: [fighter('van', 'hunters', 0, 0), fighter('nos', 'night', 2, 0), fighter('ghoul', 'night', 7, 2)],
    }),
  );
}

function run(state: GameState, cmd: BaseCommand) {
  const r = engine.apply(state, cmd);
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.error.code} ${r.error.message}`);
  return r;
}

const start = (s: GameState) => run(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['van', 'nos', 'ghoul'] } as never);

describe('combat flow', () => {
  it('only the system can start combat, and it needs two factions', () => {
    expect(engine.apply(setup(), { type: 'startCombat', issuer: 'player:1', participants: ['van', 'nos'] } as never).ok).toBe(false);
    expect(engine.apply(setup(), { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['nos', 'ghoul'] } as never).ok).toBe(false);
  });

  it('rolls initiative through the ruleset, orders participants and starts the first turn', () => {
    const r = start(setup());
    const { turn } = r.state;
    expect(turn.mode).toBe('combat');
    expect(turn.round).toBe(1);
    expect(turn.order[0]).toBe('van'); // +10 will dominates 2d6
    expect([...turn.order].sort()).toEqual(['ghoul', 'nos', 'van']);
    expect(turn.activeEntityId).toBe('van');
    expect(r.events[0]).toMatchObject({ type: 'combatStarted' });
    expect(r.events.some((e) => isEvent(e, 'turnStarted'))).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    expect(start(setup()).state.turn).toEqual(start(setup()).state.turn);
  });

  it('rejects acting out of turn and spends action costs', () => {
    const s = start(setup()).state;
    const second = s.turn.order[1]!;
    expect(engine.apply(s, { type: 'endTurn', issuer: 'ai', entityId: second } as never)).toMatchObject({ ok: false, error: { code: 'not_your_turn' } });
    const walked = run(s, { type: 'move', issuer: 'player:1', entityId: 'van', to: { x: 1, y: 0 } } as never).state;
    const bit = run(walked, { type: 'act', issuer: 'player:1', entityId: 'van', actionId: 'bite', target: { entityId: 'nos' } } as never);
    expect(bit.state.entities.van!.resources.action!.current).toBe(0);
    expect(bit.events[0]).toMatchObject({ type: 'actionPerformed', actorId: 'van', actionId: 'bite' });
    expect(engine.apply(bit.state, { type: 'act', issuer: 'player:1', entityId: 'van', actionId: 'bite', target: { entityId: 'nos' } } as never)).toMatchObject({
      ok: false,
      error: { code: 'not_enough_resources' },
    });
  });

  it('checks range and target filters generically', () => {
    const s = start(setup()).state;
    expect(engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'van', actionId: 'bite', target: { entityId: 'nos' } } as never)).toMatchObject({
      ok: false,
      error: { code: 'out_of_range' },
    });
    expect(engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'van', actionId: 'mend', target: { entityId: 'nos' } } as never)).toMatchObject({
      ok: false,
      error: { code: 'invalid_target' },
    });
  });

  it('limits movement per turn and resets it next turn', () => {
    let s = start(setup()).state;
    s = run(s, { type: 'move', issuer: 'player:1', entityId: 'van', to: { x: 0, y: 2 } } as never).state;
    expect(s.turn.movementUsed).toBe(2);
    expect(engine.apply(s, { type: 'move', issuer: 'player:1', entityId: 'van', to: { x: 2, y: 2 } } as never)).toMatchObject({
      ok: false,
      error: { code: 'out_of_range' },
    });
    expect(run(s, { type: 'move', issuer: 'player:1', entityId: 'van', to: { x: 1, y: 2 } } as never).state.turn.movementUsed).toBe(3);
  });

  it('cycles turns, increments rounds and refreshes per-turn resources', () => {
    let s = start(setup()).state;
    s = run(s, { type: 'move', issuer: 'player:1', entityId: 'van', to: { x: 1, y: 0 } } as never).state;
    s = run(s, { type: 'act', issuer: 'player:1', entityId: 'van', actionId: 'bite', target: { entityId: 'nos' } } as never).state;
    for (const id of s.turn.order) s = run(s, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: id } as never).state;
    expect(s.turn.round).toBe(2);
    expect(s.turn.activeEntityId).toBe('van');
    expect(s.entities.van!.resources.action!.current).toBe(1);
  });

  it('expires timed conditions at the end of the owner turn', () => {
    let s = start(setup()).state;
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'van', condition: 'bitten', remainingTurns: 1 }]).state;
    const r = run(s, { type: 'endTurn', issuer: 'player:1', entityId: 'van' } as never);
    expect(r.state.entities.van!.conditions).toEqual([]);
    expect(r.events).toContainEqual({ type: 'conditionRemoved', entityId: 'van', condition: 'bitten' });
  });

  it('skips the turn of creatures that cannot act', () => {
    let s = start(setup()).state;
    const second = s.turn.order[1]!;
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: second, condition: 'staked' }]).state;
    s = run(s, { type: 'endTurn', issuer: 'player:1', entityId: 'van' } as never).state;
    expect(s.turn.activeEntityId).toBe(s.turn.order[2]);
  });

  it('ends combat when only one faction is standing', () => {
    let s = start(setup()).state;
    s = engine.applyEffects(s, [
      { type: 'modifyResource', entityId: 'nos', resource: 'blood', delta: -99 },
      { type: 'modifyResource', entityId: 'ghoul', resource: 'blood', delta: -99 },
    ]).state;
    const r = run(s, { type: 'endTurn', issuer: 'player:1', entityId: 'van' } as never);
    expect(r.state.turn.mode).toBe('exploration');
    expect(r.events).toContainEqual({ type: 'combatEnded', winner: 'hunters' });
  });

  it('gives enemies a reaction when you leave their reach, and it can stop you', () => {
    let s = start(setup()).state;
    s = run(s, { type: 'move', issuer: 'player:1', entityId: 'van', to: { x: 1, y: 0 } } as never).state;
    const fled = run(s, { type: 'move', issuer: 'player:1', entityId: 'van', to: { x: 1, y: 2 } } as never);
    expect(fled.events.some((e) => e.type === 'toyGrab')).toBe(true);
    expect(fled.state.entities.van!.resources.blood!.current).toBe(4);
    expect(fled.state.entities.nos!.resources.reaction!.current).toBe(0);
    expect(fled.state.entities.van!.position).toEqual({ x: 1, y: 2 });

    // At 2 blood the grab drops van mid-move: they stay where they were grabbed.
    const weak = engine.applyEffects(s, [{ type: 'modifyResource', entityId: 'van', resource: 'blood', delta: -4 }]).state;
    const stopped = run(weak, { type: 'move', issuer: 'player:1', entityId: 'van', to: { x: 1, y: 2 } } as never);
    // The first step stays in reach (diagonal), so the grab happens leaving (1, 1).
    expect(stopped.state.entities.van!.position).toEqual({ x: 1, y: 1 });
  });

  it('survives a save round trip mid-combat', () => {
    const s = start(setup()).state;
    expect(engine.deserialize(engine.serialize(s))).toEqual(s);
  });
});

describe('generic AI', () => {
  it('walks into reach, attacks, then ends its turn', () => {
    let s = engine.newGame({
      seed: 9,
      map: asciiMap(['......']),
      entities: [fighter('van', 'hunters', 0, 0), fighter('nos', 'night', 3, 0, { stats: { will: 20, stride: 3 } })],
    });
    s = start({ ...s, entities: s.entities } as GameState) && run(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['van', 'nos'] } as never).state;
    expect(s.turn.activeEntityId).toBe('nos');
    const steps: string[] = [];
    for (let i = 0; i < 5 && s.turn.activeEntityId === 'nos'; i++) {
      const cmd = nextAiCommand(toyRuleset, s, 'nos');
      steps.push(cmd.type);
      s = run(s, cmd).state;
    }
    expect(steps).toEqual(['move', 'act', 'endTurn']);
  });

  it('heals a wounded ally rather than idling', () => {
    let s = engine.newGame({
      seed: 3,
      map: asciiMap(['.......']),
      entities: [
        fighter('nos', 'night', 0, 0, { stats: { will: 20, stride: 3 } }),
        fighter('ghoul', 'night', 2, 0, { resources: { blood: { current: 1, max: 6 }, action: pool(1), reaction: pool(1) } }),
        fighter('van', 'hunters', 6, 0),
      ],
    });
    s = run(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['nos', 'ghoul', 'van'] } as never).state;
    expect(nextAiCommand(toyRuleset, s, 'nos')).toMatchObject({ type: 'act', actionId: 'mend', target: { entityId: 'ghoul' } });
  });
});
