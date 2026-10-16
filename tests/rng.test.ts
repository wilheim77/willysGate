import { describe, expect, it } from 'vitest';
import { RngCursor, hashSeed, nextUint32, resolveRollMode, rollD20, rollDie, seedRng, type RngState } from '../core';

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

  it('rolls every face of a d20 roughly uniformly', () => {
    const counts = new Array(21).fill(0);
    for (const v of sequence(seedRng(2024), 20000)) counts[v]++;
    expect(counts[0]).toBe(0);
    for (let face = 1; face <= 20; face++) {
      expect(counts[face]).toBeGreaterThan(850); // expected 1000
      expect(counts[face]).toBeLessThan(1150);
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
});

describe('d20', () => {
  it('normal roll uses one die', () => {
    const [roll] = rollD20(seedRng(5));
    expect(roll.rolls).toHaveLength(1);
    expect(roll.kept).toBe(roll.rolls[0]);
  });

  it('advantage keeps the higher of two dice', () => {
    let s = seedRng(6);
    for (let i = 0; i < 200; i++) {
      const [roll, next] = rollD20(s, 'advantage');
      expect(roll.rolls).toHaveLength(2);
      expect(roll.kept).toBe(Math.max(...roll.rolls));
      s = next;
    }
  });

  it('disadvantage keeps the lower of two dice', () => {
    let s = seedRng(7);
    for (let i = 0; i < 200; i++) {
      const [roll, next] = rollD20(s, 'disadvantage');
      expect(roll.kept).toBe(Math.min(...roll.rolls));
      s = next;
    }
  });

  it('advantage raises the average', () => {
    const avg = (mode: 'advantage' | 'disadvantage') => {
      const c = new RngCursor(seedRng(8));
      let sum = 0;
      for (let i = 0; i < 5000; i++) sum += c.d20(mode).kept;
      return sum / 5000;
    };
    expect(avg('advantage')).toBeGreaterThan(13); // theoretical 13.82
    expect(avg('disadvantage')).toBeLessThan(8); // theoretical 7.18
  });

  it('advantage and disadvantage cancel out', () => {
    expect(resolveRollMode(true, true)).toBe('normal');
    expect(resolveRollMode(false, false)).toBe('normal');
    expect(resolveRollMode(true, false)).toBe('advantage');
    expect(resolveRollMode(false, true)).toBe('disadvantage');
  });

  it('cursor matches the pure functions', () => {
    const c = new RngCursor(seedRng(9));
    const a = c.d20('advantage');
    const [b, s] = rollD20(seedRng(9), 'advantage');
    expect(a).toEqual(b);
    expect(c.state).toEqual(s);
  });
});
