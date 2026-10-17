// The logic tileset shared by every Intereses map (embedded in each Tiled JSON).
// Order = Tiled tile id. The first 11 ids match content/intereses/maps/test.json;
// scripts/gen-placeholder-tileset.mjs paints one swatch per entry (same order).
export const LOGIC_TILES = [
  { terrain: 'stone', height: 0 },
  { terrain: 'stone', height: 1 },
  { terrain: 'stone', height: 2 },
  { terrain: 'dirt', height: 0 },
  { terrain: 'slag', height: 0 },
  { terrain: 'wall', height: 3, walkable: false },
  { terrain: 'planks', height: 1 },
  { terrain: 'slag', height: 1 },
  { terrain: 'slag', height: 2 },
  { terrain: 'dirt', height: 1 },
  { terrain: 'dirt', height: 2 },
  { terrain: 'stone', height: 3 },
  { terrain: 'slag', height: 3 },
  { terrain: 'dirt', height: 3 },
  { terrain: 'planks', height: 0 },
  { terrain: 'planks', height: 2 },
  { terrain: 'planks', height: 3 },
  { terrain: 'scaffold', height: 1 },
  { terrain: 'scaffold', height: 2 },
  { terrain: 'scaffold', height: 3 },
  { terrain: 'door_closed', height: 3, walkable: false },
  { terrain: 'door_open', height: 0 },
];

/** Tiled tile id for a terrain at a height (walls and closed doors ignore the height). */
export function tileId(terrain, height) {
  const i = LOGIC_TILES.findIndex((t) => t.terrain === terrain && (t.walkable === false || t.height === height));
  if (i < 0) throw new Error(`No logic tile for ${terrain} at height ${height}`);
  return i;
}

export function tilesetJson() {
  const n = LOGIC_TILES.length;
  return {
    firstgid: 1,
    name: 'terrain-logic',
    tilewidth: 32,
    tileheight: 32,
    tilecount: n,
    columns: n,
    image: 'terrain-logic.png',
    imagewidth: 32 * n,
    imageheight: 32,
    margin: 0,
    spacing: 0,
    tiles: LOGIC_TILES.map((t, id) => ({
      id,
      properties: [
        { name: 'terrain', type: 'string', value: t.terrain },
        { name: 'height', type: 'int', value: t.height },
        ...(t.walkable === false ? [{ name: 'walkable', type: 'bool', value: false }] : []),
      ],
    })),
  };
}
