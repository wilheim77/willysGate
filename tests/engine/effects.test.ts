import { describe, expect, it } from 'vitest';
import { applyEffects, createEngine, deriveSeed, performCheck } from '../../engine';
import { asciiMap, deepFreeze, makeEntity } from '../fixtures/helpers';
import { toyRuleset } from '../fixtures/toyRuleset';

const engine = createEngine(toyRuleset, 'toy-game');
const state = deepFreeze(
  engine.newGame({
    seed: 3,
    map: asciiMap(['..']),
    entities: [makeEntity({ id: 'h', stats: { will: 2 }, resources: { blood: { current: 5, max: 8 } } })],
  }),
);

describe('effects', () => {
  it('modifies generic resources and clamps to [0, max]', () => {
    const up = applyEffects(toyRuleset, state, [{ type: 'modifyResource', entityId: 'h', resource: 'blood', delta: 10 }]);
    expect(up.state.entities.h!.resources.blood).toEqual({ current: 8, max: 8 });
    expect(up.events).toEqual([{ type: 'resourceChanged', entityId: 'h', resource: 'blood', from: 5, to: 8 }]);
    const down = applyEffects(toyRuleset, state, [{ type: 'modifyResource', entityId: 'h', resource: 'blood', delta: -99 }]);
    expect(down.state.entities.h!.resources.blood!.current).toBe(0);
  });

  it('applies and removes ruleset conditions without stacking', () => {
    const a = applyEffects(toyRuleset, state, [
      { type: 'applyCondition', entityId: 'h', condition: 'bitten', remainingTurns: 2 },
      { type: 'applyCondition', entityId: 'h', condition: 'bitten', remainingTurns: 3 },
    ]);
    expect(a.state.entities.h!.conditions).toEqual([{ id: 'bitten', remainingTurns: 3 }]);
    const b = applyEffects(toyRuleset, a.state, [{ type: 'removeCondition', entityId: 'h', condition: 'bitten' }]);
    expect(b.state.entities.h!.conditions).toEqual([]);
    expect(b.events).toEqual([{ type: 'conditionRemoved', entityId: 'h', condition: 'bitten' }]);
  });

  it('sets story flags', () => {
    const r = applyEffects(toyRuleset, state, [{ type: 'setFlag', flag: 'met_baron', value: true }]);
    expect(r.state.flags).toEqual({ met_baron: true });
  });

  it('throws on resources or conditions the ruleset does not define', () => {
    expect(() => applyEffects(toyRuleset, state, [{ type: 'modifyResource', entityId: 'h', resource: 'spell_slot_1', delta: -1 }])).toThrow();
    expect(() => applyEffects(toyRuleset, state, [{ type: 'applyCondition', entityId: 'h', condition: 'prone' }])).toThrow();
    expect(() => applyEffects(toyRuleset, state, [{ type: 'modifyResource', entityId: 'h', resource: 'faith', delta: 1 }])).toThrow(/no resource/);
  });
});

describe('checks', () => {
  it('delegates to the ruleset and advances the RNG in the state', () => {
    const { state: next, result } = performCheck(toyRuleset, state, { actorId: 'h', check: 'resist', target: 9 });
    expect(result.dice[0]!.sides).toBe(6);
    expect(result.total).toBe(result.dice[0]!.rolls[0]! + result.dice[0]!.rolls[1]! + 2);
    expect(next.rng).not.toEqual(state.rng);
    // Same state, same roll: checks are reproducible.
    expect(performCheck(toyRuleset, state, { actorId: 'h', check: 'resist', target: 9 }).result).toEqual(result);
  });
});

describe('modifyStat and deriveSeed (R19, R12)', () => {
  it('changes a ruleset stat and refuses unknown ones', () => {
    const s = createEngine(toyRuleset, 'test').newGame({ seed: 1, map: asciiMap(['..']), entities: [makeEntity({ id: 'a', stats: { will: 2 } })] });
    const r = applyEffects(toyRuleset, s, [{ type: 'modifyStat', entityId: 'a', stat: 'will', delta: 1 }]);
    expect(r.state.entities.a!.stats.will).toBe(3);
    expect(() => applyEffects(toyRuleset, s, [{ type: 'modifyStat', entityId: 'a', stat: 'luck', delta: 1 }])).toThrow();
  });

  it('derived seeds are stable and independent per purpose', () => {
    expect(deriveSeed(42, 'floor', 3)).toBe(deriveSeed(42, 'floor', 3));
    expect(deriveSeed(42, 'floor', 3)).not.toBe(deriveSeed(42, 'floor', 4));
    expect(deriveSeed(42, 'loot')).not.toBe(deriveSeed(43, 'loot'));
  });
});

describe('summons (R13)', () => {
  it('spawn joins the fight after its owner and leaves when its rounds run out', () => {
    const e = createEngine(toyRuleset, 'test');
    const pool = (n: number) => ({ current: n, max: n });
    let s = e.newGame({ seed: 1, map: asciiMap(['......']), entities: [makeEntity({ id: 'a', resources: { blood: pool(5) } }), makeEntity({ id: 'z', factionId: 'night', controllerId: 'ai', position: { x: 5, y: 0 }, resources: { blood: pool(5) } })] });
    const started = e.apply(s, { type: 'startCombat', issuer: 'system', participants: ['a', 'z'] } as never);
    if (!started.ok) throw new Error();
    s = { ...started.state, turn: { ...started.state.turn, order: ['a', 'z'], activeEntityId: 'a' } };
    s = applyEffects(toyRuleset, s, [{ type: 'spawnEntity', entity: makeEntity({ id: 'imp', position: { x: 1, y: 0 }, resources: { blood: pool(2) } }), ownerId: 'a', rounds: 1 }]).state;
    expect(s.turn.order).toEqual(['a', 'imp', 'z']);
    for (let i = 0; i < 3 && s.entities.imp; i++) {
      const r = e.apply(s, { type: 'endTurn', issuer: 'system', entityId: s.turn.activeEntityId! } as never);
      if (r.ok) s = r.state;
    }
    expect(s.entities.imp).toBeUndefined();
    expect(s.turn.order).toEqual(['a', 'z']);
  });
});
