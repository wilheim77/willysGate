import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, type Ruleset, type Trap, createEngine, trapsOf, withTraps } from '../../engine';
import { toyRuleset } from '../fixtures/toyRuleset';
import { asciiMap, makeEntity } from '../fixtures/helpers';

const pool = (n: number) => ({ current: n, max: n });
// Toy rules: you notice a trap if your Will beats its "detect"; it costs 2 Blood.
const rules: Ruleset = {
  ...toyRuleset,
  noticeTrap: (s, id, t) => (s.entities[id]!.stats.will ?? 0) >= Number(t.params.detect),
  triggerTrap: (_s, id) => ({ effects: [{ type: 'modifyResource', entityId: id, resource: 'blood', delta: -2 }], events: [] }),
};
const engine = createEngine(rules, 'test');

const trap = (over: Partial<Trap> = {}): Trap => ({ id: 'pit', tiles: [{ x: 3, y: 0 }], hidden: true, armed: true, params: { detect: 5 }, disarm: { check: 'will', dc: 7, triggerOnFailBy: 5 }, ...over });

function world(will: number, t = trap()): GameState {
  const s = engine.newGame({
    seed: 2,
    map: asciiMap(['.......']),
    entities: [makeEntity({ id: 'hero', factionId: 'hunters', stats: { will, stride: 9 }, resources: { blood: pool(6), action: pool(1), reaction: pool(1) } })],
  });
  return withTraps(s, [t]);
}
const move = (s: GameState, x: number) => engine.apply(s, { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x, y: 0 } } as BaseCommand);

describe('traps', () => {
  it('an unnoticed trap goes off when stepped on and stops the walk', () => {
    const r = move(world(0), 6);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.state.entities.hero!.position).toEqual({ x: 3, y: 0 });
    expect(r.state.entities.hero!.resources.blood!.current).toBe(4);
    expect(trapsOf(r.state)[0]).toMatchObject({ armed: false, hidden: false });
  });

  it('a sharp eye spots it from two tiles away and stops before it', () => {
    const r = move(world(9), 6);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.state.entities.hero!.position).toEqual({ x: 1, y: 0 });
    expect(r.events.some((e) => e.type === 'trapSpotted')).toBe(true);
    expect(trapsOf(r.state)[0]).toMatchObject({ armed: true, hidden: false });
  });

  it('paths go around a known trap when they can', () => {
    const s = engine.newGame({ seed: 2, map: asciiMap(['.......', '.......']), entities: [makeEntity({ id: 'hero', factionId: 'hunters', stats: { stride: 9 }, resources: { blood: pool(6), action: pool(1), reaction: pool(1) } })] });
    const r = engine.apply(withTraps(s, [trap({ hidden: false })]), { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 6, y: 0 } } as BaseCommand);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.state.entities.hero!.position).toEqual({ x: 6, y: 0 });
    expect(trapsOf(r.state)[0]!.armed).toBe(true);
  });

  it('disarming: needs to be close and visible; success disarms, a bad failure sets it off', () => {
    const near = (will: number) => {
      const s = world(will, trap({ hidden: false }));
      return { ...s, entities: { ...s.entities, hero: { ...s.entities.hero!, position: { x: 2, y: 0 } } } };
    };
    const disarm = (s: GameState) => engine.apply(s, { type: 'disarmTrap', issuer: 'player:1', entityId: 'hero', trapId: 'pit' } as BaseCommand);
    expect(disarm(world(0)).ok).toBe(false); // hidden and far
    const good = disarm(near(20));
    expect(good.ok && trapsOf(good.state)[0]!.armed).toBe(false);
    expect(good.ok && good.events[0]!.type).toBe('trapDisarmed');
    const bad = disarm(near(-20));
    expect(bad.ok && bad.events.map((e) => e.type)).toEqual(['trapDisarmFailed', 'trapTriggered', 'resourceChanged']);
  });
});
