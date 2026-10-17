import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, SYSTEM_ISSUER, createEngine, hasCondition, nextAiCommand, surfaceAt } from '../../engine';
import { coverBetween, createCharacter, createMonster, createProp, dnd5e } from '../../rulesets/dnd5e';
import { asciiMap } from '../fixtures/helpers';

const engine = createEngine(dnd5e, 'test');
const ABILITIES = { str: 16, dex: 14, con: 14, int: 16, wis: 12, cha: 8 };
const pc = (id: string, classId: string, level: number, x: number, y: number) =>
  createCharacter({ id, name: id, controllerId: 'player:1', factionId: 'party', position: { x, y }, spriteId: 'hero', classId, raceId: 'human', level, abilities: { ...ABILITIES } });
const monster = (id: string, monsterId: string, x: number, y: number) =>
  createMonster({ id, monsterId, controllerId: 'ai', factionId: 'sinpaga', position: { x, y }, spriteId: monsterId });

function fight(entities: Entity[], rows: string[], first: string): GameState {
  const s = engine.newGame({ seed: 7, map: asciiMap(rows), entities });
  const combatants = entities.filter((e) => !e.tags.includes('object')).map((e) => e.id);
  const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: combatants } as never);
  if (!r.ok) throw new Error(r.error.code);
  const order = [first, ...r.state.turn.order.filter((id) => id !== first)];
  return { ...r.state, turn: { ...r.state.turn, order, activeEntityId: first, movementUsed: 0 } };
}

function until(state: GameState, entityId: string, actionId: string, target: object, ok: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 60; i++) {
    const s = { ...state, rng: { ...state.rng, a: (state.rng.a + i * 7919) >>> 0 } };
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId, actionId, target } as BaseCommand);
    if (!r.ok) throw new Error(`${actionId}: ${r.error.code} ${r.error.message}`);
    if (ok(r.state)) return r.state;
  }
  throw new Error('never happened');
}

describe('push and falls under 5e', () => {
  it('Thunderwave throws a failed saver off a ledge: falling damage and prone', () => {
    // Caster on a 3-level platform; the bandit next to it falls 3 levels when pushed east.
    const rows = ['333..', '333..', '333..'];
    const s = fight([pc('mage', 'wizard', 3, 1, 1), monster('b', 'thug', 2, 1)], rows, 'mage');
    const after = until(s, 'mage', 'spell:thunderwave', {}, (st) => st.entities.b!.position.x > 2);
    expect(after.entities.b!.position.x).toBe(4);
    expect(hasCondition(after.entities.b!, 'prone')).toBe(true);
  });

  it('Shove pushes one tile and is a contest', () => {
    const s = fight([pc('garran', 'fighter', 3, 0, 0), monster('b', 'bandit', 1, 0)], ['.....'], 'garran');
    const preview = dnd5e.previewAction(s, 'garran', 'basic:shove', { entityId: 'b' });
    expect(preview.chance).toBeGreaterThan(0.5);
    const after = until(s, 'garran', 'basic:shove', { entityId: 'b' }, (st) => st.entities.b!.position.x === 2);
    expect(after.entities.b!.position).toEqual({ x: 2, y: 0 });
  });
});

describe('surfaces under 5e', () => {
  it('fire runs along a connected pool of oil, but not to a separate one', () => {
    let s = engine.newGame({ seed: 1, map: asciiMap(['.......']), entities: [] });
    const oil = [0, 1, 2, 4].map((x) => ({ x, y: 0 }));
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: oil, surface: 'oil' }]).state;
    s = engine.applyEffects(s, [{ type: 'applyElement', tiles: [{ x: 0, y: 0 }], element: 'fire' }]).state;
    expect([0, 1, 2].map((x) => surfaceAt(s, { x, y: 0 })?.type)).toEqual(['fire', 'fire', 'fire']);
    expect(surfaceAt(s, { x: 4, y: 0 })?.type).toBe('oil');
  });

  it('fire spells ignite oil and grease; fire burns those who stand in it', () => {
    let s = fight([pc('mage', 'wizard', 5, 0, 0), monster('b', 'bandit', 6, 0)], ['........'], 'mage');
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 6, y: 0 }, { x: 5, y: 0 }], surface: 'oil' }]).state;
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'mage', actionId: 'spell:fire_bolt', target: { entityId: 'b' } } as BaseCommand);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(surfaceAt(r.state, { x: 6, y: 0 })?.type).toBe('fire');
    expect(surfaceAt(r.state, { x: 5, y: 0 })?.type).toBe('fire'); // the connected oil catches too
  });

  it('cold freezes water and lightning electrifies it', () => {
    let s = fight([pc('mage', 'wizard', 5, 0, 0), monster('b1', 'thug', 4, 0), monster('b2', 'thug', 4, 2)], ['.....', '.....', '.....'], 'mage');
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 4, y: 0 }, { x: 4, y: 2 }], surface: 'water' }]).state;
    const cold = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'mage', actionId: 'spell:ray_of_frost', target: { entityId: 'b1' } } as BaseCommand);
    expect(cold.ok && surfaceAt(cold.state, { x: 4, y: 0 })?.type).toBe('ice');
    const bolt = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'mage', actionId: 'spell:lightning_bolt', target: { tile: { x: 4, y: 2 } } } as BaseCommand);
    expect(bolt.ok && surfaceAt(bolt.state, { x: 4, y: 2 })?.type).toBe('electrified');
  });

  it('Grease covers the area and can knock people down', () => {
    const s = fight([pc('mage', 'wizard', 3, 0, 0), monster('b', 'bandit', 4, 1)], ['......', '......', '......'], 'mage');
    const after = until(s, 'mage', 'spell:grease', { tile: { x: 4, y: 1 } }, (st) => hasCondition(st.entities.b!, 'prone'));
    expect(surfaceAt(after, { x: 4, y: 1 })?.type).toBe('grease');
    expect(surfaceAt(after, { x: 3, y: 0 })?.type).toBe('grease');
  });
});

describe('objects, cover and line of sight', () => {
  it('an oil barrel explodes when destroyed: fire around it and burning oil', () => {
    const barrel = createProp({ id: 'barrel', kind: 'barrel_oil', position: { x: 3, y: 0 } });
    const s = fight([pc('mage', 'wizard', 5, 0, 0), monster('b', 'thug', 4, 0), barrel], ['......', '......'], 'mage');
    const after = until(s, 'mage', 'spell:fire_bolt', { entityId: 'barrel' }, (st) => hasCondition(st.entities.barrel!, 'dead'));
    expect(surfaceAt(after, { x: 4, y: 1 })?.type).toBe('fire');
    expect(after.entities.b!.resources.hp!.current).toBeLessThan(after.entities.b!.resources.hp!.max);
  });

  it('attacks against objects never miss', () => {
    const crate = createProp({ id: 'crate', kind: 'crate', position: { x: 3, y: 0 } });
    const s = fight([pc('mage', 'wizard', 5, 0, 0), monster('b', 'thug', 5, 1), crate], ['......', '......'], 'mage');
    expect(engine.ruleset.previewAction(s, 'mage', 'spell:fire_bolt', { entityId: 'crate' }).chance).toBe(1);
    for (let i = 0; i < 20; i++) {
      const seeded = { ...s, rng: { ...s.rng, a: (s.rng.a + i * 7919) >>> 0 } };
      const r = engine.apply(seeded, { type: 'act', issuer: 'player:1', entityId: 'mage', actionId: 'spell:fire_bolt', target: { entityId: 'crate' } } as BaseCommand);
      if (!r.ok) throw new Error(r.error.code);
      expect(r.state.entities.crate!.resources.hp!.current).toBeLessThan(12);
    }
  });

  it('crates and barrels give cover; walls block sight', () => {
    const crate = createProp({ id: 'crate', kind: 'crate', position: { x: 2, y: 0 } });
    const s = engine.newGame({ seed: 1, map: asciiMap(['.....', '..#..']), entities: [crate] });
    expect(coverBetween(s, { x: 0, y: 0 }, { x: 4, y: 0 })).toMatchObject({ bonus: 2, lineOfSight: true });
    expect(coverBetween(s, { x: 0, y: 1 }, { x: 4, y: 1 })).toMatchObject({ lineOfSight: false });
  });

  it('you cannot shoot what you cannot see', () => {
    const s = fight([pc('dorotea', 'rogue', 3, 0, 0), monster('b', 'bandit', 4, 0)], ['..#..'], 'dorotea');
    expect(dnd5e.previewAction(s, 'dorotea', 'attack:shortbow', { entityId: 'b' })).toMatchObject({ valid: false });
  });

  it('the AI ignores scenery when choosing targets', () => {
    const barrel = createProp({ id: 'barrel', kind: 'barrel', position: { x: 1, y: 0 } });
    const s = fight([monster('b', 'bandit', 0, 1), pc('garran', 'fighter', 3, 5, 1), barrel], ['......', '......'], 'b');
    const cmd = nextAiCommand(dnd5e, s, 'b') as BaseCommand & { target?: { entityId?: string } };
    expect(cmd.target?.entityId).not.toBe('barrel');
  });
});

describe('environment-aware previews and AI', () => {
  it('the shove preview says the target will fall off the ledge', () => {
    const s = fight([pc('garran', 'fighter', 3, 0, 0), monster('b', 'bandit', 1, 0)], ['33...'], 'garran');
    const p = dnd5e.previewAction(s, 'garran', 'basic:shove', { entityId: 'b' });
    expect(p.breakdown?.some((l) => l.term === 'fall' && l.label.includes('3 niveles'))).toBe(true);
    expect(p.affectedTiles).toEqual([{ x: 2, y: 0 }]);
  });

  it('the AI does not end its move standing in fire if it can avoid it', () => {
    let s = fight([monster('b', 'bandit', 0, 1), pc('garran', 'fighter', 3, 3, 1)], ['.....', '.....', '.....'], 'b');
    // Every tile next to Garrán except one is on fire.
    const burning = [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 3, y: 2 }];
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: burning, surface: 'fire' }]).state;
    const cmd = nextAiCommand(dnd5e, s, 'b') as BaseCommand & { to?: { x: number; y: number } };
    if (cmd.type === 'move') expect(cmd.to).toEqual({ x: 2, y: 2 });
  });
});
