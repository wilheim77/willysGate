import { describe, expect, it } from 'vitest';
import { RngCursor, applyOutcome, createEngine, jumpTargets, traceProjectile } from '../../engine';
import { toyRuleset } from '../fixtures/toyRuleset';
import { asciiMap, makeEntity } from '../fixtures/helpers';

const engine = createEngine(toyRuleset, 'test');
const pool = (n: number) => ({ current: n, max: n });
const hunter = (id: string, x: number, y: number) => makeEntity({ id, position: { x, y }, resources: { blood: pool(6) } });

describe('jumps (R15)', () => {
  it('lands across gaps and up ledges within the rules, never into walls or people', () => {
    const map = asciiMap(['.......']);
    map.tiles[2] = { terrain: 'void', height: 0, walkable: false };
    map.tiles[5] = { terrain: 'stone', height: 2, walkable: true };
    const s = engine.newGame({ seed: 1, map, entities: [hunter('a', 0, 0), hunter('b', 6, 0)] });
    const lands = jumpTargets(toyRuleset, s, 'a', { maxLength: 6, maxUp: 2, safeDown: 3 }).map((l) => l.to.x).sort();
    expect(lands).toEqual([1, 3, 4, 5]); // over the gap at 2, up onto 5, not onto b at 6
    const low = jumpTargets(toyRuleset, s, 'a', { maxLength: 6, maxUp: 1, safeDown: 3 }).map((l) => l.to.x);
    expect(low).not.toContain(5);
    const walled = asciiMap(['.#..']);
    const w = engine.newGame({ seed: 1, map: walled, entities: [hunter('a', 0, 0)] });
    expect(jumpTargets(toyRuleset, w, 'a', { maxLength: 3, maxUp: 1, safeDown: 3 }).filter((l) => l.to.y === 0)).toEqual([]);
  });

  it('a jump down beyond the safe drop is a fall', () => {
    const s = engine.newGame({ seed: 1, map: asciiMap(['5..']), entities: [hunter('a', 0, 0)] });
    const r = applyOutcome(toyRuleset, s, { effects: [{ type: 'jump', entityId: 'a', to: { x: 2, y: 0 }, safeDown: 3 }], events: [] }, new RngCursor(s.rng));
    expect(r.state.entities.a!.position).toEqual({ x: 2, y: 0 });
    expect(r.events).toContainEqual({ type: 'entityFell', entityId: 'a', levels: 3 });
  });
});

describe('bouncing shots (R15)', () => {
  it('bounces off walls like a billiard ball and stops at the first creature', () => {
    const map = asciiMap(['######', '#....#', '#....#', '#....#', '######']);
    const s = engine.newGame({ seed: 1, map, entities: [hunter('a', 1, 1), hunter('t', 4, 2)] });
    // Fired diagonally down-right: off the bottom wall and up into the target.
    const tr = traceProjectile(toyRuleset, s, { x: 1, y: 1 }, { x: 2, y: 2 }, { range: 8, maxBounces: 2, ignore: ['a'] });
    expect(tr.bounces.length).toBeGreaterThan(0);
    expect(tr.hitId).toBe('t');
    const none = traceProjectile(toyRuleset, s, { x: 1, y: 1 }, { x: 2, y: 2 }, { range: 8, maxBounces: 0, ignore: ['a'] });
    expect(none.bounces).toEqual([]);
    expect(none.hitId).toBeUndefined();
  });
});
