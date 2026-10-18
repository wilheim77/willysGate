import { it } from 'vitest';
import { CLASSES } from '../../rulesets/willy';
import { type FloorRun, simulateFloor, summarize } from '../../content/willy/sim/balance';

it('probe', () => {
  const runs: FloorRun[] = [];
  const t0 = Date.now();
  const floors = (process.env.SIM_FLOORS ?? '1').split(',').map(Number);
  const seeds = Number(process.env.SIM_SEEDS ?? 2);
  for (const floor of floors) for (const classId of Object.keys(CLASSES)) for (let seed = 1; seed <= seeds; seed++) runs.push(simulateFloor(seed * 7919 + floor, floor, classId));
  console.log(JSON.stringify(summarize(runs)), `${Date.now() - t0}ms`);
  if (process.env.SIM_LOG) for (const r of runs) console.log(r.classId, JSON.stringify(r.log));
  console.log(runs.map((r) => `${r.floor}/${r.classId.slice(0, 6)}/${r.seed}:${r.cleared ? 'OK' : r.stalled ? 'STALL' : 'X'}(${r.fights}${r.reachedBoss ? 'B' : ''},${r.companionDowns},${r.hpLeft.toFixed(2)})`).join(' '));
}, 600_000);
