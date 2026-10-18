import { type Entity, type GridMap, type JsonValue, type MapSetup, type MapZone, type Tile, type Trap, type Vec2, OBSTACLE_TAG } from '../../../engine';
import { createCreature } from '../../../rulesets/willy';
import floorsData from '../data/floors.json';
import balneario from '../data/rooms/balneario.json';
import castro from '../data/rooms/castro.json';
import hiper from '../data/rooms/hiper.json';
import plato from '../data/rooms/plato.json';
import verbena from '../data/rooms/verbena.json';
import { prop, zone } from '../maps';
import { Gen } from './random';
import { RIVAL_RULES, type RivalRecord, generateRival, legendaryById, legendaryEntity, legendaryFor, rebuildProfiles, rivalEntity, rivalKeys } from './rivals';

/**
 * Procedural floors (docs/willy/DESIGN.md §3) assembled from hand-made room chunks
 * (data/rooms/<bioma>.json). Everything comes from deriveSeed(runSeed, 'floor', n, attempt):
 * what you do on floor 1 never changes floor 2, and the same seed always gives the same floor.
 *
 * Steps: a grid of cells; a critical path from the start room to the boss; short branches and
 * the odd loop; a role for each room; a chunk that fits the role and the doors; doors carved
 * between connected rooms; enemies bought with a budget that grows along the path; chests,
 * traps, barrels and lights from the chunk's markers; one rival room at most; then validation
 * (connectivity, no ambushes at the start, enough chests). A failed attempt retries with the next
 * attempt number, up to 20 times.
 */

type Side = 'N' | 'S' | 'E' | 'W';
type Role = 'inicio' | 'jefe' | 'combate' | 'tesoro' | 'trampa' | 'vacia' | 'rival';

interface TerrainDef {
  terrain: string;
  height?: number;
  walkable?: boolean;
  surface?: string;
}

interface RoomChunk {
  id: string;
  nombre: string;
  roles: string[];
  peso: number;
  minFloor?: number;
  filas: string[];
}

interface Biome {
  bioma: string;
  terreno: Record<string, TerrainDef>;
  salas: RoomChunk[];
  trampas: Record<string, { nombre: string; detect: number; dif: number; dano: string; efecto?: string }>;
}

export const BIOMES: Record<string, Biome> = {
  castro: castro as Biome,
  hiper: hiper as unknown as Biome,
  verbena: verbena as unknown as Biome,
  balneario: balneario as unknown as Biome,
  plato: plato as unknown as Biome,
};

/**
 * What a 'b' marker becomes in each biome: something to hide behind or shove into people
 * ('redondo' rolls when pushed). Sprites from the art preset (ninja.json → sprites).
 */
const BIOME_PROPS: Record<string, { sprite: string; nombre: string; tags?: string[] }[]> = {
  castro: [{ sprite: 'barril', nombre: 'Barril', tags: ['redondo'] }],
  hiper: [
    { sprite: 'carrito', nombre: 'Carrito', tags: ['redondo'] },
    { sprite: 'cesta-ofertas', nombre: 'Cesta de ofertas' },
    { sprite: 'caja-registradora', nombre: 'Caja registradora' },
    { sprite: 'estanteria-hiper', nombre: 'Estantería' },
  ],
  verbena: [
    { sprite: 'altavoz-verbena', nombre: 'Altavoz' },
    { sprite: 'barril', nombre: 'Barril de cerveza', tags: ['redondo'] },
  ],
  balneario: [
    { sprite: 'tumbona', nombre: 'Tumbona' },
    { sprite: 'flotador', nombre: 'Flotador', tags: ['redondo'] },
    { sprite: 'sombrilla', nombre: 'Sombrilla' },
  ],
  plato: [
    { sprite: 'camara-estudio', nombre: 'Cámara de estudio' },
    { sprite: 'monitor-escenario', nombre: 'Monitor' },
    { sprite: 'silla-director', nombre: 'Silla de director' },
  ],
};

/** Marker characters: always base-height floor of the biome's '.' terrain. */
const MARKERS = new Set(['e', 'c', 't', 'b', 'B', 'l', 'P', 'J', 'X']);
const MAX_ATTEMPTS = 20;

/** Difficulty levers (floors.json → equilibrio), tuned with the balance simulations. */
const BALANCE = floorsData.equilibrio as unknown as { accionesEnemigo: number; presupuesto: Record<string, number>; primeraPelea: { piso: number; presupuestoMax: number }; jefes: Record<string, { multVida?: number; dano?: string }>; vidaEnemigos: Record<string, number>; guardian: { multVida: number; bonoAtaque: number; bonoDef: number; xp: number } };
const SAFE_DISTANCE = 6;

type Planta = (typeof floorsData.plantas)[number];
type Piso = (typeof floorsData.pisos)[number];

/** One floor of the season: its planta (biome, enemies, boss, mechanic) with the piso's own numbers. */
export type FloorSpec = Planta & { piso: number; parte: number; plantaId: number; xpTotal: number; nivelEsperado: number };

/** Floors in a season. */
export const FLOOR_COUNT = floorsData.pisos.length;

export interface RoomInfo {
  cell: Vec2;
  role: Role;
  chunk: string;
  flipped: boolean;
  critical: boolean;
  /** Steps from the start along the room graph. */
  depth: number;
  height: number;
  links: Side[];
}

export interface FloorResult {
  setup: MapSetup;
  rooms: RoomInfo[];
  rival?: RivalRecord;
  attempt: number;
}

export interface FloorOptions {
  /** The rivals met earlier in the run (for uniqueness and returns). */
  rivals?: RivalRecord[];
  /** Map id; default `planta-<n>`. */
  mapId?: string;
}

const DIRS: Record<Side, Vec2> = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } };
const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const key = (p: Vec2) => `${p.x},${p.y}`;

export function floorSpec(n: number): FloorSpec {
  const piso = floorsData.pisos.find((p) => p.id === n) as Piso | undefined;
  const planta = piso && floorsData.plantas.find((p) => p.id === piso.planta);
  if (!piso || !planta) throw new Error(`No floor ${n}`);
  return {
    ...planta,
    nombre: piso.nombre,
    relojSegundos: piso.relojSegundos,
    generacion: { ...planta.generacion, ...piso.generacion } as Planta['generacion'],
    piso: n,
    parte: piso.parte,
    plantaId: planta.id,
    xpTotal: piso.xpTotal,
    nivelEsperado: piso.nivelEsperado,
  } as FloorSpec;
}

/** The floor for this run. Throws only if every attempt fails (the tests make sure it doesn't). */
export function generateFloor(runSeed: number, n: number, options: FloorOptions = {}): FloorResult {
  const errors: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = tryFloor(runSeed, n, attempt, options);
    if (typeof result !== 'string') return result;
    errors.push(result);
  }
  throw new Error(`Floor ${n} (seed ${runSeed}) failed ${MAX_ATTEMPTS} attempts: ${errors.join('; ')}`);
}

// --- Room graph ------------------------------------------------------------------------------------

interface Node {
  cell: Vec2;
  critical: boolean;
  depth: number;
  /** Index along the critical path (branches: their attachment's). */
  pathIndex: number;
  links: Set<Side>;
}

function neighbour(p: Vec2, s: Side): Vec2 {
  return { x: p.x + DIRS[s].x, y: p.y + DIRS[s].y };
}

function layout(g: Gen, spec: FloorSpec): Node[] | string {
  const { columnas: cols, filas: rows } = spec.generacion.rejilla;
  const inside = (p: Vec2) => p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows;
  const length = g.range(spec.generacion.caminoCritico as [number, number]) + 1;
  const [minRooms, maxRooms] = spec.generacion.salas as [number, number];

  // Critical path: a self-avoiding walk from an edge cell, preferring to move away from the start.
  let path: Vec2[] | undefined;
  for (let tries = 0; tries < 50 && !path; tries++) {
    const edge = g.pick(['N', 'S', 'E', 'W'] as Side[]);
    const start = edge === 'N' ? { x: g.int(0, cols - 1), y: 0 } : edge === 'S' ? { x: g.int(0, cols - 1), y: rows - 1 } : edge === 'W' ? { x: 0, y: g.int(0, rows - 1) } : { x: cols - 1, y: g.int(0, rows - 1) };
    const walk = [start];
    const used = new Set([key(start)]);
    while (walk.length < length) {
      const here = walk[walk.length - 1]!;
      const options = (Object.keys(DIRS) as Side[]).map((s) => neighbour(here, s)).filter((p) => inside(p) && !used.has(key(p)));
      if (!options.length) break;
      const dist = (p: Vec2) => Math.abs(p.x - start.x) + Math.abs(p.y - start.y);
      const next = g.weighted(options, (p) => (dist(p) > dist(here) ? 3 : 1))!;
      walk.push(next);
      used.add(key(next));
    }
    if (walk.length === length) path = walk;
  }
  if (!path) return 'no critical path';

  const nodes = new Map<string, Node>();
  path.forEach((cell, i) => nodes.set(key(cell), { cell, critical: true, depth: i, pathIndex: i, links: new Set() }));
  const link = (a: Node, b: Node) => {
    const s = (Object.keys(DIRS) as Side[]).find((d) => key(neighbour(a.cell, d)) === key(b.cell))!;
    a.links.add(s);
    b.links.add(OPPOSITE[s]);
  };
  for (let i = 1; i < path.length; i++) link(nodes.get(key(path[i - 1]!))!, nodes.get(key(path[i]!))!);

  // Branches off the middle of the path (never off the start or the boss).
  const branchCount = g.range(spec.generacion.ramas as [number, number]);
  const addBranch = (): boolean => {
    const anchors = g.shuffle(path!.slice(1, -1).map((c) => nodes.get(key(c))!));
    for (const anchor of anchors) {
      const free = (Object.keys(DIRS) as Side[]).filter((s) => inside(neighbour(anchor.cell, s)) && !nodes.has(key(neighbour(anchor.cell, s))));
      if (!free.length) continue;
      let from = anchor;
      const steps = g.int(1, 2);
      for (let i = 0; i < steps && nodes.size < maxRooms; i++) {
        const sides = (Object.keys(DIRS) as Side[]).filter((s) => inside(neighbour(from.cell, s)) && !nodes.has(key(neighbour(from.cell, s))));
        if (!sides.length) break;
        const cell = neighbour(from.cell, g.pick(sides));
        const node: Node = { cell, critical: false, depth: from.depth + 1, pathIndex: anchor.pathIndex, links: new Set() };
        nodes.set(key(cell), node);
        link(from, node);
        from = node;
      }
      return true;
    }
    return false;
  };
  for (let i = 0; i < branchCount && nodes.size < maxRooms; i++) addBranch();
  while (nodes.size < minRooms) if (!addBranch()) return 'not enough room for branches';

  // Loops: a branch room sometimes opens onto a neighbouring critical room (not the boss).
  const boss = nodes.get(key(path[path.length - 1]!))!;
  for (const node of nodes.values()) {
    if (node.critical || !g.chance(spec.generacion.probBucle)) continue;
    for (const s of g.shuffle(Object.keys(DIRS) as Side[])) {
      const other = nodes.get(key(neighbour(node.cell, s)));
      if (other && other.critical && other !== boss && !node.links.has(s) && other.pathIndex !== node.pathIndex) {
        link(node, other);
        break;
      }
    }
  }
  return [...nodes.values()];
}

// --- Roles and chunks --------------------------------------------------------------------------------

function assignRoles(g: Gen, spec: FloorSpec, nodes: Node[], rivalRoom: boolean): Role[] {
  const weights = spec.generacion.roles as Record<string, { peso: number; soloEnRamas?: boolean }>;
  const last = nodes.filter((n) => n.critical).length - 1;
  const roles: Role[] = nodes.map((n) => {
    if (n.critical && n.pathIndex === 0) return 'inicio';
    if (n.critical && n.pathIndex === last) return 'jefe';
    const options = Object.entries(weights).filter(([id, w]) => w.peso > 0 && (!w.soloEnRamas || !n.critical) && ['combate', 'tesoro', 'trampa', 'vacia'].includes(id));
    return g.weighted(options, ([, w]) => w.peso)![0] as Role;
  });
  // Never two empty rooms in a row on the critical path.
  const byPath = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.critical).sort((a, b) => a.n.pathIndex - b.n.pathIndex);
  for (let k = 1; k < byPath.length; k++) if (roles[byPath[k]!.i] === 'vacia' && roles[byPath[k - 1]!.i] === 'vacia') roles[byPath[k]!.i] = 'combate';
  if (rivalRoom) {
    const candidates = nodes.map((n, i) => ({ n, i })).filter(({ i }) => roles[i] !== 'inicio' && roles[i] !== 'jefe');
    if (candidates.length) roles[g.pick(candidates).i] = 'rival';
  }
  return roles;
}

/**
 * Base height of each room: the start at 0, then outwards along the links, each room within
 * maxSaltoEntreSalas of the one it is reached from (the doors are one step). A loop link
 * between two rooms that ended up too far apart is closed.
 */
function baseHeights(g: Gen, spec: FloorSpec, nodes: Node[]): number[] {
  const { min, max, maxSaltoEntreSalas: jump } = spec.generacion.alturaBase;
  const index = new Map(nodes.map((n, i) => [key(n.cell), i]));
  const heights: (number | undefined)[] = nodes.map(() => undefined);
  const start = nodes.findIndex((n) => n.critical && n.pathIndex === 0);
  heights[start] = 0;
  const queue = [start];
  while (queue.length) {
    const i = queue.shift()!;
    for (const s of nodes[i]!.links) {
      const j = index.get(key(neighbour(nodes[i]!.cell, s)))!;
      if (heights[j] !== undefined) continue;
      heights[j] = Math.max(min, Math.min(max, heights[i]! + g.int(-jump, jump)));
      queue.push(j);
    }
  }
  for (const [i, n] of nodes.entries()) {
    for (const s of [...n.links]) {
      const j = index.get(key(neighbour(n.cell, s)))!;
      if (Math.abs(heights[i]! - heights[j]!) > jump) {
        n.links.delete(s);
        nodes[j]!.links.delete(OPPOSITE[s]);
      }
    }
  }
  return heights.map((h) => h ?? 0);
}

/** The sides of a chunk usable as doors: the 3 tiles inside the socket are base-height floor. */
export function usableSides(biome: Biome, rows: string[]): Side[] {
  const h = rows.length;
  const w = rows[0]!.length;
  const sx = Math.floor((w - 3) / 2);
  const sy = Math.floor((h - 3) / 2);
  const ok = (x: number, y: number) => {
    const ch = rows[y]![x]!;
    if (MARKERS.has(ch)) return !['t', 'b', 'B', 'c', 'X'].includes(ch);
    const t = biome.terreno[ch];
    return !!t && t.walkable !== false && (t.height ?? 0) === 0;
  };
  const three = (f: (i: number) => boolean) => [0, 1, 2].every(f);
  const sides: Side[] = [];
  if (three((i) => ok(sx + i, 1))) sides.push('N');
  if (three((i) => ok(sx + i, h - 2))) sides.push('S');
  if (three((i) => ok(1, sy + i))) sides.push('W');
  if (three((i) => ok(w - 2, sy + i))) sides.push('E');
  return sides;
}

const MIRROR: Record<string, string> = { '>': '<', '<': '>' };
const flipRows = (rows: string[]) => rows.map((r) => [...r].reverse().map((c) => MIRROR[c] ?? c).join(''));

/** Conveyor belts: the character gives the direction (a flipped room mirrors it). */
const BELT_DIRS: Record<string, Vec2> = { '>': { x: 1, y: 0 }, '<': { x: -1, y: 0 }, '^': { x: 0, y: -1 }, v: { x: 0, y: 1 } };
const flipSide = (s: Side): Side => (s === 'E' ? 'W' : s === 'W' ? 'E' : s);

function pickChunk(g: Gen, biome: Biome, floor: number, role: Role, needed: Side[], usedIds: Set<string>): { chunk: RoomChunk; flipped: boolean } | undefined {
  const options: { chunk: RoomChunk; flipped: boolean }[] = [];
  for (const chunk of biome.salas) {
    if (!chunk.roles.includes(role) || (chunk.minFloor ?? 1) > floor) continue;
    const sides = usableSides(biome, chunk.filas);
    if (needed.every((s) => sides.includes(s))) options.push({ chunk, flipped: false });
    if (needed.every((s) => sides.includes(flipSide(s)))) options.push({ chunk, flipped: true });
  }
  return g.weighted(options, (o) => o.chunk.peso / (usedIds.has(o.chunk.id) ? 4 : 1));
}

// --- Assembly ----------------------------------------------------------------------------------------

function tryFloor(runSeed: number, n: number, attempt: number, options: FloorOptions): FloorResult | string {
  const spec = floorSpec(n);
  const biome = BIOMES[spec.bioma];
  if (!biome) return `no rooms for biome ${spec.bioma}`;
  const g = Gen.of(runSeed, 'floor', n, attempt);
  const nodes = layout(g, spec);
  if (typeof nodes === 'string') return nodes;
  const earlier = options.rivals ?? [];
  const rivalRoom = earlier.every((r) => !r.plantas.includes(n)) && g.chance(RIVAL_RULES.roomChance(spec.plantaId));
  const roles = assignRoles(g, spec, nodes, rivalRoom);
  const heights = baseHeights(g, spec, nodes);

  const cw = spec.generacion.celda.ancho;
  const ch = spec.generacion.celda.alto;
  const minX = Math.min(...nodes.map((d) => d.cell.x));
  const minY = Math.min(...nodes.map((d) => d.cell.y));
  const width = (Math.max(...nodes.map((d) => d.cell.x)) - minX + 1) * cw;
  const height = (Math.max(...nodes.map((d) => d.cell.y)) - minY + 1) * ch;
  const fill = biome.terreno.relleno!;
  const tiles: Tile[] = Array.from({ length: width * height }, () => ({ terrain: fill.terrain, height: fill.height ?? 0, walkable: fill.walkable ?? true }));
  const setTile = (x: number, y: number, t: Tile) => (tiles[y * width + x] = t);
  const floorDef = biome.terreno['.']!;

  const usedIds = new Set<string>();
  const rooms: RoomInfo[] = [];
  const markers: { ch: string; at: Vec2; room: number }[] = [];
  const surfaces: Record<string, { type: string }> = {};
  const belts: { at: Vec2; dir: Vec2 }[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const role = roles[i]!;
    const picked = pickChunk(g, biome, n, role, [...node.links], usedIds);
    if (!picked) return `no ${role} chunk with doors ${[...node.links].join('')}`;
    usedIds.add(picked.chunk.id);
    const base = heights[i]!;
    const rows = picked.flipped ? flipRows(picked.chunk.filas) : picked.chunk.filas;
    if (rows.length !== ch || rows[0]!.length !== cw) return `chunk ${picked.chunk.id} is not ${cw}x${ch}`;
    const ox = (node.cell.x - minX) * cw;
    const oy = (node.cell.y - minY) * ch;
    rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const isMarker = MARKERS.has(c);
        const def = isMarker ? floorDef : biome.terreno[c] ?? floorDef;
        setTile(ox + x, oy + y, { terrain: def.terrain, height: base + (def.height ?? 0), walkable: def.walkable ?? true });
        if (def.surface) surfaces[key({ x: ox + x, y: oy + y })] = { type: def.surface };
        if (def.terrain === 'cinta') belts.push({ at: { x: ox + x, y: oy + y }, dir: BELT_DIRS[c] ?? BELT_DIRS['>']! });
        if (isMarker) markers.push({ ch: c, at: { x: ox + x, y: oy + y }, room: i });
      }),
    );
    rooms.push({ cell: node.cell, role, chunk: picked.chunk.id, flipped: picked.flipped, critical: node.critical, depth: node.depth, height: base, links: [...node.links] });
  }

  // Doors: open the socket on both walls of every link.
  const door = biome.terreno.puerta ?? floorDef;
  const sx = Math.floor((cw - 3) / 2);
  const sy = Math.floor((ch - 3) / 2);
  rooms.forEach((room) => {
    const ox = (room.cell.x - minX) * cw;
    const oy = (room.cell.y - minY) * ch;
    for (const s of room.links) {
      for (let k = 0; k < 3; k++) {
        const p = s === 'N' ? { x: ox + sx + k, y: oy } : s === 'S' ? { x: ox + sx + k, y: oy + ch - 1 } : s === 'W' ? { x: ox, y: oy + sy + k } : { x: ox + cw - 1, y: oy + sy + k };
        setTile(p.x, p.y, { terrain: door.terrain, height: room.height, walkable: true });
      }
    }
  });

  const mapId = options.mapId ?? `planta-${n}`;
  const map: GridMap = { id: mapId, width, height, tiles };
  const populated = populate(g, runSeed, n, spec, biome, rooms, markers, earlier, rivalRoom);
  const error = validate(map, populated, spec);
  if (error) return error;

  const roomZone = (i: number, name: string, layer: string, properties: MapZone['properties']) => {
    const r = rooms[i]!;
    return zone(name, layer, (r.cell.x - minX) * cw + 1, (r.cell.y - minY) * ch + 1, cw - 2, ch - 2, properties);
  };
  const zones: MapZone[] = [];
  populated.foesByRoom.forEach((ids, i) => {
    if (ids.length) zones.push(roomZone(i, `sala-${i}`, 'encounters', { participants: ids.join(',') }));
  });
  // Floor mechanics the ruleset runs at the end of each round (onRoundEnd): belts and tides.
  belts.forEach((b, k) => zones.push(zone(`cinta-${k}`, 'cintas', b.at.x, b.at.y, 1, 1, { dx: b.dir.x, dy: b.dir.y })));
  const tide = (spec.mecanica.reglas as { marea?: { soloEnRoles: string[]; cicloRondas: number; alturaInundada: number; arrastre: number } }).marea;
  if (tide) {
    rooms.forEach((r, i) => {
      if (tide.soloEnRoles.includes(r.role)) zones.push(roomZone(i, `marea-${i}`, 'marea', { ciclo: tide.cicloRondas, altura: r.height + tide.alturaInundada, arrastre: tide.arrastre }));
    });
  }
  const stairs = populated.stairs;
  // Down the stairs: the Camerino between this floor and the next (maps.ts).
  zones.push(zone('escalera', 'exits', stairs.x, stairs.y, 1, 1, { to: `camerino-${n}`, spawn: 'llegada' }));

  for (const t of populated.traps) for (const p of t.tiles) delete surfaces[key(p)];
  return {
    setup: {
      map,
      entities: populated.entities,
      spawns: { llegada: populated.arrival },
      systems: {
        zones: zones as unknown as JsonValue,
        surfaces: surfaces as unknown as JsonValue,
        traps: populated.traps as unknown as JsonValue,
        lighting: { ambient: spec.luzAmbiente, lights: populated.lights } as unknown as JsonValue,
        planta: {
          numero: n,
          bioma: spec.plantaId,
          parte: spec.parte,
          nombre: spec.nombre,
          intento: attempt,
          salas: rooms,
          // For the floor clock (rulesets/willy/clock.ts): which map, how long, and where each room's tiles are.
          mapa: mapId,
          celda: { ancho: cw, alto: ch },
          origen: { x: minX, y: minY },
          reloj: {
            segundos: spec.relojSegundos,
            pasoExploracion: floorsData.reloj.costes.pasoExploracion,
            rondaCombate: floorsData.reloj.costes.rondaCombate,
            avisos: floorsData.reloj.avisos,
            pausaEnJefe: floorsData.reloj.pausaEnJefe,
            segundosPorSala: floorsData.reloj.derrumbe.segundosPorSala,
          },
        } as unknown as JsonValue,
      },
    },
    rooms,
    ...(populated.rival ? { rival: populated.rival } : {}),
    attempt,
  };
}

// --- Population ---------------------------------------------------------------------------------------

interface Populated {
  entities: Entity[];
  foesByRoom: string[][];
  traps: Trap[];
  lights: { id: string; position: Vec2; radius: number; intensity: number; color: string; flicker: number }[];
  arrival: Vec2;
  stairs: Vec2;
  chests: { at: Vec2; critical: boolean }[];
  rival?: RivalRecord;
}

type EnemyDef = { nombre: string; tipo: string; coste: number; vida: number; def: number; ataque: number; dano: string; movimiento: number; rasgos: string[]; xp: number; etiquetas: string[] };

function populate(g: Gen, runSeed: number, n: number, spec: FloorSpec, biome: Biome, rooms: RoomInfo[], markers: { ch: string; at: Vec2; room: number }[], earlier: RivalRecord[], rivalRoom: boolean): Populated {
  const entities: Entity[] = [];
  const foesByRoom: string[][] = rooms.map(() => []);
  const traps: Trap[] = [];
  const lights: Populated['lights'] = [];
  const chests: Populated['chests'] = [];
  const slots = (room: number, c: string) => g.shuffle(markers.filter((m) => m.room === room && m.ch === c).map((m) => m.at));
  const enemies = Object.entries(spec.enemigos as unknown as Record<string, EnemyDef>).filter(([, e]) => e.tipo === 'normal');
  const cheapest = Math.min(...enemies.map(([, e]) => e.coste));
  const budgetSpec = spec.generacion.presupuestoEnemigos as { base: number; porProfundidad: number; multRol: Record<string, number> };
  const chestSpec = spec.generacion.cofres.porRol as unknown as Record<string, [number, number]>;
  const trapTypes = spec.generacion.trampas.tipos;
  let arrival: Vec2 | undefined;
  let stairs: Vec2 | undefined;
  let rival: RivalRecord | undefined;

  const firstFightRoom = rooms
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.critical && (r.role === 'combate' || r.role === 'trampa' || r.role === 'rival'))
    .sort((a, b) => a.r.depth - b.r.depth)[0]?.i;
  rooms.forEach((room, i) => {
    const prefix = `p${n}-s${i}`;
    // Fixed markers.
    for (const m of markers.filter((x) => x.room === i)) {
      if (m.ch === 'P') arrival = m.at;
      if (m.ch === 'X') stairs = m.at;
      if (m.ch === 'l') lights.push({ id: `${prefix}-luz-${lights.length}`, position: m.at, radius: 5, intensity: 0.8, color: '#ffd27a', flicker: 0.06 });
    }
    // Boss.
    if (room.role === 'jefe') {
      const at = slots(i, 'J')[0];
      if (at) {
        const boss = spec.parte === 1 ? guardian(g, spec, at, enemies) : planetBoss(spec, at);
        entities.push(boss);
        foesByRoom[i]!.push(boss.id);
      }
    }
    // A rival instead of the room's enemies.
    const enemySlots = slots(i, 'e');
    if (room.role === 'rival' && rivalRoom && enemySlots.length) {
      const at = enemySlots.shift()!;
      const profiles = rebuildProfiles(runSeed, earlier);
      // Someone you made a pact with, or who ran away, may come back (with memory of it).
      const returning = g.shuffle(earlier.filter((r) => r.desenlace === 'pacto' || r.desenlace === 'huida'));
      const back = returning.length && g.chance(RIVAL_RULES.returnChance) ? returning[0] : undefined;
      let e: Entity;
      if (back) {
        const legend = back.legendario ? legendaryById(back.legendario) : undefined;
        e = legend ? legendaryEntity(legend, n, at) : rivalEntity(profiles.get(back.id)!, n, at);
        e = { ...e, tags: [...e.tags, `vuelta:${back.desenlace}`] };
        rival = { ...back, plantas: [...back.plantas, n] };
      } else {
        const usedLegendaries = new Set(earlier.map((r) => r.legendario).filter((x): x is string => !!x));
        const legendary = g.chance(RIVAL_RULES.legendaryChance) ? legendaryFor(g, spec.plantaId, usedLegendaries) : undefined;
        if (legendary) {
          e = legendaryEntity(legendary, n, at);
          rival = { id: e.id, planta: n, ranura: i, legendario: legendary.id, plantas: [n] };
        } else {
          const taken = new Set([...profiles.values()].flatMap(rivalKeys));
          const profile = generateRival(runSeed, n, i, taken);
          e = rivalEntity(profile, n, at);
          rival = { id: e.id, planta: n, ranura: i, plantas: [n] };
        }
      }
      entities.push({ ...e, tags: [...e.tags, 'xp:30'] });
      foesByRoom[i]!.push(e.id);
      enemySlots.length = 0;
    }
    // Enemies bought with the room's budget.
    const mult = budgetSpec.multRol[room.role === 'rival' ? 'combate' : room.role] ?? 0;
    let budget = Math.floor((budgetSpec.base + budgetSpec.porProfundidad * room.depth) * mult * (BALANCE.presupuesto[n] ?? 1));
    if (room.role === 'inicio' || room.role === 'jefe') budget = 0;
    // The first fight of the season is a gentle one (floors.json → equilibrio.primeraPelea).
    if (n === BALANCE.primeraPelea.piso && room.critical && i === firstFightRoom) budget = Math.min(budget, BALANCE.primeraPelea.presupuestoMax);
    while (budget >= cheapest && enemySlots.length) {
      const pick = g.weighted(enemies.filter(([, e]) => e.coste <= budget), () => 1);
      if (!pick) break;
      const [id, def] = pick;
      const at = enemySlots.shift()!;
      const e = createCreature({ id: `${prefix}-${id}-${foesByRoom[i]!.length}`, name: def.nombre, controllerId: 'ai', factionId: 'monstruos', position: at, spriteId: id, vida: Math.round(def.vida * (BALANCE.vidaEnemigos[n] ?? 1)), def: def.def, ataque: def.ataque, dano: def.dano, movimiento: def.movimiento, fue: Math.max(3, def.coste * 3), tags: [...def.etiquetas, `xp:${def.xp}`] });
      // Ordinary enemies act less than Willy (floors.json → equilibrio.accionesEnemigo).
      e.resources.acciones = { current: BALANCE.accionesEnemigo, max: BALANCE.accionesEnemigo };
      entities.push(e);
      foesByRoom[i]!.push(e.id);
      budget -= def.coste;
    }
    // Chests.
    const chestSlots = slots(i, 'c');
    const wanted = room.role === 'jefe' ? 1 : g.range(chestSpec[room.role] ?? [0, 0]);
    chestSlots.slice(0, wanted).forEach((at, k) => {
      entities.push(chest(`${prefix}-cofre-${k}`, at, room.role === 'tesoro' || room.role === 'jefe' ? 'caja-plata' : 'caja-bronce', n));
      chests.push({ at, critical: room.critical });
    });
    // Traps.
    const trapSlots = slots(i, 't');
    const trapCount = room.role === 'trampa' ? Math.min(trapSlots.length, g.int(2, 4)) : 0;
    trapSlots.slice(0, trapCount).forEach((at, k) => {
      const type = g.pick(trapTypes);
      const def = biome.trampas[type];
      traps.push({ id: `${prefix}-trampa-${k}`, tiles: [at], hidden: true, armed: true, params: { tipo: type, nombre: def?.nombre ?? type, detect: def?.detect ?? 12, dif: def?.dif ?? 12, dano: def?.dano ?? '1d4', ...(def?.efecto ? { efecto: def.efecto } : {}) } });
    });
    // Barrels (not all of them, every time).
    for (const at of slots(i, 'b')) {
      if (!g.chance(0.7)) continue;
      const pick = g.pick(BIOME_PROPS[biome.bioma] ?? BIOME_PROPS.castro!);
      entities.push(prop(`${prefix}-${pick.sprite}-${entities.length}`, pick.nombre, pick.sprite, at, pick.tags ?? []));
    }
    for (const at of slots(i, 'B')) if (g.chance(0.8)) entities.push(prop(`${prefix}-gas-${entities.length}`, 'Barril de gas', 'barril-explosivo', at, ['explosivo', 'redondo']));
  });

  // Recompensa mínima: at least two chests. Unused chest, barrel or enemy spots become chests if needed.
  if (chests.length < 2) {
    const order = ['c', 'b', 'e'];
    const spare = markers
      .filter((m) => order.includes(m.ch) && rooms[m.room]!.role !== 'inicio' && !entities.some((e) => key(e.position) === key(m.at)))
      .sort((a, b) => order.indexOf(a.ch) - order.indexOf(b.ch));
    for (const m of spare.slice(0, 2 - chests.length)) {
      entities.push(chest(`p${n}-s${m.room}-cofre-extra-${chests.length}`, m.at, 'caja-bronce', n));
      chests.push({ at: m.at, critical: rooms[m.room]!.critical });
    }
  }
  return { entities: scaleXp(entities, spec.xpTotal), foesByRoom, traps, lights, arrival: arrival ?? { x: 1, y: 1 }, stairs: stairs ?? { x: 1, y: 1 }, chests, ...(rival ? { rival } : {}) };
}

/** The floor's foes share its experience (floors.json → pisos[].xpTotal) in proportion to their own. */
function scaleXp(entities: Entity[], total: number): Entity[] {
  const base = (e: Entity) => Number(e.tags.find((t) => t.startsWith('xp:'))?.slice(3) ?? 0);
  const sum = entities.reduce((s, e) => s + base(e), 0);
  if (!sum) return entities;
  return entities.map((e) => (base(e) ? { ...e, tags: [...e.tags.filter((t) => !t.startsWith('xp:')), `xp:${Math.max(1, Math.round((base(e) * total) / sum))}`] } : e));
}

/** The planta's boss, at the end of its second floor. */
function planetBoss(spec: FloorSpec, at: Vec2): Entity {
  const b = spec.jefe;
  const tune = BALANCE.jefes[spec.piso] ?? {};
  return createCreature({ id: b.id, name: b.nombre, controllerId: 'ai', factionId: 'monstruos', position: at, spriteId: b.id, vida: Math.round(b.vida * (tune.multVida ?? 1)), def: b.def, ataque: b.ataque, dano: tune.dano ?? b.dano, movimiento: b.movimiento, fue: 12, tags: ['jefe', `tamano:${b.tamano}`, ...b.etiquetas, `xp:${b.xp}`] });
}

/** The first floor's guardian: the planta's toughest ordinary enemy, elite and with a boss's two actions. */
function guardian(g: Gen, spec: FloorSpec, at: Vec2, enemies: [string, EnemyDef][]): Entity {
  const top = Math.max(...enemies.map(([, e]) => e.coste));
  const [id, def] = g.pick(enemies.filter(([, e]) => e.coste === top));
  const t = BALANCE.guardian;
  const e = createCreature({
    id: `guardian-p${spec.piso}`,
    name: `${def.nombre}, guardián del piso`,
    controllerId: 'ai',
    factionId: 'monstruos',
    position: at,
    spriteId: id,
    vida: Math.round(def.vida * t.multVida * (BALANCE.vidaEnemigos[spec.piso] ?? 1)),
    def: def.def + t.bonoDef,
    ataque: def.ataque + t.bonoAtaque,
    dano: def.dano,
    movimiento: def.movimiento,
    fue: 10,
    tags: ['jefe', 'guardian', 'elite', ...def.etiquetas, `xp:${def.xp * t.xp}`],
  });
  return e;
}

function chest(id: string, at: Vec2, spriteId: string, floor: number): Entity {
  return prop(id, 'Caja de botín', spriteId, at, ['cofre', `botin:planta-${floor}`]);
}

// --- Validation -----------------------------------------------------------------------------------------

/** Walking reach from the arrival: steps of at most 1 level, around props and traps. */
export function reachable(map: GridMap, from: Vec2, blocked: Set<string>): Set<string> {
  const seen = new Set([key(from)]);
  const queue = [from];
  const at = (p: Vec2) => map.tiles[p.y * map.width + p.x];
  while (queue.length) {
    const p = queue.shift()!;
    for (const s of Object.keys(DIRS) as Side[]) {
      const q = neighbour(p, s);
      if (q.x < 0 || q.y < 0 || q.x >= map.width || q.y >= map.height || seen.has(key(q)) || blocked.has(key(q))) continue;
      const t = at(q)!;
      if (!t.walkable || Math.abs(t.height - at(p)!.height) > 1) continue;
      seen.add(key(q));
      queue.push(q);
    }
  }
  return seen;
}

function validate(map: GridMap, p: Populated, spec: FloorSpec): string | undefined {
  const blocked = new Set([...p.entities.filter((e) => e.tags.includes(OBSTACLE_TAG)).map((e) => key(e.position)), ...p.traps.flatMap((t) => t.tiles.map(key))]);
  const reach = reachable(map, p.arrival, blocked);
  const near = (v: Vec2) => (Object.keys(DIRS) as Side[]).some((s) => reach.has(key(neighbour(v, s))));
  if (!reach.has(key(p.stairs))) return 'stairs unreachable';
  for (const e of p.entities) {
    if (e.tags.includes(OBSTACLE_TAG) ? !near(e.position) : !reach.has(key(e.position)) && !near(e.position)) return `${e.id} unreachable`;
    if (!e.tags.includes(OBSTACLE_TAG) && Math.max(Math.abs(e.position.x - p.arrival.x), Math.abs(e.position.y - p.arrival.y)) < SAFE_DISTANCE) return `${e.id} too close to the arrival`;
  }
  if (p.chests.length < 2) return 'fewer than 2 chests';
  if (!p.chests.some((c) => c.critical)) return 'no chest on the critical path';
  const steps = shortest(map, p.arrival, p.stairs, blocked);
  if (steps === undefined || steps * floorsData.reloj.costes.pasoExploracion > 0.4 * spec.relojSegundos) return 'stairs too far for the clock';
  return undefined;
}

function shortest(map: GridMap, from: Vec2, to: Vec2, blocked: Set<string>): number | undefined {
  const dist = new Map([[key(from), 0]]);
  const queue = [from];
  const at = (p: Vec2) => map.tiles[p.y * map.width + p.x]!;
  while (queue.length) {
    const p = queue.shift()!;
    if (key(p) === key(to)) return dist.get(key(p));
    for (const s of Object.keys(DIRS) as Side[]) {
      const q = neighbour(p, s);
      if (q.x < 0 || q.y < 0 || q.x >= map.width || q.y >= map.height || dist.has(key(q)) || blocked.has(key(q))) continue;
      if (!at(q).walkable || Math.abs(at(q).height - at(p).height) > 1) continue;
      dist.set(key(q), dist.get(key(p))! + 1);
      queue.push(q);
    }
  }
  return undefined;
}
