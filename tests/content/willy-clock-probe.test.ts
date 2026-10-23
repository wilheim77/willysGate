import { it } from 'vitest';
import { type GridMap, type Vec2, posKey, stepCost, zonesOf, type GameState } from '../../engine';
import { CLASSES } from '../../rulesets/willy';
import { floorSpec, generateFloor, FLOOR_COUNT } from '../../content/willy/gen/floor';
import { simulateFloor } from '../../content/willy/sim/balance';
import floors from '../../content/willy/data/floors.json';

/**
 * How much of the floor clock a run uses (docs/willy/BALANCE.md → «Reloj»):
 * SIM_CLOCK=<seeds> [SIM_FLOORS=1,2] npx vitest run this file --silent=false.
 *
 * The balance sim jumps between rooms, so the clock is rebuilt here: walking (1 s per step, the
 * shortest walk between rooms on the real map), combat rounds (15 s each, measured by playing
 * every fight with the AI; boss and guardian fights pause the clock) and 3 s per chest. Three
 * players: «directo» (the critical path to the stairs, fighting what's on it), «normal» (every
 * room with a fight, opening the chests there) and «completo» (every room and every chest).
 */

const COST = floors.reloj.costes;
const PER_CHEST = 3;

function distances(map: GridMap, from: Vec2, blocked: Set<string>): Map<string, number> {
  const out = new Map<string, number>([[posKey(from), 0]]);
  let frontier = [from];
  let d = 0;
  while (frontier.length) {
    d++;
    const next: Vec2[] = [];
    for (const p of frontier) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const q = { x: p.x + dx, y: p.y + dy };
        const k = posKey(q);
        if (out.has(k) || stepCost(map, p, q, { maxStep: 1, climbCost: 0 }, blocked) === null) continue;
        out.set(k, d);
        next.push(q);
      }
    }
    frontier = next;
  }
  return out;
}

function nearestWalkable(map: GridMap, p: Vec2, blocked: Set<string>): Vec2 {
  for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const q = { x: p.x + dx, y: p.y + dy };
    const t = map.tiles[q.y * map.width + q.x];
    if (q.x >= 0 && q.y >= 0 && q.x < map.width && q.y < map.height && t?.walkable && !blocked.has(posKey(q))) return q;
  }
  return p;
}

/** Nearest-neighbour tour from `start` through `stops`, ending at `end`. */
function tour(dist: (a: Vec2, b: Vec2) => number, start: Vec2, stops: Vec2[], end: Vec2): number {
  let here = start;
  let total = 0;
  const left = [...stops];
  while (left.length) {
    left.sort((a, b) => dist(here, a) - dist(here, b));
    const next = left.shift()!;
    total += dist(here, next);
    here = next;
  }
  return total + dist(here, end);
}

const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))] ?? 0;
};

it.runIf(!!process.env.SIM_CLOCK)('clock probe', () => {
  const seeds = Number(process.env.SIM_CLOCK);
  const floorList = process.env.SIM_FLOORS ? process.env.SIM_FLOORS.split(',').map(Number) : Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1);
  const classes = Object.keys(CLASSES);
  const rows: string[] = [];
  for (const floor of floorList) {
    const spec = floorSpec(floor);
    const used: Record<'directo' | 'normal' | 'completo', number[]> = { directo: [], normal: [], completo: [] };
    const roundsPerFight: number[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const classId = classes[(seed + floor) % classes.length]!;
      const gen = generateFloor(seed, floor).setup;
      const map = gen.map;
      const obstacles = new Set(gen.entities.filter((e) => e.tags.includes('obstacle') || e.tags.includes('object') || e.tags.includes('cofre')).map((e) => posKey(e.position)));
      const planta = gen.systems!.planta as unknown as { salas: { role: string; critical: boolean; depth: number; cell: Vec2 }[]; origen: Vec2; celda: { ancho: number; alto: number } };
      const centre = (i: number) => {
        const r = planta.salas[i]!;
        return nearestWalkable(map, { x: (r.cell.x - planta.origen.x) * planta.celda.ancho + Math.floor(planta.celda.ancho / 2), y: (r.cell.y - planta.origen.y) * planta.celda.alto + Math.floor(planta.celda.alto / 2) }, obstacles);
      };
      const arrival = gen.spawns.llegada!;
      const stairs = zonesOf({ systems: gen.systems } as unknown as GameState, 'exits')[0]!;
      const exit = { x: stairs.x, y: stairs.y };
      const cache = new Map<string, Map<string, number>>();
      const dist = (a: Vec2, b: Vec2) => {
        const k = posKey(a);
        if (!cache.has(k)) cache.set(k, distances(map, a, obstacles));
        return cache.get(k)!.get(posKey(b)) ?? 999;
      };
      // Chests: walk next to them (one tile short).
      const chests = gen.entities.filter((e) => e.tags.includes('cofre')).map((c) => ({ at: nearestWalkable(map, c.position, obstacles), room: planta.salas.findIndex((r) => r.cell.x === Math.floor(c.position.x / planta.celda.ancho) + planta.origen.x && r.cell.y === Math.floor(c.position.y / planta.celda.alto) + planta.origen.y) }));

      const run = simulateFloor(seed, floor, classId);
      const roundsByRoom = new Map<number, number>();
      for (const f of run.log) if (!f.boss) roundsByRoom.set(f.room, (roundsByRoom.get(f.room) ?? 0) + f.rounds);
      for (const f of run.log) if (!f.boss) roundsPerFight.push(f.rounds);
      const fightRooms = zonesOf({ systems: gen.systems } as unknown as GameState, 'encounters').map((z) => Number(z.name.split('-')[1]));
      const avg = roundsPerFight.length ? roundsPerFight.reduce((a, b) => a + b, 0) / roundsPerFight.length : 3;
      const roundsIn = (i: number) => (planta.salas[i]!.role === 'jefe' ? 0 : fightRooms.includes(i) ? (roundsByRoom.get(i) ?? avg) : 0);

      const rooms = planta.salas.map((r, i) => ({ r, i }));
      const critical = rooms.filter(({ r }) => r.critical).sort((a, b) => a.r.depth - b.r.depth);
      // Floor 1: the clock starts once the first fight is won (the tutorial).
      const firstFight = floor === 1 ? critical.find(({ i }) => fightRooms.includes(i))?.i : undefined;
      const startAt = firstFight !== undefined ? centre(firstFight) : arrival;
      const skip = (i: number) => i === firstFight;

      const directWalk = (() => {
        let here = startAt;
        let total = 0;
        const after = firstFight !== undefined ? critical.slice(critical.findIndex(({ i }) => i === firstFight) + 1) : critical;
        for (const { i } of after) {
          const c = centre(i);
          total += dist(here, c);
          here = c;
        }
        return total + dist(here, exit);
      })();
      const direct = directWalk * COST.pasoExploracion + critical.filter(({ i }) => !skip(i)).reduce((s, { i }) => s + roundsIn(i), 0) * COST.rondaCombate;

      const fightStops = rooms.filter(({ i }) => fightRooms.includes(i) && !skip(i) && planta.salas[i]!.role !== 'jefe');
      const normalChests = chests.filter((c) => fightRooms.includes(c.room));
      const normal = tour(dist, startAt, [...fightStops.map(({ i }) => centre(i)), ...normalChests.map((c) => c.at)], exit) * COST.pasoExploracion + fightStops.reduce((s, { i }) => s + roundsIn(i), 0) * COST.rondaCombate + normalChests.length * PER_CHEST;

      const allStops = rooms.filter(({ i }) => !skip(i)).map(({ i }) => centre(i));
      const full = tour(dist, startAt, [...allStops, ...chests.map((c) => c.at)], exit) * COST.pasoExploracion + rooms.filter(({ i }) => !skip(i)).reduce((s, { i }) => s + roundsIn(i), 0) * COST.rondaCombate + chests.length * PER_CHEST;

      used.directo.push(direct);
      used.normal.push(normal);
      used.completo.push(full);
    }
    const R = spec.relojSegundos;
    const left = (xs: number[], q: number) => Math.round(100 * (1 - pct(xs, q) / R));
    rows.push(
      `${floor} reloj=${R} rondas/pelea=${(roundsPerFight.reduce((a, b) => a + b, 0) / Math.max(1, roundsPerFight.length)).toFixed(1)} ` +
        `directo p50=${pct(used.directo, 0.5)} p90=${pct(used.directo, 0.9)} | normal p50=${pct(used.normal, 0.5)} p90=${pct(used.normal, 0.9)} | completo p50=${pct(used.completo, 0.5)} p90=${pct(used.completo, 0.9)} ` +
        `|| queda: directo ${left(used.directo, 0.5)}% normal p50 ${left(used.normal, 0.5)}% p90 ${left(used.normal, 0.9)}% completo ${left(used.completo, 0.5)}%`,
    );
  }
  console.log(rows.join('\n'));
}, 3_600_000);
