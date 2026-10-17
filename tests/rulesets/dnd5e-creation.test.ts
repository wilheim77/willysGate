import { describe, expect, it } from 'vitest';
import { type CreationStep, pointsSpent } from '../../engine';
import { DND5E_CREATION, buildProtagonist, defaultCreation } from '../../rulesets/dnd5e';

const points = DND5E_CREATION.steps.find((s) => s.kind === 'points') as Extract<CreationStep, { kind: 'points' }>;
const base = { id: 'hero', controllerId: 'player:1', factionId: 'party', position: { x: 0, y: 0 }, spriteId: 'cobrador', level: 3 };

describe('5e character creation (point buy)', () => {
  it('every class has a recommended spread that spends exactly 27 points', () => {
    for (const cls of ['fighter', 'rogue', 'wizard', 'cleric']) {
      expect(pointsSpent(points, points.recommended({ class: cls }))).toBe(27);
    }
  });

  it('rejects scores outside 8–15 and overspending', () => {
    expect(pointsSpent(points, { str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeNull();
    const greedy = { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 };
    expect(pointsSpent(points, greedy)).toBe(27);
    expect(() => buildProtagonist({ ...defaultCreation(), abilities: { ...greedy, int: 10 } }, base)).toThrow();
  });

  it('builds the protagonist with racial bonuses and the chosen class', () => {
    const elf = buildProtagonist({ name: '  Aelis  ', race: 'elf', class: 'rogue', abilities: points.recommended({ class: 'rogue' }) }, base);
    expect(elf.name).toBe('Aelis');
    expect(elf.tags).toEqual(expect.arrayContaining(['race:elf', 'class:rogue', 'feature:darkvision']));
    expect(elf.stats.dex).toBe(17);
    expect(points.bonuses!({ race: 'elf' })).toEqual({ dex: 2, int: 1 });
  });

  it('normalises the ability keys (missing ones at 8, extra ones dropped)', () => {
    const hero = buildProtagonist({ name: 'x', race: 'human', class: 'fighter', abilities: { str: 15, dex: 14, con: 14, int: 8, wis: 10, multiattack: 5 } }, base);
    expect(hero.stats.cha).toBe(9);
    expect(hero.stats.multiattack).toBeUndefined();
  });
});

describe('levelling up (Phase 5)', () => {
  it('rebuilds the character at the new level, keeping story tags, wounds and abilities', async () => {
    const { levelUpCharacter } = await import('../../rulesets/dnd5e');
    const hero = buildProtagonist({ name: 'x', race: 'elf', class: 'wizard', abilities: points.recommended({ class: 'wizard' }) }, { ...base, extraTags: ['dialogue:x', 'essential'] });
    const hurt = { ...hero, resources: { ...hero.resources, hp: { current: hero.resources.hp!.max - 5, max: hero.resources.hp!.max } } };
    const up = levelUpCharacter(hurt, 5);
    expect(up.stats.level).toBe(5);
    expect(up.stats.int).toBe(hero.stats.int);
    expect(up.tags).toEqual(expect.arrayContaining(['dialogue:x', 'essential', 'race:elf', 'class:wizard', 'spell:fireball']));
    expect(up.resources.hp!.max).toBeGreaterThan(hero.resources.hp!.max);
    expect(up.resources.hp!.max - up.resources.hp!.current).toBe(5);
    expect(up.resources.spell_slot_3).toBeDefined();
  });
});
