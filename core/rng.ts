/**
 * Deterministic RNG (sfc32). The full generator state lives in GameState,
 * so a saved game resumes the exact same sequence of rolls.
 */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface D20Roll {
  mode: RollMode;
  /** Every die rolled (two when rolling with advantage or disadvantage). */
  rolls: number[];
  /** The die that counts. */
  kept: number;
}

/** Hashes a string seed (e.g. typed by the player) into a 32-bit seed. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedRng(seed: number): RngState {
  // splitmix32 expands one seed into four well-mixed state words.
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let state: RngState = { a: next(), b: next(), c: next(), d: next() };
  // Discard early outputs to decorrelate nearby seeds.
  for (let i = 0; i < 12; i++) state = nextUint32(state)[1];
  return state;
}

export function nextUint32(s: RngState): [number, RngState] {
  let { a, b, c, d } = s;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  return [t, { a: a >>> 0, b, c, d }];
}

/** Uniform integer in [1, sides], without modulo bias. */
export function rollDie(s: RngState, sides: number): [number, RngState] {
  if (!Number.isInteger(sides) || sides < 1) throw new RangeError(`Invalid die: d${sides}`);
  const limit = 0x100000000 - (0x100000000 % sides);
  let state = s;
  for (;;) {
    const [value, next] = nextUint32(state);
    state = next;
    if (value < limit) return [(value % sides) + 1, state];
  }
}

export function rollD20(s: RngState, mode: RollMode = 'normal'): [D20Roll, RngState] {
  const [first, s1] = rollDie(s, 20);
  if (mode === 'normal') return [{ mode, rolls: [first], kept: first }, s1];
  const [second, s2] = rollDie(s1, 20);
  const kept = mode === 'advantage' ? Math.max(first, second) : Math.min(first, second);
  return [{ mode, rolls: [first, second], kept }, s2];
}

/** Advantage and disadvantage cancel out regardless of how many sources of each (5e rule). */
export function resolveRollMode(hasAdvantage: boolean, hasDisadvantage: boolean): RollMode {
  if (hasAdvantage === hasDisadvantage) return 'normal';
  return hasAdvantage ? 'advantage' : 'disadvantage';
}

/**
 * Convenience wrapper for command handlers that roll several dice in a row.
 * It mutates only its own copy; write `cursor.state` back into the new GameState.
 */
export class RngCursor {
  constructor(public state: RngState) {}

  die(sides: number): number {
    const [value, next] = rollDie(this.state, sides);
    this.state = next;
    return value;
  }

  d20(mode: RollMode = 'normal'): D20Roll {
    const [roll, next] = rollD20(this.state, mode);
    this.state = next;
    return roll;
  }
}
