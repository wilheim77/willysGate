import { it } from 'vitest';
import { CLASSES } from '../../rulesets/willy';
import { simulateSeason } from '../../content/willy/sim/balance';

/** Manual probe of whole seasons: SIM_SEASON=<seeds> [SIM_CLASSES=a,b] [SIM_FLOORS_MAX=10] npx vitest run this file. */
it.runIf(!!process.env.SIM_SEASON)('season probe', () => {
  const seeds = Number(process.env.SIM_SEASON);
  const classes = process.env.SIM_CLASSES ? process.env.SIM_CLASSES.split(',') : Object.keys(CLASSES);
  const floors = Number(process.env.SIM_FLOORS_MAX ?? 10);
  const t0 = Date.now();
  for (const classId of classes) {
    for (let seed = 1; seed <= seeds; seed++) {
      const r = simulateSeason(seed * 104729, classId, 15, floors);
      const line = r.floors.map((f) => `${f.floor}:L${f.level}r${f.retries}/${f.fights}${f.bossFirstTry ? "B" : "b"}[${Object.values(f.uses).join(',')}]`).join(' ');
      console.log(`${classId} ${seed} ${r.finished ? 'FIN' : 'X'} ${line}`);
      for (const f of r.floors) if (f.toughest) console.log(`  toughest ${f.floor} r${f.retries}: ${f.toughest.join(',')}`);
    }
  }
  console.log(`${Date.now() - t0}ms`);
}, 3_600_000);
