import type { RngCursor } from '../../engine';

/** "2d6+1" style dice. */
export interface Dice {
  count: number;
  sides: number;
  bonus: number;
}

export function parseDice(text: string): Dice {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(text.trim());
  if (!m) throw new Error(`willy: bad dice "${text}"`);
  return { count: Number(m[1]), sides: Number(m[2]), bonus: Number(m[3] ?? 0) };
}

export function rollDice(rng: RngCursor, d: Dice, times = 1): number {
  let total = d.bonus;
  for (let i = 0; i < d.count * times; i++) total += rng.die(d.sides);
  return total;
}

export function averageDice(d: Dice): number {
  return (d.count * (d.sides + 1)) / 2 + d.bonus;
}

/** One die step up: 1d6 → 1d8 → 1d10 → 1d12. */
export function stepUp(d: Dice): Dice {
  return { ...d, sides: Math.min(12, d.sides + 2) };
}

export function formatDice(d: Dice): string {
  return `${d.count}d${d.sides}${d.bonus > 0 ? `+${d.bonus}` : d.bonus < 0 ? d.bonus : ''}`;
}
