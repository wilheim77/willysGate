import { type BaseCommand, type Entity, type GameEvent, type GameState, type GridMap, createEngine } from '../../engine';
import { createCreature, createWilly, willy } from '../../rulesets/willy';
import { asciiMap } from '../fixtures/helpers';

/** Shared helpers for the Willy ruleset tests. */
const engine = createEngine(willy, 'willy-test');

export const W = (id: string, classId: string, x: number, y: number, level = 1): Entity =>
  createWilly({ id, controllerId: 'player:1', factionId: 'concursantes', position: { x, y }, spriteId: 'willy', classId, level });

export const rat = (id: string, x: number, y: number, extra: Partial<Parameters<typeof createCreature>[0]> = {}): Entity =>
  createCreature({ id, name: 'Rata portuaria', controllerId: 'ai', factionId: 'monstruos', position: { x, y }, spriteId: 'rata-portuaria', vida: 5, def: 10, ataque: 2, dano: '1d4', movimiento: 5, ...extra });

/** '.' floor, digits raised floor, '#' wall, '~' void (a pit you can be pushed into). */
export function map(rows: string[]): GridMap {
  const m = asciiMap(rows.map((r) => r.replaceAll('~', '.')));
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '~') m.tiles[y * m.width + x] = { terrain: 'void', height: 0, walkable: false };
  }));
  return m;
}

export function game(entities: Entity[], rows = ['........']): GameState {
  return engine.newGame({ seed: 3, map: map(rows), entities });
}

/** Runs an action with different RNG states until `ok` holds (for dice-dependent outcomes). */
export function until(state: GameState, actorId: string, actionId: string, target: object, ok: (s: GameState, ev: GameEvent[]) => boolean): { state: GameState; events: GameEvent[] } {
  for (let i = 0; i < 80; i++) {
    const s = { ...state, rng: { ...state.rng, a: (state.rng.a + i * 7919) >>> 0 } };
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: actorId, actionId, target } as BaseCommand);
    if (!r.ok) throw new Error(`${actionId}: ${r.error.code} ${r.error.message}`);
    if (ok(r.state, r.events)) return { state: r.state, events: r.events };
  }
  throw new Error(`${actionId}: never happened`);
}

export { engine };
