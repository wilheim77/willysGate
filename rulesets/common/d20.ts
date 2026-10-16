import type { CheckResult, DiceRoll, RngCursor } from '../../engine';

/** d20 conventions shared by d20-based rulesets (5e and derivatives). */

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

/** Advantage and disadvantage cancel out regardless of how many sources of each (5e rule). */
export function resolveRollMode(hasAdvantage: boolean, hasDisadvantage: boolean): RollMode {
  if (hasAdvantage === hasDisadvantage) return 'normal';
  return hasAdvantage ? 'advantage' : 'disadvantage';
}

const MODE_NOTE: Record<RollMode, string | undefined> = {
  normal: undefined,
  advantage: 'ventaja',
  disadvantage: 'desventaja',
};

export function rollD20(rng: RngCursor, mode: RollMode = 'normal'): DiceRoll {
  const rolls = mode === 'normal' ? [rng.die(20)] : [rng.die(20), rng.die(20)];
  const kept = mode === 'advantage' ? Math.max(...rolls) : Math.min(...rolls);
  const roll: DiceRoll = { sides: 20, rolls, kept: [kept] };
  const note = MODE_NOTE[mode];
  if (note) roll.note = note;
  return roll;
}

export interface D20CheckSpec {
  check: string;
  label: string;
  mode: RollMode;
  modifiers: { label: string; value: number }[];
  target: number;
  targetLabel?: string;
}

/** Rolls d20 + modifiers against a target (meet or beat) and builds a displayable result. */
export function d20Check(rng: RngCursor, spec: D20CheckSpec): CheckResult {
  const die = rollD20(rng, spec.mode);
  const natural = die.kept[0]!;
  const modifiers = spec.modifiers.filter((m) => m.value !== 0);
  const total = natural + modifiers.reduce((sum, m) => sum + m.value, 0);
  const result: CheckResult = {
    check: spec.check,
    label: spec.label,
    dice: [die],
    modifiers,
    total,
    target: spec.target,
    targetLabel: spec.targetLabel ?? 'CD',
    success: total >= spec.target,
  };
  if (natural === 20) result.outcome = 'natural_20';
  else if (natural === 1) result.outcome = 'natural_1';
  return result;
}
