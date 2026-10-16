import { type GridMap, type Tile, type Vec2, VOID_TILE } from './grid';

/**
 * Converts a Tiled JSON map (isometric, embedded tilesets) into a GridMap.
 *
 * Conventions for content/maps:
 * - Tile layer "ground": one tile per cell. Tile properties in the tileset:
 *   terrain (string), height (int), walkable (bool).
 * - Object layer "spawns": point objects; the object name is the spawn id.
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
  objects?: { name: string; x: number; y: number }[];
}

export interface TiledMapJson {
  width: number;
  height: number;
  tileheight: number;
  orientation?: string;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

export interface ParsedMap {
  map: GridMap;
  spawns: Record<string, Vec2>;
}

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
  for (const o of spawnLayer?.objects ?? []) {
    // In isometric Tiled maps, object x/y are both measured in tile-height pixels.
    spawns[o.name] = { x: Math.floor(o.x / json.tileheight), y: Math.floor(o.y / json.tileheight) };
  }

  return { map: { id, width: json.width, height: json.height, tiles }, spawns };
}
