import { describe, expect, it } from 'vitest';
import { type GameState, applyCommand, lightLevelAt, lightingOf, parseTiledMap, withLighting } from '../../engine';
import { asciiMap, makeEntity } from '../fixtures/helpers';
import { toyRuleset } from '../fixtures/toyRuleset';
import { createEngine } from '../../engine';

const engine = createEngine(toyRuleset, 'toy-game');

function lit(ambient: number): GameState {
  const s = engine.newGame({ seed: 1, map: asciiMap(['..........']), entities: [makeEntity({ id: 'hunter' })] });
  return withLighting(s, {
    ambient,
    lights: [
      { id: 'torch', position: { x: 8, y: 0 }, radius: 4, intensity: 1 },
      { id: 'lantern', attachedTo: 'hunter', radius: 2, intensity: 0.6 },
    ],
  });
}

describe('lighting', () => {
  it('defaults to fully lit when a map has no lighting', () => {
    const s = engine.newGame({ seed: 1, map: asciiMap(['..']), entities: [] });
    expect(lightingOf(s)).toEqual({ ambient: 1, lights: [] });
    expect(lightLevelAt(s, { x: 0, y: 0 })).toBe(1);
  });

  it('falls off linearly from each light and never drops below ambient', () => {
    const s = lit(0.1);
    expect(lightLevelAt(s, { x: 8, y: 0 })).toBe(1);
    expect(lightLevelAt(s, { x: 6, y: 0 })).toBeCloseTo(0.5);
    expect(lightLevelAt(s, { x: 4, y: 0 })).toBe(0.1);
  });

  it('carried lights follow their entity', () => {
    const s = lit(0);
    expect(lightLevelAt(s, { x: 0, y: 0 })).toBeCloseTo(0.6);
    const moved = applyCommand(toyRuleset, s, { type: 'move', issuer: 'player:1', entityId: 'hunter', to: { x: 3, y: 0 } } as never);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(lightLevelAt(moved.state, { x: 0, y: 0 })).toBe(0);
    expect(lightLevelAt(moved.state, { x: 3, y: 0 })).toBeCloseTo(0.6);
  });

  it('survives a save round trip', () => {
    const s = lit(0.2);
    expect(lightingOf(engine.deserialize(engine.serialize(s)))).toEqual(lightingOf(s));
  });

  it('reads lights and ambient from Tiled', () => {
    const { lighting } = parseTiledMap('t', {
      width: 2,
      height: 1,
      tilewidth: 16,
      tileheight: 16,
      orientation: 'orthogonal',
      properties: [{ name: 'ambientLight', type: 'float', value: 0.25 }],
      layers: [
        { type: 'tilelayer', name: 'ground', data: [1, 1] },
        {
          type: 'objectgroup',
          name: 'lights',
          objects: [{ id: 3, name: '', x: 24, y: 8, properties: [{ name: 'radius', value: 5 }, { name: 'flicker', value: 0.3 }] }],
        },
      ],
      tilesets: [{ firstgid: 1, tiles: [{ id: 0, properties: [{ name: 'terrain', value: 'stone' }] }] }],
    });
    expect(lighting).toEqual({ ambient: 0.25, lights: [{ id: 'light-3', position: { x: 1, y: 0 }, radius: 5, intensity: 1, flicker: 0.3 }] });
  });
});
