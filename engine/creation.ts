/**
 * Character creation as data: a ruleset describes the steps (pick a race, spend points on
 * abilities, type a name) and builds the entity from the answers. Any client can draw it.
 */
export type CreationChoices = Record<string, string | Record<string, number>>;

export interface CreationOption {
  id: string;
  label: string;
  /** One or two lines: what it is and what it changes. */
  text?: string;
}

export type CreationStep =
  | { id: string; kind: 'text'; label: string; default: string; maxLength: number }
  | { id: string; kind: 'pick'; label: string; options: CreationOption[] }
  | {
      id: string;
      kind: 'points';
      label: string;
      /** Plain-language help shown above the sliders. */
      help?: string;
      stats: { id: string; label: string }[];
      min: number;
      max: number;
      budget: number;
      /** Cost of having each value, e.g. { 8: 0, 9: 1, ..., 15: 9 }. */
      cost: Record<number, number>;
      /** A good spread for the current answers (e.g. per class), for the "Recomendado" button. */
      recommended(choices: CreationChoices): Record<string, number>;
      /** What the final value will be after bonuses (e.g. racial), shown next to each stat. */
      bonuses?(choices: CreationChoices): Record<string, number>;
    };

export interface CreationSpec {
  steps: CreationStep[];
}

/** Points spent on a spread, or null if a value is out of range. */
export function pointsSpent(step: Extract<CreationStep, { kind: 'points' }>, values: Record<string, number>): number | null {
  let total = 0;
  for (const s of step.stats) {
    const v = values[s.id] ?? step.min;
    if (v < step.min || v > step.max || step.cost[v] === undefined) return null;
    total += step.cost[v]!;
  }
  return total;
}
