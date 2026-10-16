import { describe, expect, it } from 'vitest';
import { RngCursor, hashSeed, nextUint32, rollDie, seedRng, type RngState } from '../../engine';

function sequence(state: RngState, n: number, sides = 20): number[] {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const [v, next] = rollDie(s, sides);
    out.push(v);
    s = next;
  }
  return out;
}

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    expect(sequence(seedRng(42), 50)).toEqual(sequence(seedRng(42), 50));
  });

  it('differs between nearby seeds', () => {
    expect(sequence(seedRng(1), 20)).not.toEqual(sequence(seedRng(2), 20));
  });

  it('never mutates the input state', () => {
    const s = Object.freeze(seedRng(7));
    const copy = { ...s };
    nextUint32(s);
    rollDie(s, 6);
    expect(s).toEqual(copy);
  });

  it('produces uint32 state words', () => {
    let s = seedRng(123);
    for (let i = 0; i < 1000; i++) {
      const [v, next] = nextUint32(s);
      expect(Number.isInteger(v) && v >= 0 && v <= 0xffffffff).toBe(true);
      for (const w of Object.values(next)) expect(w >>> 0).toBe(w);
      s = next;
    }
  });

  it('resumes the same sequence after a JSON round trip', () => {
    const [, mid] = rollDie(seedRng(99), 20);
    const restored = JSON.parse(JSON.stringify(mid)) as RngState;
    expect(sequence(restored, 30)).toEqual(sequence(mid, 30));
  });

  it.each([4, 6, 20])('rolls every face of a d%i roughly uniformly', (sides) => {
    const n = 2000 * sides;
    const counts = new Array(sides + 1).fill(0);
    for (const v of sequence(seedRng(2024), n, sides)) counts[v]++;
    expect(counts[0]).toBe(0);
    for (let face = 1; face <= sides; face++) {
      expect(counts[face]).toBeGreaterThan(1800);
      expect(counts[face]).toBeLessThan(2200);
    }
  });

  it('rejects invalid dice', () => {
    expect(() => rollDie(seedRng(1), 0)).toThrow();
    expect(() => rollDie(seedRng(1), 2.5)).toThrow();
  });

  it('hashes string seeds stably', () => {
    expect(hashSeed('Hondonegra')).toBe(hashSeed('Hondonegra'));
    expect(hashSeed('Hondonegra')).not.toBe(hashSeed('hondonegra'));
  });

  it('cursor matches the pure functions', () => {
    const c = new RngCursor(seedRng(9));
    const a = [c.die(20), c.die(6)];
    const [x, s1] = rollDie(seedRng(9), 20);
    const [y, s2] = rollDie(s1, 6);
    expect(a).toEqual([x, y]);
    expect(c.state).toEqual(s2);
  });
});
