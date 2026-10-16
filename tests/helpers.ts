import type { Entity, GridMap, Tile } from '../core';

/**
 * Builds a map from ASCII rows: '.' ground, '1'-'9' raised floor at that height, '#' wall.
 */
export function asciiMap(rows: string[], id = 'test'): GridMap {
  const tiles: Tile[] = [];
  for (const row of rows) {
    for (const ch of row) {
      if (ch === '#') tiles.push({ terrain: 'wall', height: 3, walkable: false });
      else if (ch === '.') tiles.push({ terrain: 'stone', height: 0, walkable: true });
      else tiles.push({ terrain: 'stone', height: Number(ch), walkable: true });
    }
  }
  return { id, width: rows[0]!.length, height: rows.length, tiles };
}

export function makeEntity(overrides: Partial<Entity> & Pick<Entity, 'id'>): Entity {
  return {
    name: overrides.id,
    controllerId: 'player:1',
    factionId: 'party',
    position: { x: 0, y: 0 },
    speed: 6,
    spriteId: 'hero',
    ...overrides,
  };
}

export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.values(obj).forEach(deepFreeze);
    Object.freeze(obj);
  }
  return obj;
}
