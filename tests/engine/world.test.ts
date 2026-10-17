import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, type MapSetup, changeMap, createEngine, lightingOf, presenceTag, spawnsOf, withLighting, withZones, worldOf } from '../../engine';
import { toyRuleset } from '../fixtures/toyRuleset';
import { asciiMap, makeEntity } from '../fixtures/helpers';

const pool = (n: number) => ({ current: n, max: n });
const hunter = (id: string, x: number, y: number) => makeEntity({ id, factionId: 'hunters', position: { x, y }, resources: { blood: pool(6) } });

const mine = (): MapSetup => ({
  map: asciiMap(['....', '....'], 'mine'),
  entities: [makeEntity({ id: 'ghoul', controllerId: 'ai', factionId: 'night', position: { x: 3, y: 1 }, resources: { blood: pool(4) } })],
  spawns: { entrance: { x: 0, y: 0 } },
  systems: { lighting: { ambient: 0.1, lights: [] } },
});

const engine = createEngine(toyRuleset, 'test', {
  dialogues: {
    cart: { id: 'cart', start: 'go', nodes: { go: { text: 'Al carro.', effects: [{ type: 'travel', mapId: 'mine', spawn: 'entrance' }] } } },
  },
  maps: { mine },
});

function village(): GameState {
  let s = engine.newGame({ seed: 1, map: asciiMap(['......'], 'village'), entities: [hunter('hero', 5, 0), hunter('ally', 4, 0), makeEntity({ id: 'baker', controllerId: 'ai', factionId: 'village', position: { x: 0, y: 0 }, tags: ['dialogue:cart'] })] });
  s = withZones(s, [{ name: 'to-mine', layer: 'exits', x: 5, y: 0, width: 1, height: 1, properties: { to: 'mine', spawn: 'entrance' } }]);
  s = withLighting(s, { ambient: 1, lights: [{ id: 'lantern', attachedTo: 'hero', radius: 4, intensity: 1 }] });
  return { ...s, systems: { ...s.systems, spawns: { gate: { x: 5, y: 0 } } } };
}
const go = (s: GameState, cmd: object) => engine.apply(s, { issuer: 'player:1', ...cmd } as BaseCommand);

describe('changing maps', () => {
  it('the party walks out through an exit; the village waits as it was', () => {
    const r = go(village(), { type: 'travel', entityId: 'hero', mapId: 'mine', spawn: 'entrance' });
    if (!r.ok) throw new Error(r.error.message);
    const s = r.state;
    expect(s.map.id).toBe('mine');
    expect(Object.keys(s.entities).sort()).toEqual(['ally', 'ghoul', 'hero']);
    expect(s.entities.hero!.position).toEqual({ x: 0, y: 0 });
    expect(s.entities.ally!.position).not.toEqual(s.entities.hero!.position);
    expect(lightingOf(s).ambient).toBe(0.1);
    expect(lightingOf(s).lights.map((l) => l.id)).toEqual(['lantern']); // the carried lantern came along
    expect(worldOf(s).stashed.village!.entities.baker).toBeDefined();
    expect(spawnsOf(s).entrance).toEqual({ x: 0, y: 0 });
    expect(r.events).toContainEqual({ type: 'mapChanged', from: 'village', to: 'mine', spawn: 'entrance' });
  });

  it('only from an exit leading there, never mid-fight', () => {
    const away = { ...village(), entities: { ...village().entities, hero: { ...village().entities.hero!, position: { x: 2, y: 0 } } } };
    expect(go(away, { type: 'travel', entityId: 'hero', mapId: 'mine', spawn: 'entrance' }).ok).toBe(false);
    expect(go(village(), { type: 'travel', entityId: 'hero', mapId: 'moon', spawn: 'x' }).ok).toBe(false);
  });

  it('coming back restores the stashed map, and dialogue can move the party', () => {
    const there = go(village(), { type: 'travel', entityId: 'hero', mapId: 'mine', spawn: 'entrance' });
    if (!there.ok) throw new Error();
    const back = engine.apply(there.state, { type: 'travel', issuer: 'system', entityId: 'hero', mapId: 'village', spawn: 'gate' } as BaseCommand);
    if (!back.ok) throw new Error(back.error.message);
    expect(back.state.map.id).toBe('village');
    expect(back.state.entities.baker).toBeDefined();
    expect(back.state.entities.ghoul).toBeUndefined();
    expect(worldOf(back.state).stashed.mine!.entities.ghoul).toBeDefined();
    // A conversation that ends in a cart ride.
    const v = { ...village(), entities: { ...village().entities, hero: { ...village().entities.hero!, position: { x: 1, y: 0 } } } };
    const talk = go(v, { type: 'interact', entityId: 'hero', targetId: 'baker' });
    expect(talk.ok && talk.state.map.id).toBe('mine');
  });

  it('survives serialisation', () => {
    const there = go(village(), { type: 'travel', entityId: 'hero', mapId: 'mine', spawn: 'entrance' });
    if (!there.ok) throw new Error();
    expect(engine.deserialize(engine.serialize(there.state))).toEqual(there.state);
  });
});

describe('collapse (I5)', () => {
  it('setTiles lowers the floor and whoever stood there falls', () => {
    const s = engine.newGame({ seed: 1, map: asciiMap(['33..']), entities: [hunter('a', 0, 0)] });
    const r = engine.applyEffects(s, [{ type: 'setTiles', tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }], height: 0 }]);
    expect(r.state.map.tiles[0]!.height).toBe(0);
    expect(r.events).toContainEqual({ type: 'entityFell', entityId: 'a', levels: 3 });
  });
});

describe('story-conditional presence', () => {
  it('someone with a presence rule appears only once the flag is set (checked on arrival)', () => {
    const night = (): MapSetup => ({
      map: asciiMap(['....'], 'gate'),
      entities: [makeEntity({ id: 'raider', controllerId: 'ai', factionId: 'night', position: { x: 3, y: 0 }, resources: { blood: pool(4) }, tags: [presenceTag({ requiresFlag: 'attack' })] })],
      spawns: { in: { x: 0, y: 0 } },
    });
    const e = createEngine(toyRuleset, 'test', { dialogues: {}, maps: { gate: night } });
    const s0 = { ...village(), systems: { ...village().systems, spawns: { gate: { x: 5, y: 0 } } } };
    const calm = changeMap(s0, { gate: night }, 'gate', 'in', ['hero']);
    expect(calm.ok && calm.state.entities.raider).toBeUndefined();
    if (!calm.ok) throw new Error();
    const back = changeMap(calm.state, { gate: night }, 'village', 'gate', ['hero']);
    if (!back.ok) throw new Error();
    const alarmed = { ...back.state, flags: { ...back.state.flags, attack: true } };
    const again = changeMap(alarmed, { gate: night }, 'gate', 'in', ['hero']);
    expect(again.ok && again.state.entities.raider).toBeDefined();
    void e;
  });
});
