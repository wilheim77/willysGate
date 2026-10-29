import { it } from 'vitest';
import { CLASSES } from '../../rulesets/willy';
import { FLOOR_COUNT } from '../../content/willy/gen/floor';
import { type FightStats, simulateFloor } from '../../content/willy/sim/balance';

/**
 * What fights look like on each floor (docs/willy/BALANCE.md → «Curva de combate»):
 * SIM_FIGHTS=<seeds> [SIM_FLOORS=1,2] npx vitest run this file --silent=false.
 * Every class at the floor's expected level; normal fights and guardian/boss fights apart.
 */

const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))] ?? 0;
};
const sum = (xs: FightStats[], k: keyof FightStats) => xs.reduce((a, b) => a + b[k], 0);

it.runIf(!!process.env.SIM_FIGHTS)('fight probe', () => {
  const seeds = Number(process.env.SIM_FIGHTS);
  const floors = process.env.SIM_FLOORS ? process.env.SIM_FLOORS.split(',').map(Number) : Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1);
  const rows: string[] = ['piso | tipo | peleas | rondas p50/p90 | acierto enemigo | daño por golpe (% vida) | daño enemigo por turno (% vida grupo) | acierto Willy | rondas para matar (vida enemiga / daño del grupo por ronda) | jefe ganado'];
  for (const floor of floors) {
    const normal: { rounds: number; s: FightStats }[] = [];
    const boss: { rounds: number; s: FightStats }[] = [];
    let bossWon = 0;
    let bossRuns = 0;
    let cleared = 0;
    let runs = 0;
    for (const classId of Object.keys(CLASSES)) {
      for (let seed = 1; seed <= seeds; seed++) {
        const run = simulateFloor(seed * 7919 + floor, floor, classId);
        for (const f of run.log) (f.boss ? boss : normal).push({ rounds: f.rounds, s: f.stats });
        runs++;
        if (run.cleared) cleared++;
        if (run.reachedBoss) {
          bossRuns++;
          if (run.bossWon) bossWon++;
        }
      }
    }
    const line = (label: string, fs: { rounds: number; s: FightStats }[]) => {
      const st = fs.map((f) => f.s);
      const rounds = fs.map((f) => f.rounds);
      const foeHit = sum(st, 'foeHits') / Math.max(1, sum(st, 'foeAttacks'));
      const perHit = sum(st, 'hitShare') / Math.max(1, sum(st, 'foeHits'));
      // Party damage per foe turn, as a share of the party's average member health.
      const perTurn = st.reduce((a, s) => a + s.partyDamage / Math.max(1, s.partyHp / 2), 0) / Math.max(1, sum(st, 'foeTurns'));
      const willyHit = sum(st, 'willyHits') / Math.max(1, sum(st, 'willyAttacks'));
      const toKill = fs.map((f) => f.s.foeHp / Math.max(1, f.s.foeDamage / Math.max(1, f.rounds)));
      return `${floor} | ${label} | ${fs.length} | ${pct(rounds, 0.5)}/${pct(rounds, 0.9)} | ${Math.round(100 * foeHit)} % | ${Math.round(100 * perHit)} % | ${Math.round(100 * perTurn)} % | ${Math.round(100 * willyHit)} % | ${pct(toKill, 0.5).toFixed(1)}`;
    };
    rows.push(line('normal', normal));
    rows.push(`${line('jefe', boss)} | ${Math.round((100 * bossWon) / Math.max(1, bossRuns))} % | piso sin caer ${Math.round((100 * cleared) / Math.max(1, runs))} %`);
  }
  console.log(rows.join('\n'));
}, 3_600_000);
