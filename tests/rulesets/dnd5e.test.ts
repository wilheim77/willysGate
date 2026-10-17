import { describe, expect, it } from 'vitest';
import { type GameState, applyEffects, createEngine } from '../../engine';
import { abilityModifier, createCreature, dnd5e, proficiencyBonus } from '../../rulesets/dnd5e';
import { asciiMap } from '../fixtures/helpers';

const engine = createEngine(dnd5e, 'test');

const abilities = { str: 10, dex: 14, con: 12, int: 16, wis: 13, cha: 17 };

function setup(): GameState {
  return engine.newGame({
    seed: 11,
    map: asciiMap(['...']),
    entities: [
      createCreature({
        id: 'cobrador',
        name: 'Cobrador',
        controllerId: 'player:1',
        factionId: 'party',
        position: { x: 0, y: 0 },
        spriteId: 'hero',
        abilities,
        ac: 12,
        hp: 9,
        tags: ['class:wizard', 'race:elf', 'prof:persuasion', 'prof:save:int'],
      }),
    ],
  });
}

describe('dnd5e basics', () => {
  it('computes ability modifiers and proficiency bonus per SRD', () => {
    expect([1, 8, 9, 10, 11, 15, 20].map(abilityModifier)).toEqual([-5, -1, -1, 0, 0, 2, 5]);
    expect([1, 4, 5, 8, 9, 12, 13, 17].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 6]);
  });

  it('creates creatures with generic stats and per-turn resources', () => {
    const e = setup().entities.cobrador!;
    expect(e.stats).toMatchObject({ cha: 17, level: 1, speed: 6, ac: 12 });
    expect(e.resources).toMatchObject({ hp: { current: 9, max: 9 }, action: { current: 1, max: 1 }, reaction: { current: 1, max: 1 } });
  });
});

describe('dnd5e checks', () => {
  it('adds ability modifier and proficiency to skill checks', () => {
    const { result } = engine.check(setup(), { actorId: 'cobrador', check: 'persuasion', target: 14 });
    expect(result.label).toBe('Persuasión');
    expect(result.modifiers).toEqual([
      { label: 'Carisma', value: 3 },
      { label: 'Competencia', value: 2, term: 'proficiency' },
    ]);
    expect(result.total).toBe(result.dice[0]!.kept[0]! + 5);
  });

  it('omits proficiency when not proficient', () => {
    const { result } = engine.check(setup(), { actorId: 'cobrador', check: 'intimidation', target: 12 });
    expect(result.modifiers).toEqual([{ label: 'Carisma', value: 3 }]);
  });

  it('handles saving throws with save proficiency', () => {
    const { result } = engine.check(setup(), { actorId: 'cobrador', check: 'save:int', target: 13 });
    expect(result.label).toBe('Salvación de Inteligencia');
    expect(result.modifiers).toEqual([
      { label: 'Inteligencia', value: 3 },
      { label: 'Competencia', value: 2, term: 'proficiency' },
    ]);
  });

  it('turns situational tags into advantage/disadvantage, cancelling out', () => {
    const s = setup();
    const roll = (situational: string[]) => engine.check(s, { actorId: 'cobrador', check: 'insight', target: 13, situational }).result.dice[0]!;
    expect(roll(['high_ground']).note).toBe('ventaja');
    expect(roll(['darkness']).note).toBe('desventaja');
    expect(roll(['high_ground', 'darkness']).rolls).toHaveLength(1);
  });

  it('applies disadvantage to ability checks while poisoned, but not to saves', () => {
    const s = applyEffects(dnd5e, setup(), [{ type: 'applyCondition', entityId: 'cobrador', condition: 'poisoned' }]).state;
    expect(engine.check(s, { actorId: 'cobrador', check: 'arcana', target: 10 }).result.dice[0]!.note).toBe('desventaja');
    expect(engine.check(s, { actorId: 'cobrador', check: 'save:con', target: 10 }).result.dice[0]!.note).toBeUndefined();
  });

  it('rejects unknown checks', () => {
    expect(() => engine.check(setup(), { actorId: 'cobrador', check: 'flying', target: 10 })).toThrow();
  });
});

describe('dnd5e difficulty, movement and dialogue conditions', () => {
  it('computes spell save DC as 8 + proficiency + casting ability', () => {
    expect(dnd5e.difficulty(setup(), 'cobrador', 'spell')).toBe(8 + 2 + 3);
  });

  it('uses speed as movement budget, zero while restrained', () => {
    const s = setup();
    expect(dnd5e.movementBudget(s.entities.cobrador!, s)).toBe(6);
    const r = applyEffects(dnd5e, s, [{ type: 'applyCondition', entityId: 'cobrador', condition: 'restrained' }]).state;
    expect(dnd5e.movementBudget(r.entities.cobrador!, r)).toBe(0);
  });

  it('exposes class, race, ability and proficiency conditions', () => {
    const s = setup();
    const c = dnd5e.dialogueConditions;
    expect(c.class!(s, 'cobrador', { is: 'wizard' })).toBe(true);
    expect(c.race!(s, 'cobrador', { is: 'dwarf' })).toBe(false);
    expect(c.abilityAtLeast!(s, 'cobrador', { ability: 'cha', min: 17 })).toBe(true);
    expect(c.proficient!(s, 'cobrador', { skill: 'persuasion' })).toBe(true);
  });
});
