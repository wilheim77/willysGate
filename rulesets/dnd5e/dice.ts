import type { DiceRoll, RngCursor } from '../../engine';

/** A damage/healing expression such as "2d6+3" or "1d8". */
export interface DiceExpr {
  count: number;
  sides: number;
  bonus: number;
}

export function parseDice(expr: string): DiceExpr {
  const m = /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(expr);
  if (!m) {
    const flat = Number(expr);
    if (Number.isInteger(flat)) return { count: 0, sides: 0, bonus: flat };
    throw new Error(`Bad dice expression "${expr}"`);
  }
  const bonus = m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
  return { count: Number(m[1]), sides: Number(m[2]), bonus };
}

export function averageOf(d: DiceExpr): number {
  return d.count * ((d.sides + 1) / 2) + d.bonus;
}

/** Rolls the dice part only (bonus excluded), e.g. for doubling on a critical hit. */
export function rollDice(rng: RngCursor, count: number, sides: number): DiceRoll {
  const rolls = Array.from({ length: count }, () => rng.die(sides));
  return { sides, rolls, kept: rolls };
}

export function sum(roll: DiceRoll): number {
  return roll.kept.reduce((a, b) => a + b, 0);
}
