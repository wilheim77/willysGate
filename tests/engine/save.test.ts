import { describe, expect, it } from 'vitest';
import { RngCursor, SCHEMA_VERSION, SaveError, createEngine, extendRuleset } from '../../engine';
import { asciiMap, makeEntity } from '../fixtures/helpers';
import { toyRuleset } from '../fixtures/toyRuleset';

const engine = createEngine(toyRuleset, 'toy-game');

function state() {
  const s = engine.newGame({
    seed: 77,
    map: asciiMap(['...', '.1.']),
    entities: [makeEntity({ id: 'hero', resources: { thirst: { current: 1, max: 5 } }, tags: ['class:hunter'] })],
  });
  return { ...s, flags: { baron_confeso_brea: true, deuda: 4000, ruta: 'cripta' } };
}

describe('save/load', () => {
  it('round-trips through JSON', () => {
    const s = state();
    expect(engine.deserialize(engine.serialize(s))).toEqual(s);
  });

  it('a loaded game continues identically (same rolls, same commands)', () => {
    const s = state();
    const loaded = engine.deserialize(engine.serialize(s));
    const a = new RngCursor(s.rng);
    const b = new RngCursor(loaded.rng);
    for (let i = 0; i < 20; i++) expect(b.die(20)).toEqual(a.die(20));

    const cmd = { type: 'move', issuer: 'player:1', entityId: 'hero', to: { x: 2, y: 0 } };
    expect(engine.apply(loaded, cmd)).toEqual(engine.apply(s, cmd));
  });

  it('rejects invalid JSON and non-saves', () => {
    expect(() => engine.deserialize('{nope')).toThrow(SaveError);
    expect(() => engine.deserialize('{"hello":"world"}')).toThrow(SaveError);
    expect(() => engine.deserialize('[]')).toThrow(SaveError);
  });

  it('rejects saves from another game or ruleset', () => {
    const json = engine.serialize(state());
    expect(() => createEngine(toyRuleset, 'other-game').deserialize(json)).toThrow(/otro juego/);
    expect(() => createEngine({ ...toyRuleset, id: 'other' }, 'toy-game').deserialize(json)).toThrow(/reglas/);
  });

  it('rejects saves from a newer version', () => {
    const json = JSON.stringify({ ...state(), schemaVersion: SCHEMA_VERSION + 1 });
    expect(() => engine.deserialize(json)).toThrow(/más reciente/);
  });

  it('runs ruleset migrations on old saves', () => {
    const v2 = extendRuleset(toyRuleset, {
      id: 'toy',
      version: 2,
      migrations: {
        1: (raw) => ({ ...raw, rulesetVersion: 2, flags: { ...(raw.flags as object), migrated: true } }),
      },
    });
    const loaded = createEngine(v2, 'toy-game').deserialize(engine.serialize(state()));
    expect(loaded.rulesetVersion).toBe(2);
    expect(loaded.flags.migrated).toBe(true);
  });

  it('rejects corrupted saves', () => {
    const s = state();
    expect(() => engine.deserialize(JSON.stringify({ ...s, rng: { a: 1, b: 2, c: 3 } }))).toThrow(SaveError);
    expect(() => engine.deserialize(JSON.stringify({ ...s, map: { ...s.map, tiles: [] } }))).toThrow(SaveError);
    expect(() => engine.deserialize(JSON.stringify({ ...s, entities: { x: { id: 'x' } } }))).toThrow(SaveError);
  });
});
