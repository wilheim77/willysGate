import { describe, expect, it } from 'vitest';
import { type GameState, createEngine, extendRuleset } from '../../engine';
import { asciiMap, deepFreeze, makeEntity } from '../fixtures/helpers';
import { toyRuleset } from '../fixtures/toyRuleset';

const engine = createEngine(toyRuleset, 'toy-game');

function setup(): GameState {
  return deepFreeze(
    engine.newGame({
      seed: 1,
      map: asciiMap([
        '....',
        '.#..',
        '....',
      ]),
      entities: [
        makeEntity({
          id: 'hunter',
          position: { x: 0, y: 0 },
          stats: { stride: 2, will: 1 },
          resources: { faith: { current: 1, max: 3 }, thirst: { current: 2, max: 5 } },
        }),
        makeEntity({ id: 'vampire', controllerId: 'ai', factionId: 'night', position: { x: 3, y: 2 } }),
      ],
    }),
  );
}

const move = (to: { x: number; y: number }, entityId = 'hunter', issuer = 'player:1') => ({ type: 'move', issuer, entityId, to });

describe('MoveCommand', () => {
  it('moves the entity and emits the path', () => {
    const r = engine.apply(setup(), move({ x: 3, y: 0 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.entities.hunter!.position).toEqual({ x: 3, y: 0 });
    expect(r.events).toEqual([
      { type: 'entityMoved', entityId: 'hunter', from: { x: 0, y: 0 }, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    ]);
  });

  it('does not mutate the previous state (frozen input)', () => {
    const state = setup();
    expect(engine.apply(state, move({ x: 2, y: 2 })).ok).toBe(true);
    expect(state.entities.hunter!.position).toEqual({ x: 0, y: 0 });
  });

  it('rejects commands from a controller that does not own the entity', () => {
    expect(engine.apply(setup(), move({ x: 2, y: 2 }, 'vampire'))).toMatchObject({ ok: false, error: { code: 'not_your_entity' } });
  });

  it('rejects unknown entities', () => {
    expect(engine.apply(setup(), move({ x: 1, y: 0 }, 'nobody'))).toMatchObject({ ok: false, error: { code: 'unknown_entity' } });
  });

  it('rejects unreachable and out-of-bounds destinations', () => {
    const state = setup();
    expect(engine.apply(state, move({ x: 1, y: 1 }))).toMatchObject({ ok: false, error: { code: 'no_path' } });
    expect(engine.apply(state, move({ x: 9, y: 9 }))).toMatchObject({ ok: false, error: { code: 'out_of_bounds' } });
  });

  it('cannot end on a tile occupied by another entity', () => {
    expect(engine.apply(setup(), move({ x: 3, y: 2 }))).toMatchObject({ ok: false, error: { code: 'no_path' } });
  });

  it('asks the ruleset for the movement budget, in combat only', () => {
    const base = setup();
    expect(engine.apply(base, move({ x: 3, y: 0 })).ok).toBe(true);
    const combat: GameState = { ...base, turn: { mode: 'combat', round: 1, activeEntityId: 'hunter', order: ['hunter', 'vampire'], initiative: {}, movementUsed: 0 } };
    expect(engine.apply(combat, move({ x: 3, y: 0 }))).toMatchObject({ ok: false, error: { code: 'out_of_range' } });
    expect(engine.apply(combat, move({ x: 2, y: 0 })).ok).toBe(true);
  });

  it('honours a controller change at runtime (companion turns hostile)', () => {
    const base = setup();
    const turned: GameState = {
      ...base,
      entities: { ...base.entities, hunter: { ...base.entities.hunter!, controllerId: 'ai', factionId: 'valcarcel' } },
    };
    expect(engine.apply(turned, move({ x: 1, y: 0 }))).toMatchObject({ ok: false, error: { code: 'not_your_entity' } });
  });
});

describe('command routing', () => {
  it('routes ruleset commands to the ruleset', () => {
    const r = engine.apply(setup(), { type: 'pray', issuer: 'player:1', entityId: 'hunter' } as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.entities.hunter!.resources).toEqual({ faith: { current: 2, max: 3 }, thirst: { current: 1, max: 5 } });
  });

  it('rejects unknown commands', () => {
    expect(engine.apply(setup(), { type: 'fly', issuer: 'player:1' })).toMatchObject({ ok: false, error: { code: 'unknown_command' } });
  });

  it('forbids rulesets from redefining engine commands', () => {
    const bad = extendRuleset(toyRuleset, { id: 'bad', commands: { move: () => ({ ok: false, error: { code: 'x', message: '' } }) } });
    expect(() => createEngine(bad, 'g')).toThrow(/move/);
  });
});
