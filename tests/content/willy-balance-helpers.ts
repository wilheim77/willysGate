import { expect } from 'vitest';
import { CLASSES } from '../../rulesets/willy';
import { type FloorRun, simulateFloor, summarize } from '../../content/willy/sim/balance';

/**
 * Balance regression (docs/willy/BALANCE.md): Willy and his companion, played by the AI,
 * through generated floors at the expected level. Cheap in the everyday check; QA_DEEP=1 runs
 * every class on several seeds per floor (one file per floor so they run in parallel).
 */

export const DEEP = process.env.QA_DEEP === '1';

/** Targets from the brief, with room for the sampling noise of the runs we can afford. */
export const TARGETS = {
  /** Getting through every ordinary fight of the floor to the boss. */
  reachBoss: { min: 0.8, max: 1 },
  /** Beating the boss once there. */
  boss: { min: 0.6, max: 0.9 },
};

export function runFloor(floor: number, classes: string[], seeds: number[]): FloorRun[] {
  const runs: FloorRun[] = [];
  for (const classId of classes) for (const seed of seeds) runs.push(simulateFloor(seed * 7919 + floor, floor, classId));
  return runs;
}

export function checkFloor(floor: number): void {
  const classes = Object.keys(CLASSES);
  const runs = runFloor(floor, classes, DEEP ? [1, 2, 3, 4, 5] : [1]);
  const [row] = summarize(runs);
  console.log(`[balance] floor ${floor}: ${JSON.stringify(row)}`);
  expect(row!.stalled, 'fights that never ended').toBe(0);
  expect(row!.bossReached).toBeGreaterThanOrEqual(DEEP ? TARGETS.reachBoss.min : 0.6);
  expect(row!.bossReached).toBeLessThanOrEqual(1);
  expect(row!.bossWon).toBeGreaterThanOrEqual(DEEP ? TARGETS.boss.min : 0.3);
  if (DEEP) {
    expect(row!.bossReached).toBeLessThanOrEqual(TARGETS.reachBoss.max);
    expect(row!.bossWon).toBeLessThanOrEqual(TARGETS.boss.max);
  }
}
