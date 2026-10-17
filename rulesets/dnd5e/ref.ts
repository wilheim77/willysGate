import type { Ruleset } from '../../engine';

/**
 * Late-bound handle to the dnd5e ruleset object, for helpers that need the whole ruleset
 * (e.g. simulating a push) from modules that index.ts itself imports.
 */
let ruleset: Ruleset | null = null;

export function setDnd5eRef(r: Ruleset): void {
  ruleset = r;
}

export function dnd5eRef(): Ruleset {
  if (!ruleset) throw new Error('dnd5e ruleset not initialised');
  return ruleset;
}
