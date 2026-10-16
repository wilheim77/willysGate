import { describe, expect, it } from 'vitest';
import { findPath, posKey, stepCost } from '../core';
import { asciiMap } from './helpers';

describe('findPath', () => {
  it('returns an empty path when already there', () => {
    const map = asciiMap(['...']);
    expect(findPath(map, { x: 1, y: 0 }, { x: 1, y: 0 })).toEqual({ path: [], cost: 0 });
  });

  it('walks a straight line', () => {
    const map = asciiMap(['....']);
    const r = findPath(map, { x: 0, y: 0 }, { x: 3, y: 0 })!;
    expect(r.path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
    expect(r.cost).toBe(3);
  });

  it('moves diagonally at cost 1 per step', () => {
    const map = asciiMap(['....', '....', '....', '....']);
    const r = findPath(map, { x: 0, y: 0 }, { x: 3, y: 3 })!;
    expect(r.cost).toBe(3);
    expect(r.path).toHaveLength(3);
  });

  it('routes around walls', () => {
    const map = asciiMap([
      '.#..',
      '.#..',
      '....',
    ]);
    const r = findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 })!;
    expect(r).not.toBeNull();
    expect(r.path.at(-1)).toEqual({ x: 2, y: 0 });
    for (const p of r.path) expect(map.tiles[p.y * map.width + p.x]!.walkable).toBe(true);
  });

  it('does not cut corners past walls', () => {
    const map = asciiMap([
      '.#',
      '..',
    ]);
    expect(stepCost(map, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    const r = findPath(map, { x: 0, y: 0 }, { x: 1, y: 1 })!;
    expect(r.path).toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  });

  it('returns null when unreachable', () => {
    const map = asciiMap([
      '.#.',
      '.#.',
      '.#.',
    ]);
    expect(findPath(map, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it('returns null for walls and out-of-bounds targets', () => {
    const map = asciiMap(['.#']);
    expect(findPath(map, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(findPath(map, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull();
  });

  it('climbs one level at extra cost', () => {
    const map = asciiMap(['.1']);
    expect(findPath(map, { x: 0, y: 0 }, { x: 1, y: 0 })!.cost).toBe(2);
    // Stepping down is free.
    expect(findPath(map, { x: 1, y: 0 }, { x: 0, y: 0 })!.cost).toBe(1);
  });

  it('cannot step up or down two levels at once', () => {
    const map = asciiMap(['.2']);
    expect(findPath(map, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(findPath(map, { x: 1, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });

  it('uses stairs to reach higher ground', () => {
    const map = asciiMap([
      '.12',
      '..2',
    ]);
    const r = findPath(map, { x: 0, y: 1 }, { x: 2, y: 1 })!;
    expect(r).not.toBeNull();
    expect(r.path.at(-1)).toEqual({ x: 2, y: 1 });
  });

  it('avoids blocked tiles', () => {
    const map = asciiMap(['...']);
    expect(findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 }, { blocked: new Set([posKey({ x: 1, y: 0 })]) })).toBeNull();
  });

  it('respects maxCost', () => {
    const map = asciiMap(['.....']);
    expect(findPath(map, { x: 0, y: 0 }, { x: 4, y: 0 }, { maxCost: 3 })).toBeNull();
    expect(findPath(map, { x: 0, y: 0 }, { x: 3, y: 0 }, { maxCost: 3 })).not.toBeNull();
  });

  it('is deterministic', () => {
    const map = asciiMap(Array(8).fill('........'));
    const a = findPath(map, { x: 0, y: 0 }, { x: 7, y: 4 });
    const b = findPath(map, { x: 0, y: 0 }, { x: 7, y: 4 });
    expect(a).toEqual(b);
  });
});
