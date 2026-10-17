import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, OBSTACLE_TAG, SYSTEM_ISSUER, createEngine, nextAiCommand, zonesOf } from '../../engine';
import { willy } from '../../rulesets/willy';
import ninja from '../../content/willy/assets/ninja.json';
import floorsData from '../../content/willy/data/floors.json';
import { BIOMES, generateFloor, reachable, usableSides } from '../../content/willy/gen/floor';
import { generateRival, rivalEntity, rivalKeys, rivalLine } from '../../content/willy/gen/rivals';
import { maps, newWillyGame } from '../../content/willy/setup';

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const MARKERS = 'ectbBlPJX';

describe('Willy: room chunks', () => {
  for (const [id, biome] of Object.entries(BIOMES)) {
    const spec = floorsData.plantas.find((p) => p.bioma === id)!;
    it(`${id}: every room fits the cell, uses known characters and has a door`, () => {
      for (const room of biome.salas) {
        expect(room.filas, room.id).toHaveLength(spec.generacion.celda.alto);
        for (const row of room.filas) expect(row.length, `${room.id}: ${row}`).toBe(spec.generacion.celda.ancho);
        for (const ch of room.filas.join('')) expect(biome.terreno[ch] !== undefined || MARKERS.includes(ch), `${room.id}: '${ch}'`).toBe(true);
        expect(usableSides(biome, room.filas).length, room.id).toBeGreaterThan(0);
        const count = (c: string) => [...room.filas.join('')].filter((x) => x === c).length;
        if (room.roles.includes('inicio')) expect(count('P'), room.id).toBe(1);
        if (room.roles.includes('jefe')) expect([count('J'), count('X'), count('c') > 0], room.id).toEqual([1, 1, true]);
        if (room.roles.includes('rival')) expect(count('e'), room.id).toBeGreaterThan(0);
      }
      for (const role of ['inicio', 'jefe', 'combate', 'tesoro', 'trampa', 'vacia', 'rival']) expect(biome.salas.some((r) => r.roles.includes(role)), role).toBe(true);
    });
    it(`${id}: every terrain has art`, () => {
      for (const t of Object.values(biome.terreno)) if (t.terrain !== 'void') expect((ninja.terrain as Record<string, unknown>)[t.terrain], t.terrain).toBeDefined();
    });
  }
});

describe('Willy: procedural floor 1', () => {
  // 100 seeds in the everyday check (fast), 500 with QA_DEEP=1.
  const SEEDS = process.env.QA_DEEP === '1' ? 500 : 100;
  it(`${SEEDS} seeds: every floor generates and keeps its guarantees`, () => {
    let rivals = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const f = generateFloor(seed, 1);
      const { map, entities, spawns, systems } = f.setup;
      const arrival = spawns.llegada!;
      const traps = (systems!.traps as unknown as { tiles: { x: number; y: number }[] }[]).flatMap((t) => t.tiles.map(key));
      const blocked = new Set([...entities.filter((e) => e.tags.includes(OBSTACLE_TAG)).map((e) => key(e.position)), ...traps]);
      const reach = reachable(map, arrival, blocked);
      const stairs = zonesOf({ systems } as unknown as GameState, 'exits')[0]!;
      expect(reach.has(key(stairs)), `seed ${seed}: stairs`).toBe(true);
      expect(entities.filter((e) => e.tags.includes('cofre')).length, `seed ${seed}: chests`).toBeGreaterThanOrEqual(2);
      for (const e of entities.filter((x) => !x.tags.includes(OBSTACLE_TAG))) {
        expect(Math.max(Math.abs(e.position.x - arrival.x), Math.abs(e.position.y - arrival.y)), `seed ${seed}: ${e.id}`).toBeGreaterThanOrEqual(6);
      }
      expect(f.rooms.length).toBeGreaterThanOrEqual(floorsData.plantas[0]!.generacion.salas[0]!);
      expect(f.rooms.filter((r) => r.role === 'jefe')).toHaveLength(1);
      expect(entities.filter((e) => e.tags.includes('jefe'))).toHaveLength(1);
      expect(new Set(entities.map((e) => e.id)).size).toBe(entities.length);
      if (f.rival) rivals++;
    }
    // Floor 1: a rival room half of the time.
    expect(rivals).toBeGreaterThan(180);
    expect(rivals).toBeLessThan(320);
  });

  it('is reproducible, and different seeds give different floors', () => {
    expect(JSON.stringify(generateFloor(42, 1))).toBe(JSON.stringify(generateFloor(42, 1)));
    expect(JSON.stringify(generateFloor(42, 1).setup.map)).not.toBe(JSON.stringify(generateFloor(43, 1).setup.map));
  });

  it('a new season stashes the generated floor, rivals included', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newWillyGame(createEngine(willy, 'willy', { dialogues: {}, maps }), seed);
      const world = s.systems.world as unknown as { stashed: Record<string, { map: unknown }> };
      expect(world.stashed['planta-1']!.map).toEqual(generateFloor(seed, 1).setup.map);
      const rivals = s.systems.rivals as unknown as { id: string }[];
      expect(rivals.length).toBe(generateFloor(seed, 1).rival ? 1 : 0);
    }
  });

  it('a fight in a generated room plays out to the end', () => {
    const engine = createEngine(willy, 'willy', { dialogues: {}, maps });
    const s0 = newWillyGame(engine, 11, { start: 'planta-1' });
    const zone = zonesOf(s0, 'encounters').find((z) => !String(z.properties.participants).includes('jefe'))!;
    const foes = String(zone.properties.participants).split(',');
    // Willy walks in (placed next to the first foe's room centre).
    const s1 = { ...s0, entities: { ...s0.entities, willy: { ...s0.entities.willy!, position: { x: zone.x + 5, y: zone.y + 4 } } } };
    const free = !Object.values(s1.entities).some((e) => e.id !== 'willy' && key(e.position) === key(s1.entities.willy!.position));
    const start = free ? s1 : s0;
    const started = engine.apply(start, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['willy', ...foes] } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    let st: GameState = started.state;
    for (let i = 0; i < 600 && st.turn.mode === 'combat'; i++) {
      const id = st.turn.activeEntityId!;
      const r = engine.apply(st, nextAiCommand(willy, st, id));
      if (r.ok) st = r.state;
      else {
        const skip = engine.apply(st, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: id } as BaseCommand);
        if (skip.ok) st = skip.state;
      }
    }
    expect(st.turn.mode).toBe('exploration');
  });
});

describe('Willy: procedural rivals', () => {
  it('are reproducible and never repeat a unique combination across a run', () => {
    expect(generateRival(9, 2, 3)).toEqual(generateRival(9, 2, 3));
    for (let seed = 1; seed <= 50; seed++) {
      const taken = new Set<string>();
      for (let floor = 1; floor <= 5; floor++) {
        const p = generateRival(seed, floor, 1, taken);
        for (const k of rivalKeys(p)) {
          expect(taken.has(k), `seed ${seed} floor ${floor}: ${k}`).toBe(false);
          taken.add(k);
        }
      }
    }
  });

  it('their lines leave no variable unfilled and their body has art', () => {
    const sprites = ninja.sprites as Record<string, unknown>;
    for (let seed = 1; seed <= 60; seed++) {
      const p = generateRival(seed, 1, 0);
      const e = rivalEntity(p, 1, { x: 0, y: 0 });
      expect(sprites[e.spriteId], e.spriteId).toBeDefined();
      expect(e.name).toMatch(/^\S+ (el|la) /);
      for (const moment of ['presentacion', 'amenaza', 'pacto', 'derrota', 'huida', 'vueltaPacto', 'vueltaHuida', 'traicion'] as const) {
        for (let n = 0; n < 5; n++) expect(rivalLine(p, moment, n), `${moment} ${n}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('scale with the floor', () => {
    const p = generateRival(5, 1, 0);
    const a = rivalEntity(p, 1, { x: 0, y: 0 });
    const b = rivalEntity(p, 5, { x: 0, y: 0 });
    expect(b.resources.vida!.max).toBeGreaterThan(a.resources.vida!.max);
    expect(b.stats.ataque).toBe(a.stats.ataque! + 2);
  });
});
