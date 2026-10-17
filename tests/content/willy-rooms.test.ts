import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type GridMap, type Tile, type Vec2, posKey, reachableTiles } from '../../engine';
import { SURFACES } from '../../rulesets/willy/environment';
import ninja from '../../content/willy/assets/ninja.json';
import floors from '../../content/willy/data/floors.json';

/**
 * Willy room chunks (content/willy/data/rooms/<bioma>.json), as the floor generator reads them:
 * row sizes, legend, door sockets, reachability with one-level steps, traps and obstacles that
 * never cut a path, no enemy slot near the arrival, boss rooms with a chest and stairs away from
 * the doors, and the role minimums per biome (docs/willy/DESIGN.md §3).
 */
interface LegendEntry {
  terrain: string;
  height?: number;
  walkable?: boolean;
  surface?: string;
}
interface Room {
  id: string;
  nombre: string;
  roles: string[];
  peso: number;
  filas: string[];
  minFloor?: number;
}
interface Biome {
  bioma?: string;
  celda?: { ancho: number; alto: number };
  terreno: Record<string, LegendEntry>;
  trampas?: Record<string, { nombre: string; detect: number; dif: number; dano?: string }>;
  salas: Room[];
}

const dir = join(import.meta.dirname, '..', '..', 'content', 'willy', 'data', 'rooms');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const MARKERS = 'ecbtBlPJX';
const OBSTACLES = 'cbBJX';
const PLANTAS = (floors as unknown as { plantas: { bioma: string; generacion: { celda: { ancho: number; alto: number }; trampas: { tipos: string[] } } }[] }).plantas;
const RULES = { maxStep: 1, climbCost: 1 };
const MINIMUMS: Record<string, number> = { inicio: 1, jefe: 1, combate: 4, rival: 2, tesoro: 2, trampa: 2, vacia: 2 };
const ROLES = ['inicio', 'jefe', 'combate', 'tesoro', 'trampa', 'vacia', 'rival'];
const cheb = (a: Vec2, b: Vec2): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function sockets(w: number, h: number): Record<string, { ring: Vec2[]; inside: Vec2[] }> {
  const cx = Math.floor((w - 3) / 2);
  const cy = Math.floor((h - 3) / 2);
  const span = (f: (i: number) => Vec2): Vec2[] => [0, 1, 2].map(f);
  return {
    N: { ring: span((i) => ({ x: cx + i, y: 0 })), inside: span((i) => ({ x: cx + i, y: 1 })) },
    S: { ring: span((i) => ({ x: cx + i, y: h - 1 })), inside: span((i) => ({ x: cx + i, y: h - 2 })) },
    W: { ring: span((i) => ({ x: 0, y: cy + i })), inside: span((i) => ({ x: 1, y: cy + i })) },
    E: { ring: span((i) => ({ x: w - 1, y: cy + i })), inside: span((i) => ({ x: w - 2, y: cy + i })) },
  };
}

describe('Willy room chunks', () => {
  if (files.length === 0) it.skip('no room files yet', () => {});
  for (const file of files) {
    const biome = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Biome;
    const id = file.replace(/\.json$/, '');
    const planta = PLANTAS.find((p) => p.bioma === id);
    describe(id, () => {
      it('belongs to a floor and has art for every terrain', () => {
        expect(planta, `${id}: no floor with bioma ${id}`).toBeDefined();
        const terrains = ninja.terrain as Record<string, unknown>;
        for (const [ch, e] of Object.entries(biome.terreno)) {
          // 'void' (a pit or canal) is drawn as nothing.
          if (e.terrain !== 'void') expect(terrains[e.terrain], `${id} '${ch}' → ${e.terrain}`).toBeDefined();
          if (e.surface) expect(SURFACES[e.surface], `${id} '${ch}' surface ${e.surface}`).toBeDefined();
          if (ch.length === 1) expect(MARKERS.includes(ch), `${id}: legend char '${ch}' is a marker`).toBe(false);
        }
        expect(biome.terreno['.'], `${id}: needs '.' (base floor)`).toBeDefined();
      });

      it('defines the floor’s trap types', () => {
        for (const t of planta?.generacion.trampas.tipos ?? []) {
          const trap = biome.trampas?.[t];
          expect(trap, `${id}: trap ${t}`).toBeDefined();
          if (trap) expect(typeof trap.detect === 'number' && typeof trap.dif === 'number' && !!trap.nombre, `${id}: trap ${t} params`).toBe(true);
        }
      });

      it('meets the role minimums with unique ids', () => {
        const ids = biome.salas.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const [role, n] of Object.entries(MINIMUMS)) expect(biome.salas.filter((r) => r.roles.includes(role)).length, `${id}: ${role}`).toBeGreaterThanOrEqual(n);
      });

      for (const room of biome.salas) {
        it(`${room.id} is a sound room`, () => {
          const { ancho: w, alto: h } = planta?.generacion.celda ?? biome.celda ?? { ancho: room.filas[0]!.length, alto: room.filas.length };
          expect(room.nombre, room.id).toBeTruthy();
          for (const r of room.roles) expect(ROLES, `${room.id} role ${r}`).toContain(r);
          expect(room.filas.length, `${room.id} rows`).toBe(h);
          for (const row of room.filas) expect(row.length, `${room.id} row "${row}"`).toBe(w);

          const base = biome.terreno['.']!;
          const marks: Record<string, Vec2[]> = {};
          const tiles: Tile[] = [];
          room.filas.forEach((row, y) =>
            [...row].forEach((ch, x) => {
              if (MARKERS.includes(ch)) {
                (marks[ch] ??= []).push({ x, y });
                tiles.push({ terrain: base.terrain, height: 0, walkable: true });
                return;
              }
              const e = biome.terreno[ch];
              expect(e, `${room.id}: unknown char '${ch}' at ${x},${y}`).toBeDefined();
              tiles.push({ terrain: e?.terrain ?? 'void', height: e?.height ?? 0, walkable: e?.walkable !== false });
            }),
          );
          const map: GridMap = { id: room.id, width: w, height: h, tiles };
          const at = (p: Vec2): Tile => tiles[p.y * w + p.x]!;

          // The outer ring is wall; the generator opens the sockets it needs.
          for (let x = 0; x < w; x++) for (const y of [0, h - 1]) expect(at({ x, y }).walkable, `${room.id}: ring open at ${x},${y}`).toBe(false);
          for (let y = 0; y < h; y++) for (const x of [0, w - 1]) expect(at({ x, y }).walkable, `${room.id}: ring open at ${x},${y}`).toBe(false);

          const socks = sockets(w, h);
          const usable = Object.entries(socks).filter(([, s]) => s.inside.every((p) => at(p).walkable && at(p).height === 0));
          expect(usable.length, `${room.id}: no usable door`).toBeGreaterThan(0);

          // Markers in their roles.
          const count = (c: string): number => marks[c]?.length ?? 0;
          if (room.roles.includes('inicio')) expect(count('P'), `${room.id}: one P`).toBe(1);
          else expect(count('P'), `${room.id}: P outside inicio`).toBe(0);
          if (room.roles.includes('jefe')) {
            expect(count('J'), `${room.id}: J`).toBeGreaterThan(0);
            expect(count('X'), `${room.id}: X`).toBe(1);
            expect(count('c'), `${room.id}: chest`).toBeGreaterThan(0);
            const ring = Object.values(socks).flatMap((s) => [...s.ring, ...s.inside]);
            expect(ring.some((p) => cheb(p, marks.X![0]!) <= 1), `${room.id}: X next to a door`).toBe(false);
          } else {
            expect(count('J') + count('X'), `${room.id}: J/X outside jefe`).toBe(0);
          }
          if (room.roles.includes('rival')) expect(count('e'), `${room.id}: rival needs an e`).toBeGreaterThan(0);
          for (const p of marks.P ?? []) for (const e of marks.e ?? []) expect(cheb(p, e), `${room.id}: enemy slot ${e.x},${e.y} too near P`).toBeGreaterThan(6);
          if (room.roles.includes('inicio')) expect(count('e') + count('t'), `${room.id}: inicio with enemies or traps`).toBe(0);

          // Everything walkable is one area from the first usable door, even with obstacles in place.
          const start = usable[0]![1].inside[1]!;
          const obstacles = new Set(OBSTACLES.split('').flatMap((c) => (marks[c] ?? []).map(posKey)));
          const walkableTiles: Vec2[] = [];
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at({ x, y }).walkable && !obstacles.has(posKey({ x, y }))) walkableTiles.push({ x, y });
          const reach = reachableTiles(map, start, Infinity, { rules: RULES, blocked: obstacles });
          for (const p of walkableTiles) expect(reach.has(posKey(p)), `${room.id}: ${p.x},${p.y} unreachable`).toBe(true);
          for (const [, s] of usable) for (const p of s.inside) expect(reach.has(posKey(p)), `${room.id}: door tile ${p.x},${p.y}`).toBe(true);
          for (const c of OBSTACLES) for (const p of marks[c] ?? []) expect(reach.size > 0 && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => reach.has(posKey({ x: p.x + dx, y: p.y + dy })))), `${room.id}: ${c} at ${p.x},${p.y} cannot be reached`).toBe(true);

          // Traps never cut a path: with any one trap blocked, the rest stays connected.
          for (const t of marks.t ?? []) {
            const without = new Set([...obstacles, posKey(t)]);
            const from = posKey(start) === posKey(t) ? usable[0]![1].inside[0]! : start;
            const r = reachableTiles(map, from, Infinity, { rules: RULES, blocked: without });
            for (const p of walkableTiles) if (posKey(p) !== posKey(t)) expect(r.has(posKey(p)), `${room.id}: trap ${t.x},${t.y} cuts ${p.x},${p.y}`).toBe(true);
          }
        });
      }
    });
  }
});
