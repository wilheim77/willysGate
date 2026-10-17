import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type GridMap, type MapZone, type ParsedMap, type TiledMapJson, type Vec2, inBounds, inZone, parseTiledMap, posKey, reachableTiles, tileAt } from '../../engine';
import { DAMAGE_LABELS, SKILLS, SURFACES, dnd5e } from '../../rulesets/dnd5e';
import art from '../../content/intereses/assets/0x72.json';

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

const content = join(import.meta.dirname, '..', '..', 'content', 'intereses');
const FLAGS = JSON.parse(readFileSync(join(content, 'flags.json'), 'utf8')) as Record<string, unknown>;
const CAST = JSON.parse(readFileSync(join(content, 'cast.json'), 'utf8')) as Record<string, { essential?: boolean }>;
const DIALOGUES = new Set(
  readdirSync(join(content, 'dialogues'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => (JSON.parse(readFileSync(join(content, 'dialogues', f), 'utf8')) as { id: string }).id),
);
/** The party travels with the leader, so it can speak on any map. */
const PARTY = ['hero', 'dorotea', 'garran', 'anselmo'];


/**
 * Story order (STORY §7): forward exits that must stay shut until the scene before them is
 * resolved.
 */
const STORY_GATES: Record<string, Record<string, string>> = {
  camino: { 'a-hondonegra': 'prologo_mineros_resuelto' },
  plaza: { 'a-abadia': 'audiencia_concedida', 'a-calles': 'juicio_resuelto', 'a-escorial': 'audiencia_hecha' },
  calles: { 'a-escorial': 'audiencia_hecha' },
  escorial: { 'pozo-del-ahorcado': 'd1_resuelto', bocamina: 'd1_resuelto' },
  abadia: { 'escalera-cripta': 'cripta_abierta' },
};

const RULES = dnd5e.movement;
// Scenery and art props (content/intereses/world.ts); all but levers and doors are assumed to block.
const ART_PROPS = ['oil_cart', 'well', 'campfire', 'gallows', 'tapestry', 'tapestry_crossbow', 'mine_wagon', 'mine_wagon_ore', 'powder_keg', 'resonator', 'fuse_charges', 'remains_forty', 'pulley', 'inscription'];
const OBSTACLE_PROPS = ['barrel_oil', 'barrel', 'crate', 'chest', ...ART_PROPS];
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

      it('uses art that exists (trap markers, light props, art-prop spawns)', () => {
        const props = { ...art.props, ...art.sprites } as Record<string, unknown>;
        for (const t of parsed.zones.filter((z) => z.layer === 'traps')) if (t.properties.marker) expect(props[String(t.properties.marker)], `${t.name}.marker`).toBeDefined();
        for (const l of parsed.lighting.lights) if (l.prop) expect(art.props[l.prop as keyof typeof art.props], `light ${l.id}.prop`).toBeDefined();
        for (const t of new Set(map.tiles.map((t) => t.terrain))) if (t !== 'void') expect(art.terrain[t as keyof typeof art.terrain], `terrain ${t}`).toBeDefined();
        for (const name of Object.keys(parsed.spawns)) {
          const kind = kindOf(name);
          if (ART_PROPS.includes(kind)) expect(props[kind], name).toBeDefined();
        }
      });

      it('wires scenes to real dialogues and speakers, and never fights an essential character', () => {
        for (const z of parsed.zones.filter((z) => z.layer === 'scenes')) {
          const p = z.properties;
          expect(DIALOGUES.has(String(p.dialogue)), `${z.name}: no dialogue "${String(p.dialogue)}"`).toBe(true);
          if (p.speaker) expect(parsed.spawns[String(p.speaker)] ?? PARTY.includes(String(p.speaker)), `${z.name}: speaker ${String(p.speaker)}`).toBeTruthy();
          for (const id of String(p.fight ?? '').split(',').filter(Boolean)) {
            expect(parsed.spawns[id], `${z.name}: fighter ${id} not on the map`).toBeDefined();
            expect(CAST[id]?.essential, `${z.name}: ${id} is essential`).not.toBe(true);
          }
        }
      });

      it('never starts a scene speaker\'s fight from an encounters zone (the scene must run first)', () => {
        const speakers = parsed.zones.filter((z) => z.layer === 'scenes').map((z) => String(z.properties.speaker ?? '')).filter((s) => parsed.spawns[s]);
        for (const e of parsed.zones.filter((z) => z.layer === 'encounters')) {
          const ids = String(e.properties.participants ?? '').split(',');
          for (const s of speakers) {
            expect(ids.includes(s), `${e.name} fights scene speaker ${s}`).toBe(false);
            expect(inZone(e, parsed.spawns[s]!), `${e.name} covers scene speaker ${s}`).toBe(false);
          }
          for (const key of ['setFlag', 'winFlag']) if (e.properties[key] !== undefined) expect(String(e.properties[key]) in FLAGS, `${e.name}.${key}`).toBe(true);
        }
      });

      it('gates only on flags that exist', () => {
        for (const z of parsed.zones)
          for (const key of ['requiresFlag', 'unlessFlag']) {
            const flag = z.properties[key];
            if (flag !== undefined) expect(String(flag) in FLAGS, `${z.layer}/${z.name}.${key} = ${String(flag)}`).toBe(true);
          }
      });

      it('keeps story exits shut until their scene is resolved', () => {
        const exits = parsed.zones.filter((z) => z.layer === 'exits');
        for (const [name, flag] of Object.entries(STORY_GATES[id] ?? {})) {
          const exit = exits.find((e) => e.name === name);
          expect(exit, `${id}: no exit ${name}`).toBeDefined();
          expect(exit?.properties.requiresFlag, `${id}/${name}`).toBe(flag);
        }
      });

      it('cannot walk around a gate scene (probe: block the zone, its exits fall out of reach)', () => {
        const start = origin(parsed);
        for (const z of parsed.zones.filter((z) => z.layer === 'scenes' && z.properties.gate)) {
          // Arriving inside the zone triggers it at once.
          if (inZone(z, start)) continue;
          const walled = new Set([...blocked, ...zoneTiles(z).map(posKey)]);
          const around = reachableTiles(map, start, Infinity, { rules: RULES, blocked: walled });
          for (const name of String(z.properties.protects ?? '').split(',').filter(Boolean)) {
            const exit = parsed.zones.find((e) => e.layer === 'exits' && e.name === name);
            expect(exit, `${z.name} protects unknown exit ${name}`).toBeDefined();
            expect(zoneTiles(exit!).some((t) => around.has(posKey(t))), `${name} reachable around ${z.name}`).toBe(false);
          }
        }
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

  it('wires the act-critical scenes to their dialogues', () => {
    const scene = (map: string, name: string) => maps[map]?.zones.find((z) => z.layer === 'scenes' && z.name === name)?.properties;
    expect(scene('boveda', 'brea-habla')?.dialogue).toBe('boveda_brea');
    expect(scene('mina', 'galeria-sellada')?.dialogue).toBe('galeria_sellada');
    expect(maps.boveda?.zones.some((z) => z.layer === 'encounters'), 'the Bóveda fight starts from boveda_brea, not a zone').toBe(false);
    for (const name of ['d1-asalto', 'd1-defensa']) expect(maps.abadia?.zones.find((z) => z.layer === 'encounters' && z.name === name)?.properties.setFlag).toBe('d1_asalto_terminado');
  });

  it('ships no placeholders: no TODO: anywhere, spawn conditions on real flags', () => {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(text.includes('TODO:'), `${f} has a TODO: placeholder`).toBe(false);
      const json = JSON.parse(text) as { layers: { name: string; objects?: { name: string; properties?: { name: string; value: unknown }[] }[] }[] };
      for (const o of json.layers.find((l) => l.name === 'spawns')?.objects ?? [])
        for (const p of o.properties ?? [])
          if (['requiresFlag', 'unlessFlag', 'requiresAnyFlag'].includes(p.name))
            for (const flag of String(p.value).split(',')) expect(flag in FLAGS, `${f}: spawn ${o.name}.${p.name} = ${flag}`).toBe(true);
    }
  });

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
