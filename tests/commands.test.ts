import { describe, expect, it } from 'vitest';
import { applyCommand, createGameState, type GameState } from '../core';
import { asciiMap, deepFreeze, makeEntity } from './helpers';

function setup(): GameState {
  return deepFreeze(
    createGameState({
      seed: 1,
      map: asciiMap([
        '....',
        '.#..',
        '....',
      ]),
      entities: [
        makeEntity({ id: 'hero', position: { x: 0, y: 0 } }),
        makeEntity({ id: 'brea', controllerId: 'ai', factionId: 'callados', position: { x: 3, y: 2 } }),
      ],
    }),
  );
}

describe('MoveCommand', () => {
  it('moves the entity and emits the path', () => {
    const state = setup();
    const r = applyCommand(state, { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 3, y: 0 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.entities.hero!.position).toEqual({ x: 3, y: 0 });
    expect(r.events).toEqual([
      { type: 'entityMoved', entityId: 'hero', from: { x: 0, y: 0 }, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    ]);
  });

  it('does not mutate the previous state (frozen input)', () => {
    const state = setup();
    const r = applyCommand(state, { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 2, y: 2 } });
    expect(r.ok).toBe(true);
    expect(state.entities.hero!.position).toEqual({ x: 0, y: 0 });
  });

  it('rejects commands from a controller that does not own the entity', () => {
    const r = applyCommand(setup(), { type: 'move', issuer: 'player:1', entityId: 'brea', to: { x: 2, y: 2 } });
    expect(r).toMatchObject({ ok: false, error: { code: 'not_your_entity' } });
  });

  it('rejects unknown entities', () => {
    const r = applyCommand(setup(), { type: 'move', issuer: 'player:1', entityId: 'nobody', to: { x: 1, y: 0 } });
    expect(r).toMatchObject({ ok: false, error: { code: 'unknown_entity' } });
  });

  it('rejects unreachable and out-of-bounds destinations', () => {
    const state = setup();
    expect(applyCommand(state, { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 1, y: 1 } })).toMatchObject({
      ok: false,
      error: { code: 'no_path' },
    });
    expect(applyCommand(state, { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 9, y: 9 } })).toMatchObject({
      ok: false,
      error: { code: 'out_of_bounds' },
    });
  });

  it('cannot end on a tile occupied by another entity', () => {
    const r = applyCommand(setup(), { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 3, y: 2 } });
    expect(r).toMatchObject({ ok: false, error: { code: 'no_path' } });
  });

  it('limits movement to speed in combat only', () => {
    const base = setup();
    const slow: GameState = {
      ...base,
      entities: { ...base.entities, hero: { ...base.entities.hero!, speed: 2 } },
    };
    const cmd = { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 3, y: 0 } } as const;
    expect(applyCommand(slow, cmd).ok).toBe(true);
    const combat: GameState = { ...slow, turn: { mode: 'combat', round: 1, activeEntityId: 'hero' } };
    expect(applyCommand(combat, cmd)).toMatchObject({ ok: false, error: { code: 'out_of_range' } });
  });

  it('honours a controller change at runtime (companion turns hostile)', () => {
    const base = setup();
    const turned: GameState = {
      ...base,
      entities: { ...base.entities, hero: { ...base.entities.hero!, controllerId: 'ai', factionId: 'valcarcel' } },
    };
    const cmd = { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 1, y: 0 } } as const;
    expect(applyCommand(turned, cmd)).toMatchObject({ ok: false, error: { code: 'not_your_entity' } });
  });
});
