import { describe, expect, it } from 'vitest';
import { findPath, parseTiledMap, type TiledMapJson } from '../../engine';
import testMap from '../../content/intereses/maps/test.json';

const tileset = {
  firstgid: 1,
  tiles: [
    { id: 0, properties: [{ name: 'terrain', type: 'string', value: 'stone' }, { name: 'height', type: 'int', value: 0 }] },
    { id: 1, properties: [{ name: 'terrain', type: 'string', value: 'wall' }, { name: 'walkable', type: 'bool', value: false }] },
    { id: 2, properties: [{ name: 'terrain', type: 'string', value: 'stone' }, { name: 'height', type: 'int', value: 1 }] },
  ],
};

describe('parseTiledMap', () => {
  it('reads tile properties, empty cells and spawns', () => {
    const json: TiledMapJson = {
      width: 2,
      height: 2,
      tileheight: 32,
      layers: [
        { type: 'tilelayer', name: 'ground', data: [1, 2, 3, 0] },
        { type: 'objectgroup', name: 'spawns', objects: [{ name: 'hero', x: 48, y: 16 }] },
      ],
      tilesets: [tileset],
    };
    const { map, spawns } = parseTiledMap('t', json);
    expect(map.tiles).toEqual([
      { terrain: 'stone', height: 0, walkable: true },
      { terrain: 'wall', height: 0, walkable: false },
      { terrain: 'stone', height: 1, walkable: true },
      { terrain: 'void', height: 0, walkable: false },
    ]);
    expect(spawns.hero).toEqual({ x: 1, y: 0 });
  });

  it('ignores Tiled flip flags in gids', () => {
    const json: TiledMapJson = {
      width: 1,
      height: 1,
      tileheight: 32,
      layers: [{ type: 'tilelayer', name: 'ground', data: [(0x80000000 | 3) >>> 0] }],
      tilesets: [tileset],
    };
    expect(parseTiledMap('t', json).map.tiles[0]!.height).toBe(1);
  });

  it('fails loudly on missing layers or unknown tiles', () => {
    expect(() => parseTiledMap('t', { width: 1, height: 1, tileheight: 32, layers: [], tilesets: [] })).toThrow(/ground/);
    expect(() =>
      parseTiledMap('t', { width: 1, height: 1, tileheight: 32, layers: [{ type: 'tilelayer', name: 'ground', data: [9] }], tilesets: [tileset] }),
    ).toThrow(/gid 9/);
  });

  it('parses the shipped test map, with the hero able to reach the high platform', () => {
    const { map, spawns } = parseTiledMap('test', testMap as TiledMapJson);
    expect(spawns.hero).toBeDefined();
    const top = map.tiles.findIndex((t) => t.walkable && t.height === 2);
    expect(top).toBeGreaterThanOrEqual(0);
    const goal = { x: top % map.width, y: Math.floor(top / map.width) };
    expect(findPath(map, spawns.hero!, goal)).not.toBeNull();
  });
});
