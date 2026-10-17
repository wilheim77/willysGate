import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, type Trap, RngCursor, SYSTEM_ISSUER, applyOutcome, createEngine, hasCondition, nextAiCommand, surfaceAt, withTraps } from '../../engine';
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

describe('review fixes (Phase 3)', () => {
  it('fire burns out even when the last in the turn order is dead', () => {
    let s = fight([pc('g', 'fighter', 3, 0, 0), monster('b', 'thug', 3, 0), monster('c', 'thug', 4, 0)], ['......', '......', '......'], 'g');
    s = { ...s, turn: { ...s.turn, order: ['g', 'b', 'c'] } };
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 5, y: 2 }], surface: 'fire' }, { type: 'applyCondition', entityId: 'c', condition: 'dead' }]).state;
    for (let i = 0; i < 8 && surfaceAt(s, { x: 5, y: 2 }); i++) {
      const id = s.turn.activeEntityId!;
      const r = engine.apply(s, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: id } as BaseCommand);
      if (!r.ok) throw new Error(r.error.code);
      s = r.state;
    }
    expect(surfaceAt(s, { x: 5, y: 2 })).toBeUndefined();
  });

  it('a barrel sitting in burning oil burns down and explodes', () => {
    const barrel = createProp({ id: 'barrel', kind: 'barrel_oil', position: { x: 5, y: 0 } });
    let s = fight([pc('g', 'fighter', 3, 0, 0), monster('b', 'thug', 2, 0), barrel], ['......'], 'g');
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 5, y: 0 }], surface: 'fire', turns: 30 }]).state;
    for (let i = 0; i < 30 && !hasCondition(s.entities.barrel!, 'dead'); i++) {
      const r = engine.apply(s, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: s.turn.activeEntityId! } as BaseCommand);
      if (!r.ok) throw new Error(r.error.code);
      s = r.state;
    }
    expect(hasCondition(s.entities.barrel!, 'dead')).toBe(true);
  });

  it('Thunderwave never hurts its caster, even without Sculpt Spells', () => {
    const mage = createCharacter({ id: 'mage', name: 'mage', controllerId: 'player:1', factionId: 'party', position: { x: 1, y: 1 }, spriteId: 'hero', classId: 'wizard', raceId: 'human', level: 1, abilities: { ...ABILITIES }, spells: ['thunderwave'] });
    const s = fight([mage, monster('b', 'thug', 2, 1)], ['....', '....', '....'], 'mage');
    for (let i = 0; i < 10; i++) {
      const seeded = { ...s, rng: { ...s.rng, a: (s.rng.a + i * 7919) >>> 0 } };
      const r = engine.apply(seeded, { type: 'act', issuer: 'player:1', entityId: 'mage', actionId: 'spell:thunderwave', target: {} } as BaseCommand);
      if (!r.ok) throw new Error(r.error.code);
      expect(r.state.entities.mage!.resources.hp!.current).toBe(mage.resources.hp!.current);
    }
  });

  it('a crate next to an archer does not count as an enemy in melee', () => {
    const crate = createProp({ id: 'crate', kind: 'crate', position: { x: 1, y: 0 } });
    const s = fight([pc('d', 'rogue', 3, 0, 0), monster('b', 'thug', 5, 1), crate], ['......', '......'], 'd');
    const ranged = dnd5e.listActions(s, 'd').find((a) => a.tags.includes('ranged') && a.id.startsWith('attack:'))!;
    expect(dnd5e.previewAction(s, 'd', ranged.id, { entityId: 'b' }).breakdown!.some((l) => l.label === 'Desventaja')).toBe(false);
  });

  it('an oil barrel bursts with the first point of damage', () => {
    const barrel = createProp({ id: 'barrel', kind: 'barrel_oil', position: { x: 2, y: 0 } });
    let s = fight([pc('g', 'fighter', 3, 0, 0), monster('b', 'thug', 5, 0), barrel], ['......'], 'g');
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 2, y: 0 }], surface: 'fire' }]).state;
    const r = dnd5e.onSurface!(s, 'barrel', 'fire', 'turnStart', new RngCursor(s.rng));
    expect(r.events.some((e) => e.type === 'exploded')).toBe(true);
  });

  it('a smashed crate gives no cover', () => {
    const crate = createProp({ id: 'crate', kind: 'crate', position: { x: 2, y: 0 } });
    let s = fight([pc('g', 'fighter', 3, 0, 0), monster('b', 'thug', 4, 0), crate], ['.....'], 'g');
    expect(coverBetween(s, { x: 0, y: 0 }, { x: 4, y: 0 }).bonus).toBe(2);
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'crate', condition: 'dead' }]).state;
    expect(coverBetween(s, { x: 0, y: 0 }, { x: 4, y: 0 }).bonus).toBe(0);
  });

  it('multi-target spells need sight of every target, in any order', () => {
    const s = fight([pc('mage', 'wizard', 5, 0, 0), monster('b1', 'thug', 4, 0), monster('b2', 'thug', 4, 2)], ['.....', '.###.', '.###.'], 'mage');
    for (const ids of [['b1', 'b2'], ['b2', 'b1']]) {
      expect(dnd5e.previewAction(s, 'mage', 'spell:scorching_ray', { entityIds: ids }).valid).toBe(false);
    }
  });

  it('nobody is pushed onto a fallen companion, and the fallen still burn', () => {
    let s = fight([pc('g', 'fighter', 3, 0, 0), pc('a', 'cleric', 3, 2, 0), monster('b', 'thug', 1, 0)], ['....'], 'g');
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'a', condition: 'downed' }, { type: 'modifyResource', entityId: 'a', resource: 'hp', delta: -100 }, { type: 'modifyResource', entityId: 'a', resource: 'bleed', delta: 3 }]).state;
    const pushed = engine.applyEffects(s, [{ type: 'push', entityId: 'b', dx: 1, dy: 0, distance: 2 }]).state;
    expect(pushed.entities.b!.position).toEqual({ x: 1, y: 0 });
    const burnt = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 2, y: 0 }], surface: 'fire' }]).state;
    const r = dnd5e.onSurface!(burnt, 'a', 'fire', 'turnStart', new RngCursor(burnt.rng));
    expect(engine.applyEffects(burnt, r.effects).state.entities.a!.resources.bleed!.current).toBeLessThan(3);
  });

  it('walking steers around fire when it can afford to', () => {
    let s = fight([pc('g', 'fighter', 3, 0, 1), monster('b', 'thug', 5, 2)], ['.....', '.....', '.....'], 'g');
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 1, y: 1 }, { x: 2, y: 1 }], surface: 'fire' }]).state;
    const r = engine.apply(s, { type: 'move', issuer: 'player:1', entityId: 'g', to: { x: 3, y: 1 } } as BaseCommand);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.state.entities.g!.resources.hp!.current).toBe(s.entities.g!.resources.hp!.current);
  });

  it('getting up from prone costs half the movement', () => {
    const s = fight([pc('g', 'fighter', 3, 0, 0), monster('b', 'thug', 5, 0)], ['......'], 'g');
    const prone = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'g', condition: 'prone', remainingTurns: 1 }]).state;
    expect(dnd5e.movementBudget(prone.entities.g!, prone)).toBe(dnd5e.movementBudget(s.entities.g!, s) - 3);
  });
});

describe('traps under 5e', () => {
  it('passive Perception spots traps; a failed DEX save takes the damage', () => {
    const elf = createCharacter({ id: 'e', name: 'e', controllerId: 'player:1', factionId: 'party', position: { x: 0, y: 0 }, spriteId: 'hero', classId: 'rogue', raceId: 'elf', level: 3, abilities: { ...ABILITIES, wis: 14 } });
    const trap: Trap = { id: 't', tiles: [{ x: 3, y: 0 }], hidden: true, armed: true, params: { detect: 14, save: 'dex', dc: 30, damage: '2d6', type: 'piercing' } };
    const s = withTraps(engine.newGame({ seed: 4, map: asciiMap(['......']), entities: [elf] }), [trap]);
    expect(dnd5e.noticeTrap!(s, 'e', trap)).toBe(true); // 10 + 2 WIS + 2 proficiency (keen senses)
    const hit = dnd5e.triggerTrap!(s, 'e', trap, new RngCursor(s.rng));
    const after = engine.applyEffects(s, hit.effects).state;
    expect(after.entities.e!.resources.hp!.current).toBeLessThan(elf.resources.hp!.current);
  });

  it('long spells survive walking around out of combat; one-turn snares wear off', () => {
    const s0 = engine.newGame({ seed: 1, map: asciiMap(['......']), entities: [pc('m', 'wizard', 3, 0, 0)] });
    const s1 = engine.applyEffects(s0, [
      { type: 'applyCondition', entityId: 'm', condition: 'mage_armor', remainingTurns: 600 },
      { type: 'applyCondition', entityId: 'm', condition: 'restrained', remainingTurns: 1 },
    ]).state;
    const r = engine.apply(s1, { type: 'move', issuer: 'player:1', entityId: 'm', to: { x: 3, y: 0 } } as BaseCommand);
    if (!r.ok) throw new Error(r.error.code);
    expect(hasCondition(r.state.entities.m!, 'mage_armor')).toBe(true);
    expect(hasCondition(r.state.entities.m!, 'restrained')).toBe(false);
  });
});

describe('essential characters (review 7)', () => {
  it('an essential NPC dropped to 0 is knocked out and stable, never killed', () => {
    const ivo = createMonster({ id: 'ivo', monsterId: 'bandit', controllerId: 'ai', factionId: 'callados', position: { x: 1, y: 0 }, spriteId: 'ivo', extraTags: ['essential'] });
    let s = engine.newGame({ seed: 1, map: asciiMap(['...']), entities: [ivo] });
    s = engine.applyEffects(s, [{ type: 'modifyResource', entityId: 'ivo', resource: 'hp', delta: 1 - s.entities.ivo!.resources.hp!.current }]).state;
    // Burning at 1 HP drops him; burning again while down still doesn't kill.
    let r = applyOutcome(dnd5e, s, dnd5e.onSurface!(s, 'ivo', 'fire', 'turnStart', new RngCursor(s.rng)), new RngCursor(s.rng));
    expect(hasCondition(r.state.entities.ivo!, 'downed')).toBe(true);
    r = applyOutcome(dnd5e, r.state, dnd5e.onSurface!(r.state, 'ivo', 'fire', 'turnStart', new RngCursor(r.state.rng)), new RngCursor(r.state.rng));
    expect(hasCondition(r.state.entities.ivo!, 'dead')).toBe(false);
  });
});
