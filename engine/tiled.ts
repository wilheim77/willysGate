import { type GridMap, type Tile, type Vec2, VOID_TILE } from './grid';
import type { LightSource, LightingState } from './lighting';

/**
 * Converts a Tiled JSON map (orthogonal or isometric, embedded tilesets) into a GridMap.
 * Rendering is not the engine's concern: only grid logic is read.
 *
 * Conventions for content/maps:
 * - Tile layer "ground": one tile per cell. Tile properties in the tileset:
 *   terrain (string), height (int), walkable (bool).
 * - Object layer "spawns": point objects; the object name is the spawn id.
 * - Object layer "lights" (optional): point objects with properties radius,
 *   intensity, color, flicker. Map property "ambientLight" (0..1, default 1).
 */

interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}

interface TiledTileset {
  firstgid: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
  source?: string;
}

interface TiledLayer {
  type: string;
  name: string;
  data?: number[];
  objects?: { id?: number; name: string; x: number; y: number; properties?: TiledProperty[] }[];
}

export interface TiledMapJson {
  width: number;
  height: number;
  tilewidth?: number;
  tileheight: number;
  orientation?: string;
  properties?: TiledProperty[];
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

export interface ParsedMap {
  map: GridMap;
  spawns: Record<string, Vec2>;
  lighting: LightingState;
}

const propsOf = (props?: TiledProperty[]): Record<string, unknown> =>
  Object.fromEntries((props ?? []).map((p) => [p.name, p.value]));

// The top bits of a gid encode flips/rotation in Tiled.
const GID_MASK = 0x0fffffff;

export function parseTiledMap(id: string, json: TiledMapJson): ParsedMap {
  const ground = json.layers.find((l) => l.type === 'tilelayer' && l.name === 'ground');
  if (!ground?.data) throw new Error(`Map ${id}: missing tile layer "ground"`);
  if (ground.data.length !== json.width * json.height) throw new Error(`Map ${id}: ground layer size mismatch`);

  const tileDefs = new Map<number, Tile>();
  for (const ts of json.tilesets) {
    if (ts.source) throw new Error(`Map ${id}: external tilesets are not supported, embed them`);
    for (const t of ts.tiles ?? []) {
      const props = Object.fromEntries((t.properties ?? []).map((p) => [p.name, p.value]));
      tileDefs.set(ts.firstgid + t.id, {
        terrain: typeof props.terrain === 'string' ? props.terrain : 'unknown',
        height: typeof props.height === 'number' ? props.height : 0,
        walkable: props.walkable !== false,
      });
    }
  }

  const tiles = ground.data.map((rawGid, i) => {
    const gid = rawGid & GID_MASK;
    if (gid === 0) return { ...VOID_TILE };
    const def = tileDefs.get(gid);
    if (!def) throw new Error(`Map ${id}: tile gid ${gid} at index ${i} has no properties`);
    return { ...def };
  });

  const spawns: Record<string, Vec2> = {};
  const spawnLayer = json.layers.find((l) => l.type === 'objectgroup' && l.name === 'spawns');
  // Isometric maps measure both object axes in tile-height pixels; orthogonal ones use each axis' tile size.
  const unitX = json.orientation === 'isometric' ? json.tileheight : (json.tilewidth ?? json.tileheight);
  const toTile = (o: { x: number; y: number }): Vec2 => ({ x: Math.floor(o.x / unitX), y: Math.floor(o.y / json.tileheight) });
  for (const o of spawnLayer?.objects ?? []) spawns[o.name] = toTile(o);

  const lights: LightSource[] = [];
  const lightLayer = json.layers.find((l) => l.type === 'objectgroup' && l.name === 'lights');
  for (const [i, o] of (lightLayer?.objects ?? []).entries()) {
    const p = propsOf(o.properties);
    const light: LightSource = {
      id: o.name || `light-${o.id ?? i}`,
      position: toTile(o),
      radius: typeof p.radius === 'number' ? p.radius : 4,
      intensity: typeof p.intensity === 'number' ? p.intensity : 1,
    };
    if (typeof p.color === 'string') light.color = p.color;
    if (typeof p.flicker === 'number') light.flicker = p.flicker;
    lights.push(light);
  }
  const ambient = propsOf(json.properties).ambientLight;

  return {
    map: { id, width: json.width, height: json.height, tiles },
    spawns,
    lighting: { ambient: typeof ambient === 'number' ? ambient : 1, lights },
  };
}
