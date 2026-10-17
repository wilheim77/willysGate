import { type RngState, deriveSeed, nextUint32, seedRng } from '../../../engine';

/**
 * A small seeded generator for content generation (floors, rivals). Every use starts from
 * deriveSeed(runSeed, purpose...), never from the combat RNG or Math.random, so generating
 * floor 2 never changes floor 1 and the same seed always gives the same result.
 */
export class Gen {
  private s: RngState;

  constructor(seed: number) {
    this.s = seedRng(seed);
  }

  static of(seed: number, ...keys: (string | number)[]): Gen {
    return new Gen(deriveSeed(seed, ...keys));
  }

  /** Uniform in [0, 1). */
  next(): number {
    const [v, n] = nextUint32(this.s);
    this.s = n;
    return v / 0x100000000;
  }

  /** Integer in [min, max], both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** A [min, max] pair from the data, or a fixed number. */
  range(r: number | [number, number]): number {
    return typeof r === 'number' ? r : this.int(r[0], r[1]);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)]!;
  }

  weighted<T>(list: readonly T[], weight: (t: T) => number): T | undefined {
    const total = list.reduce((sum, t) => sum + Math.max(0, weight(t)), 0);
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const t of list) {
      r -= Math.max(0, weight(t));
      if (r < 0) return t;
    }
    return list[list.length - 1];
  }

  shuffle<T>(list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}
