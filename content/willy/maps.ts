import { type Entity, type GridMap, type JsonValue, type MapSetup, type MapZone, type Tile, type Vec2, OBJECT_TAG, OBSTACLE_TAG } from '../../engine';
import { createCreature } from '../../rulesets/willy';

/**
 * First playable maps, built in code from ASCII until the Tiled maps arrive (W3):
 * the Camerino (safe zone) and a hand-made test of floor 1, «Castro Sumergido».
 * Terrain ids are the art preset's (content/willy/assets/ninja.json).
 */

const AI = 'ai';

interface Legend {
  [ch: string]: Tile;
}

const T = (terrain: string, height = 0, walkable = true): Tile => ({ terrain, height, walkable });

/** ASCII → grid. Unknown characters fall back to the '.' entry. */
function asciiMap(id: string, rows: string[], legend: Legend): GridMap {
  const tiles: Tile[] = [];
  for (const row of rows) for (const ch of row) tiles.push({ ...(legend[ch] ?? legend['.']!) });
  return { id, width: rows[0]!.length, height: rows.length, tiles };
}

/** Every tile where `ch` appears. */
function find(rows: string[], ch: string): Vec2[] {
  const out: Vec2[] = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === ch && out.push({ x, y })));
  return out;
}

export const zone = (name: string, layer: string, x: number, y: number, width: number, height: number, properties: MapZone['properties'] = {}): MapZone => ({ name, layer, x, y, width, height, properties });

export function prop(id: string, name: string, spriteId: string, position: Vec2, tags: string[] = []): Entity {
  return {
    id,
    name,
    controllerId: 'none',
    factionId: 'escenario',
    position,
    spriteId,
    stats: { fue: 99, agi: 0, man: 0, agu: 99, car: 0, sue: 0, nivel: 1, armadura: 0 },
    resources: { vida: { current: 6, max: 6 } },
    conditions: [],
    tags: [OBJECT_TAG, OBSTACLE_TAG, ...tags],
  };
}

function npc(id: string, name: string, position: Vec2): Entity {
  return createCreature({ id, name, controllerId: AI, factionId: 'camerino', position, spriteId: id, vida: 20, def: 10, ataque: 0, dano: '1d2', movimiento: 0, tags: ['noncombatant', 'pnj'] });
}

// --- El Camerino -----------------------------------------------------------------------------------

/**
 * The safe zone between floors: Maripuri's shop, Paco's bar, Xelda's desk and Koldo, who talks.
 * The service lift at the bottom goes down to the next floor.
 */
export const CAMERINO_ROWS = [
  '##############',
  '#tttttttttttt#',
  '#mmmmmmmmmmmm#',
  '#mmmmmmmmmmmm#',
  '#mmmmmmmmmmmm#',
  '#mmmmmmmmmmmm#',
  '#mmmmmmmmmmmm#',
  '######EE######',
];

/** Floors in a season; after the last one the lift has nowhere to go (the ending, W5). */
export const LAST_FLOOR = 5;

/**
 * The Camerino after floor `after` (0: before the first). Each one is its own map, so its lift
 * leads to the next floor: 'camerino' → planta-1, 'camerino-1' → planta-2... The regulars are
 * the same people; what they sell and say lives in systems, not in the map.
 */
export function camerino(after = 0): MapSetup {
  const rows = CAMERINO_ROWS;
  const map = asciiMap(after === 0 ? 'camerino' : `camerino-${after}`, rows, {
    '.': T('moqueta'),
    m: T('moqueta'),
    t: T('tarima', 1),
    E: T('moqueta'),
    '#': T('muro-plato', 3, false),
  });
  const exit = find(rows, 'E');
  return {
    map,
    entities: [
      npc('maripuri', 'Maripuri', { x: 2, y: 2 }),
      npc('paco', 'Paco', { x: 6, y: 2 }),
      npc('xelda', 'Xelda', { x: 10, y: 2 }),
      npc('koldo', 'Koldo', { x: 11, y: 5 }),
      prop('mostrador', 'Ultramarinos Maripuri', 'mostrador-maripuri', { x: 2, y: 1 }),
      prop('barra', 'Bar Paco', 'barra-paco', { x: 6, y: 1 }),
      prop('mesa', 'Producción', 'mesa-xelda', { x: 10, y: 1 }),
    ],
    spawns: { llegada: { x: 6, y: 5 }, ascensor: { x: 6, y: 6 } },
    systems: {
      zones: (after < LAST_FLOOR ? [zone('ascensor', 'exits', exit[0]!.x, exit[0]!.y, exit.length, 1, { to: `planta-${after + 1}`, spawn: 'llegada' })] : []) as unknown as JsonValue,
      lighting: { ambient: 0.85, lights: [{ id: 'bombillas', position: { x: 6, y: 1 }, radius: 6, intensity: 0.9, color: '#ffe2a8', flicker: 0.02 }] } as unknown as JsonValue,
    },
  };
}

// --- Prueba del Castro Sumergido (a fixed test map; ?mapa=prueba-castro) ---------------------------------------------------------------

/**
 * A hand-made test of floor 1: a flooded street, the quay above a canal you can be shoved into,
 * a barrel of gas by the fish market, and the first monsters. Legend:
 * '.' wet stone, 'w' wet stone with water, 'q' quay (height 2), 'V' the canal (void),
 * 'L' fish market floor, '#' wall, 'S' arcades (height 1), 'E' back to the Camerino.
 */
export const PLANTA1_ROWS = [
  '################',
  '#E....ww..SSSS.#',
  '#.....ww..SSSS.#',
  '#..ww.....LLLL.#',
  '#..ww.....LLLL.#',
  '#qqqqqq...LLLL.#',
  '#qqqqqq.....ww.#',
  '#VVVVVV.....ww.#',
  '#VVVVVV........#',
  '#..............#',
  '################',
];

export function planta1(): MapSetup {
  const rows = PLANTA1_ROWS;
  const map = asciiMap('prueba-castro', rows, {
    '.': T('piedra-mojada'),
    w: T('piedra-mojada'),
    E: T('piedra-mojada'),
    q: T('muelle', 2),
    V: T('void', 0, false),
    L: T('lonja'),
    S: T('soportal', 1),
    '#': T('muro-castro', 3, false),
  });
  const water = find(rows, 'w');
  const exit = find(rows, 'E')[0]!;
  const enemies: Entity[] = [
    createCreature({ id: 'rata-1', name: 'Rata portuaria', controllerId: AI, factionId: 'monstruos', position: { x: 4, y: 5 }, spriteId: 'rata-portuaria', vida: 5, def: 10, ataque: 2, dano: '1d4', movimiento: 5, fue: 3 }),
    createCreature({ id: 'rata-2', name: 'Rata portuaria', controllerId: AI, factionId: 'monstruos', position: { x: 8, y: 6 }, spriteId: 'rata-portuaria', vida: 5, def: 10, ataque: 2, dano: '1d4', movimiento: 5, fue: 3 }),
    createCreature({ id: 'gaviota-1', name: 'Gaviota de lonja', controllerId: AI, factionId: 'monstruos', position: { x: 12, y: 2 }, spriteId: 'gaviota-de-lonja', vida: 6, def: 11, ataque: 3, dano: '1d4', movimiento: 6, fue: 3 }),
    createCreature({ id: 'cangrejo-1', name: 'Cangrejo con casco', controllerId: AI, factionId: 'monstruos', position: { x: 12, y: 4 }, spriteId: 'cangrejo-con-casco', vida: 10, def: 14, ataque: 3, dano: '1d6', movimiento: 3, fue: 6, tags: ['redondo'] }),
  ];
  const props: Entity[] = [prop('barril-gas', 'Barril de gas', 'barril-explosivo', { x: 9, y: 4 }, ['explosivo', 'redondo']), prop('barril-1', 'Barril', 'barril', { x: 14, y: 8 }, ['redondo'])];
  return {
    map,
    entities: [...enemies, ...props],
    spawns: { llegada: { x: 2, y: 2 }, salida: exit },
    systems: {
      zones: [
        zone('volver', 'exits', exit.x, exit.y, 1, 1, { to: 'camerino', spawn: 'llegada' }),
        zone('primera-pelea', 'encounters', 1, 3, 14, 7, { participants: enemies.map((e) => e.id).join(',') }),
      ] as unknown as JsonValue,
      surfaces: Object.fromEntries(water.map((p) => [`${p.x},${p.y}`, { type: 'agua' }])) as unknown as JsonValue,
      lighting: { ambient: 0.6, lights: [{ id: 'farola', position: { x: 9, y: 3 }, radius: 5, intensity: 0.8, color: '#ffd27a', flicker: 0.06 }] } as unknown as JsonValue,
    },
  };
}

/** Hand-made maps. The floors themselves are generated per run (gen/floor.ts, setup.ts). */
export const MAPS: Record<string, () => MapSetup> = {
  camerino: () => camerino(0),
  ...Object.fromEntries(Array.from({ length: LAST_FLOOR }, (_, i) => [`camerino-${i + 1}`, () => camerino(i + 1)])),
  'prueba-castro': planta1,
};
