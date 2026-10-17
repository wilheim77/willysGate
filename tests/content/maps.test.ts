import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type GridMap, type MapZone, type ParsedMap, type TiledMapJson, type Vec2, inBounds, inZone, parseTiledMap, posKey, reachableTiles, tileAt } from '../../engine';
import { DAMAGE_LABELS, SKILLS, SURFACES, dnd5e } from '../../rulesets/dnd5e';

/**
 * Every Intereses map: spawns on walkable ground and reachable from the entry, objects in
 * bounds, traps fully parametrised, exits pointing at real maps and spawns. Movement is 5e's
 * (one level per step). Closed doors count as passable only when a `door-*` spawn sits on them
 * (a usable that opens them); obstacle props block their tile.
 */
const dir = join(import.meta.dirname, '..', '..', 'content', 'intereses', 'maps');
const maps: Record<string, ParsedMap> = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = f.replace(/\.json$/, '');
      return [id, parseTiledMap(id, JSON.parse(readFileSync(join(dir, f), 'utf8')) as TiledMapJson)];
    }),
);

const RULES = dnd5e.movement;
const OBSTACLE_PROPS = ['barrel_oil', 'barrel', 'crate', 'chest', 'resonador'];
const PROPS = [...OBSTACLE_PROPS, 'lever', 'door'];
const kindOf = (name: string): string => name.split('-')[0]!;
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const zoneTiles = (z: MapZone): Vec2[] => Array.from({ length: z.width * z.height }, (_, i) => ({ x: z.x + (i % z.width), y: z.y + Math.floor(i / z.width) }));
const neighbours = (p: Vec2): Vec2[] => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].filter((dx) => dx || dy).map((dx) => ({ x: p.x + dx, y: p.y + dy })));

/** The map as the party can walk it once doors with a usable are opened. */
function walkable(parsed: ParsedMap): GridMap {
  const doors = new Set(Object.entries(parsed.spawns).filter(([n]) => kindOf(n) === 'door').map(([, p]) => posKey(p)));
  return {
    ...parsed.map,
    tiles: parsed.map.tiles.map((t, i) =>
      t.terrain === 'door_closed' && doors.has(posKey({ x: i % parsed.map.width, y: Math.floor(i / parsed.map.width) })) ? { terrain: 'door_open', height: 0, walkable: true } : t,
    ),
  };
}

function origin(parsed: ParsedMap): Vec2 {
  const name = parsed.spawns.hero ? 'hero' : Object.keys(parsed.spawns).find((n) => n.startsWith('entry-'));
  if (!name) throw new Error(`${parsed.map.id}: no hero or entry-* spawn`);
  return parsed.spawns[name]!;
}

describe('Intereses maps', () => {
  it('found the act maps', () => {
    expect(Object.keys(maps).length).toBeGreaterThan(1);
  });

  for (const [id, parsed] of Object.entries(maps)) {
    describe(id, () => {
      const map = walkable(parsed);
      const blocked = new Set(Object.entries(parsed.spawns).filter(([n]) => OBSTACLE_PROPS.includes(kindOf(n))).map(([, p]) => posKey(p)));
      const reach = reachableTiles(map, origin(parsed), Infinity, { rules: RULES, blocked });
      const reachable = (p: Vec2): boolean => reach.has(posKey(p));

      it('puts every spawn on walkable ground', () => {
        for (const [name, p] of Object.entries(parsed.spawns)) {
          expect(inBounds(map, p), `${name} out of bounds`).toBe(true);
          expect(tileAt(map, p)?.walkable, `${name} at ${p.x},${p.y} not walkable`).toBe(true);
        }
      });

      it('never stacks two spawns on one tile', () => {
        const seen = new Map<string, string>();
        for (const [name, p] of Object.entries(parsed.spawns)) {
          expect(seen.get(posKey(p)), `${name} on top of ${seen.get(posKey(p))}`).toBeUndefined();
          seen.set(posKey(p), name);
        }
      });

      it('reaches every creature spawn from the entry, and stands next to every prop', () => {
        for (const [name, p] of Object.entries(parsed.spawns)) {
          if (PROPS.includes(kindOf(name))) expect(neighbours(p).some(reachable), `${name} at ${p.x},${p.y} cannot be reached`).toBe(true);
          else expect(reachable(p), `${name} at ${p.x},${p.y} unreachable`).toBe(true);
        }
      });

      it('keeps lights and zones inside the map', () => {
        for (const l of parsed.lighting.lights) expect(!!l.position && inBounds(map, l.position), `light ${l.id}`).toBe(true);
        for (const z of parsed.zones) {
          expect(z.width > 0 && z.height > 0, `zone ${z.name}`).toBe(true);
          for (const t of zoneTiles(z)) expect(inBounds(map, t), `zone ${z.layer}/${z.name}`).toBe(true);
        }
      });

      it('gives traps every parameter and walkable tiles', () => {
        for (const trap of parsed.zones.filter((z) => z.layer === 'traps')) {
          const p = trap.properties;
          expect(typeof p.detect, `${trap.name}.detect`).toBe('number');
          expect(typeof p.damage === 'string' || typeof p.condition === 'string' || typeof p.surface === 'string', `${trap.name} does nothing`).toBe(true);
          if (p.damage) expect(DAMAGE_LABELS[String(p.type)], `${trap.name}.type`).toBeDefined();
          if (p.save) {
            expect(ABILITIES, `${trap.name}.save`).toContain(p.save);
            expect(typeof p.dc, `${trap.name}.dc`).toBe('number');
          }
          if (p.condition) expect(dnd5e.conditions[String(p.condition)], `${trap.name}.condition`).toBeDefined();
          if (p.surface) expect(SURFACES[String(p.surface)], `${trap.name}.surface`).toBeDefined();
          expect(SKILLS[String(p.disarmCheck)], `${trap.name}.disarmCheck`).toBeDefined();
          expect(typeof p.disarmDc, `${trap.name}.disarmDc`).toBe('number');
          for (const t of zoneTiles(trap)) expect(tileAt(map, t)?.walkable, `${trap.name} on a wall`).toBe(true);
        }
      });

      it('leaves a way out of every collapse (layer "collapse": the floor sinks to `height`)', () => {
        const collapse = parsed.zones.filter((z) => z.layer === 'collapse');
        if (collapse.length === 0) return;
        const sunk = { ...map, tiles: map.tiles.map((t) => ({ ...t })) };
        for (const z of collapse) {
          expect(typeof z.properties.height, `${z.name}.height`).toBe('number');
          for (const p of zoneTiles(z)) sunk.tiles[p.y * map.width + p.x]!.height = Number(z.properties.height);
        }
        const after = reachableTiles(sunk, origin(parsed), Infinity, { rules: RULES, blocked });
        for (const z of collapse) for (const p of zoneTiles(z)) {
          const back = reachableTiles(sunk, p, Infinity, { rules: RULES, blocked });
          expect(back.has(posKey(origin(parsed))), `stuck in ${z.name} at ${p.x},${p.y}`).toBe(true);
        }
        expect(after.size).toBeGreaterThan(0);
      });

      it('paints only known surfaces', () => {
        for (const s of parsed.zones.filter((z) => z.layer === 'surfaces')) expect(SURFACES[String(s.properties.surface)], s.name).toBeDefined();
      });

      it('fills every encounter with spawns of this map', () => {
        for (const e of parsed.zones.filter((z) => z.layer === 'encounters')) {
          const ids = String(e.properties.participants ?? '').split(',').filter(Boolean);
          expect(ids.length, `${e.name} has no participants`).toBeGreaterThan(0);
          for (const pid of ids) expect(parsed.spawns[pid], `${e.name}: ${pid}`).toBeDefined();
        }
      });

      it('sends every exit to a real map and spawn, from a reachable tile', () => {
        for (const e of parsed.zones.filter((z) => z.layer === 'exits')) {
          const to = String(e.properties.to ?? '');
          const spawn = String(e.properties.spawn ?? '');
          expect(maps[to], `${e.name}: unknown map "${to}"`).toBeDefined();
          expect(maps[to]?.spawns[spawn], `${e.name}: no spawn "${spawn}" in ${to}`).toBeDefined();
          expect(zoneTiles(e).some(reachable), `${e.name} unreachable`).toBe(true);
        }
      });

      it('lands arrivals on reachable tiles outside any exit', () => {
        const exits = parsed.zones.filter((z) => z.layer === 'exits');
        for (const [name, p] of Object.entries(parsed.spawns)) {
          if (!name.startsWith('entry-') && name !== 'hero') continue;
          expect(reachable(p), name).toBe(true);
          expect(exits.some((z) => inZone(z, p)), `${name} stands in an exit`).toBe(false);
        }
      });
    });
  }

  it('enters every act map through some exit (except the first)', () => {
    const targets = new Set<string>();
    for (const parsed of Object.values(maps))
      for (const e of parsed.zones.filter((z) => z.layer === 'exits')) targets.add(`${String(e.properties.to)}:${String(e.properties.spawn)}`);
    for (const [id, parsed] of Object.entries(maps)) {
      if (id === 'test' || id === 'camino') continue;
      const entries = Object.keys(parsed.spawns).filter((n) => n.startsWith('entry-'));
      expect(entries.length, `${id} has no entry-* spawn`).toBeGreaterThan(0);
      expect(entries.some((n) => targets.has(`${id}:${n}`)), `${id}: no exit leads here`).toBe(true);
    }
  });
});
