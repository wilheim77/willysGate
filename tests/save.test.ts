import { describe, expect, it } from 'vitest';
import { RngCursor, SCHEMA_VERSION, SaveError, applyCommand, createGameState, deserializeState, serializeState } from '../core';
import { asciiMap, makeEntity } from './helpers';

function state() {
  const s = createGameState({
    seed: 77,
    map: asciiMap(['...', '.1.']),
    entities: [makeEntity({ id: 'hero' })],
  });
  return { ...s, flags: { baron_confeso_brea: true, deuda: 4000, ruta: 'cripta' } };
}

describe('save/load', () => {
  it('round-trips through JSON', () => {
    const s = state();
    expect(deserializeState(serializeState(s))).toEqual(s);
  });

  it('a loaded game continues identically (same rolls, same commands)', () => {
    const s = state();
    const loaded = deserializeState(serializeState(s));
    const a = new RngCursor(s.rng);
    const b = new RngCursor(loaded.rng);
    for (let i = 0; i < 20; i++) expect(b.d20()).toEqual(a.d20());

    const cmd = { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 2, y: 0 } } as const;
    expect(applyCommand(loaded, cmd)).toEqual(applyCommand(s, cmd));
  });

  it('rejects invalid JSON', () => {
    expect(() => deserializeState('{nope')).toThrow(SaveError);
  });

  it('rejects files that are not saves', () => {
    expect(() => deserializeState('{"hello":"world"}')).toThrow(SaveError);
    expect(() => deserializeState('[]')).toThrow(SaveError);
  });

  it('rejects saves from a newer version', () => {
    const json = JSON.stringify({ ...state(), schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => deserializeState(json)).toThrow(/más reciente/);
  });

  it('rejects corrupted saves', () => {
    const s = state();
    expect(() => deserializeState(JSON.stringify({ ...s, rng: { a: 1, b: 2, c: 3 } }))).toThrow(SaveError);
    expect(() => deserializeState(JSON.stringify({ ...s, map: { ...s.map, tiles: [] } }))).toThrow(SaveError);
    expect(() => deserializeState(JSON.stringify({ ...s, entities: { x: { id: 1 } } }))).toThrow(SaveError);
  });
});
