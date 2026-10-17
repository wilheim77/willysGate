import { describe, expect, it } from 'vitest';
import {
  type BaseCommand,
  type GameState,
  SYSTEM_ISSUER,
  applyOutcome,
  createEngine,
  hasLineOfSight,
  lightLevelAt,
  lineBetween,
  obstructionsBetween,
  surfaceAt,
  withLighting,
  RngCursor,
} from '../../engine';
import { asciiMap, makeEntity } from '../fixtures/helpers';
import { toyRuleset } from '../fixtures/toyRuleset';

const engine = createEngine(toyRuleset, 'toy-game');
const pool = (n: number) => ({ current: n, max: n });
const hunter = (id: string, x: number, y: number, faction = 'hunters') =>
  makeEntity({ id, factionId: faction, controllerId: faction === 'hunters' ? 'player:1' : 'ai', position: { x, y }, stats: { stride: 6 }, resources: { blood: pool(6), action: pool(1), reaction: pool(1) } });

function run(state: GameState, cmd: BaseCommand) {
  const r = engine.apply(state, cmd);
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.error.code}`);
  return r;
}

describe('line of sight', () => {
  it('traces the tiles between two points', () => {
    expect(lineBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(lineBetween({ x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([]);
  });

  it('walls block; a low step does not; standing high you see over low walls', () => {
    const s = engine.newGame({ seed: 1, map: asciiMap(['.#.', '.1.', '2.2']), entities: [] });
    expect(hasLineOfSight(s, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(hasLineOfSight(s, { x: 0, y: 1 }, { x: 2, y: 1 })).toBe(true);
    // From level 2 a wall of height 3 still blocks (rise of 1 < 2 but walls block up to their height).
    expect(hasLineOfSight(s, { x: 0, y: 2 }, { x: 2, y: 2 })).toBe(true);
  });

  it('obstacle entities obstruct (for cover) but do not blind', () => {
    const crate = makeEntity({ id: 'crate', position: { x: 1, y: 0 }, tags: ['obstacle', 'object'] });
    const s = engine.newGame({ seed: 1, map: asciiMap(['...']), entities: [crate] });
    expect(obstructionsBetween(s, { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([{ tile: { x: 1, y: 0 }, kind: 'entity', entityId: 'crate' }]);
    expect(hasLineOfSight(s, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });

  it('walls cast shadows', () => {
    let s = engine.newGame({ seed: 1, map: asciiMap(['.#..']), entities: [] });
    s = withLighting(s, { ambient: 0, lights: [{ id: 't', position: { x: 0, y: 0 }, radius: 5, intensity: 1 }] });
    expect(lightLevelAt(s, { x: 2, y: 0 })).toBe(0);
  });
});

describe('push and falls', () => {
  // The toy ruleset steps up to 2 levels, so a fall needs a drop of 3.
  const ledge = asciiMap(['33.', '33.']);
  it('pushes until a wall or creature and reports the collision', () => {
    const s = engine.newGame({ seed: 1, map: asciiMap(['....#']), entities: [hunter('a', 0, 0)] });
    const r = engine.applyEffects(s, [{ type: 'push', entityId: 'a', dx: 1, dy: 0, distance: 6 }]);
    expect(r.state.entities.a!.position).toEqual({ x: 3, y: 0 });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'entityPushed', entityId: 'a', from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, collidedWith: { wall: true }, remaining: 3 }));
  });

  it('reports a fall when pushed off a ledge, and the ruleset deals the damage', () => {
    const s = engine.newGame({ seed: 1, map: ledge, entities: [hunter('a', 1, 0)] });
    const r = applyOutcome(toyRuleset, s, { effects: [{ type: 'push', entityId: 'a', dx: 1, dy: 0, distance: 1 }], events: [] }, new RngCursor(s.rng));
    expect(r.events).toContainEqual({ type: 'entityFell', entityId: 'a', levels: 3 });
    expect(r.state.entities.a!.resources.blood!.current).toBe(3);
  });

  it('a shove over the edge goes into the void and the ruleset decides (R18), collisions reach the ruleset (R17)', () => {
    const seen: string[] = [];
    const rules = {
      ...toyRuleset,
      onVoid: (_s: GameState, id: string) => (seen.push(`void:${id}`), { effects: [], events: [] }),
      onCollision: (_s: GameState, id: string, hit: { entityId?: string; wall?: boolean }, push: { remaining: number }) => (seen.push(`hit:${id}:${hit.entityId ?? 'wall'}:${push.remaining}`), { effects: [], events: [] }),
    };
    const map = asciiMap(['....']);
    map.tiles[3] = { terrain: 'void', height: 0, walkable: false };
    const s = engine.newGame({ seed: 1, map, entities: [hunter('a', 1, 0)] });
    const r = applyOutcome(rules, s, { effects: [{ type: 'push', entityId: 'a', dx: 1, dy: 0, distance: 4 }], events: [] }, new RngCursor(s.rng));
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'entityPushed', to: { x: 3, y: 0 }, into: 'void' }));
    const s2 = engine.newGame({ seed: 1, map: asciiMap(['....']), entities: [hunter('a', 0, 0), hunter('b', 2, 0)] });
    applyOutcome(rules, s2, { effects: [{ type: 'push', entityId: 'a', dx: 1, dy: 0, distance: 3 }], events: [] }, new RngCursor(s2.rng));
    expect(seen).toEqual(['void:a', 'hit:a:b:2']);
  });

  it('cannot be pushed up a ledge', () => {
    const s = engine.newGame({ seed: 1, map: asciiMap(['.3']), entities: [hunter('a', 0, 0)] });
    expect(engine.applyEffects(s, [{ type: 'push', entityId: 'a', dx: 1, dy: 0, distance: 1 }]).state.entities.a!.position).toEqual({ x: 0, y: 0 });
  });
});

describe('surfaces', () => {
  it('spawns, reacts to elements and clears, as data', () => {
    let s = engine.newGame({ seed: 1, map: asciiMap(['....']), entities: [] });
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }], surface: 'mud' }]).state;
    s = engine.applyEffects(s, [{ type: 'applyElement', tiles: [{ x: 0, y: 0 }], element: 'fire' }]).state;
    expect(surfaceAt(s, { x: 0, y: 0 })).toMatchObject({ type: 'burning', turnsLeft: 2 });
    expect(surfaceAt(s, { x: 1, y: 0 })?.type).toBe('mud');
    s = engine.applyEffects(s, [{ type: 'applyElement', tiles: [{ x: 3, y: 0 }], element: 'water' }]).state;
    expect(surfaceAt(s, { x: 3, y: 0 })?.type).toBe('holy_water');
    s = engine.applyEffects(s, [{ type: 'clearSurface', tiles: [{ x: 3, y: 0 }] }]).state;
    expect(surfaceAt(s, { x: 3, y: 0 })).toBeUndefined();
  });

  it('burning surfaces give light', () => {
    let s = engine.newGame({ seed: 1, map: asciiMap(['....']), entities: [] });
    s = withLighting(s, { ambient: 0, lights: [] });
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 0, y: 0 }], surface: 'burning' }]).state;
    expect(lightLevelAt(s, { x: 1, y: 0 })).toBeGreaterThan(0);
  });

  it('hurts creatures walking in, costs extra to cross mud, and burns out over rounds', () => {
    let s = engine.newGame({ seed: 1, map: asciiMap(['......']), entities: [hunter('a', 0, 0), hunter('z', 5, 0, 'night')] });
    s = engine.applyEffects(s, [
      { type: 'spawnSurface', tiles: [{ x: 1, y: 0 }], surface: 'burning' },
      { type: 'spawnSurface', tiles: [{ x: 3, y: 0 }], surface: 'mud' },
    ]).state;
    s = run(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['a', 'z'] } as never).state;
    s = { ...s, turn: { ...s.turn, order: ['a', 'z'], activeEntityId: 'a', movementUsed: 0 } };
    const walked = run(s, { type: 'move', issuer: 'player:1', entityId: 'a', to: { x: 4, y: 0 } } as never).state;
    expect(walked.entities.a!.resources.blood!.current).toBe(5);
    expect(walked.turn.movementUsed).toBe(5); // 4 tiles + 1 for the mud
    let t = walked;
    for (let i = 0; i < 4; i++) t = run(t, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: t.turn.activeEntityId! } as never).state;
    expect(surfaceAt(t, { x: 1, y: 0 })).toBeUndefined();
    expect(surfaceAt(t, { x: 3, y: 0 })?.type).toBe('mud');
  });

  it('survives save and load', () => {
    let s = engine.newGame({ seed: 1, map: asciiMap(['..']), entities: [] });
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 0, y: 0 }], surface: 'mud' }]).state;
    expect(surfaceAt(engine.deserialize(engine.serialize(s)), { x: 0, y: 0 })?.type).toBe('mud');
  });
});

describe('smoke and round-end hooks (R20)', () => {
  it('a sight-blocking surface hides what is behind it', () => {
    let s = engine.newGame({ seed: 1, map: asciiMap(['.....']), entities: [] });
    expect(hasLineOfSight(s, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 2, y: 0 }], surface: 'smoke' }]).state;
    expect(hasLineOfSight(s, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
  });

  it('onRoundEnd runs once per round', () => {
    let rounds = 0;
    const rules = { ...toyRuleset, onRoundEnd: () => (rounds++, { effects: [], events: [] }) };
    const e2 = createEngine(rules, 'test');
    let s = e2.newGame({ seed: 1, map: asciiMap(['......']), entities: [hunter('a', 0, 0), hunter('z', 5, 0, 'night')] });
    const started = e2.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['a', 'z'] } as never);
    if (!started.ok) throw new Error();
    s = started.state;
    for (let i = 0; i < 4; i++) {
      const r = e2.apply(s, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: s.turn.activeEntityId! } as never);
      if (r.ok) s = r.state;
    }
    expect(rounds).toBe(2);
  });
});
