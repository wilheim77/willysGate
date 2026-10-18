import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, SYSTEM_ISSUER, createEngine } from '../../engine';
import { armorClass, createCharacter, createMonster, dnd5e } from '../../rulesets/dnd5e';
import { equippedWeaponBonus } from '../../rulesets/dnd5e/character';
import { saveBonus } from '../../rulesets/dnd5e/resolve';
import { rollLoot } from '../../rulesets/dnd5e/loot';
import { ITEMS, MONSTERS } from '../../rulesets/dnd5e/data';
import lootJson from '../../rulesets/dnd5e/data/loot.json';
import { asciiMap } from '../fixtures/helpers';

/**
 * Equipping/using loot (rulesets/dnd5e/commands.ts's equipItem/useItem, and the AC/save/
 * attack bonuses in character.ts/resolve.ts/actions.ts). See loot.ts for the drop rolls
 * themselves (covered by tests/playthrough/lootBalance.test.ts).
 */

const engine = createEngine(dnd5e, 'test');
const ABILITIES = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };

const pc = (id: string, x = 0, y = 0) =>
  createCharacter({ id, name: id, controllerId: 'player:1', factionId: 'party', position: { x, y }, spriteId: 'hero', classId: 'fighter', raceId: 'human', level: 3, abilities: { ...ABILITIES } });

function game(entities: Entity[]): GameState {
  const state = engine.newGame({ seed: 1, map: asciiMap(['........', '........']), entities });
  return engine.applyEffects(state, [{ type: 'giveItem', owner: 'party', item: 'espada_mas1', count: 1 }, { type: 'giveItem', owner: 'party', item: 'anillo_proteccion', count: 2 }, { type: 'giveItem', owner: 'party', item: 'potion_curacion', count: 1 }]).state;
}

function run(state: GameState, cmd: BaseCommand) {
  return engine.apply(state, cmd);
}

describe('equipItem', () => {
  it('equips a +1 weapon: attack and damage both go up by 1', () => {
    const s = game([pc('garran')]);
    const before = equippedWeaponBonus(s.entities.garran!, 'longsword');
    expect(before).toEqual({ attack: 0, damage: 0 });
    const r = run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'garran', item: 'espada_mas1' } as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(equippedWeaponBonus(r.state.entities.garran!, 'longsword')).toEqual({ attack: 1, damage: 1 });
  });

  it('a ring of protection raises AC and every saving throw by 1', () => {
    const s = game([pc('garran')]);
    const acBefore = armorClass(s.entities.garran!);
    const saveBefore = saveBonus(s.entities.garran!, 'con');
    const r = run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'garran', item: 'anillo_proteccion' } as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(armorClass(r.state.entities.garran!)).toBe(acBefore + 1);
    expect(saveBonus(r.state.entities.garran!, 'con')).toBe(saveBefore + 1);
  });

  it('a cloak and a ring stack (different slots), both equipped at once', () => {
    let s = game([pc('garran')]);
    const saveBefore = saveBonus(s.entities.garran!, 'con');
    s = engine.applyEffects(s, [{ type: 'giveItem', owner: 'party', item: 'capa_proteccion', count: 1 }]).state;
    s = (run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'garran', item: 'anillo_proteccion' } as never) as { state: GameState }).state;
    s = (run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'garran', item: 'capa_proteccion' } as never) as { state: GameState }).state;
    // +1 save each, from two different slots - they stack, they don't cancel each other out.
    expect(saveBonus(s.entities.garran!, 'con')).toBe(saveBefore + 2);
    expect(dnd5e.equippedItems!(s.entities.garran!)).toEqual(expect.arrayContaining(['anillo_proteccion', 'capa_proteccion']));
  });

  it('the same item can never end up equipped on two party members at once', () => {
    let s = game([pc('garran'), pc('dorotea', 1, 0)]);
    s = (run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'garran', item: 'espada_mas1' } as never) as { state: GameState }).state;
    const r = run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'dorotea', item: 'espada_mas1' } as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(dnd5e.equippedItems!(r.state.entities.garran!)).not.toContain('espada_mas1');
    expect(dnd5e.equippedItems!(r.state.entities.dorotea!)).toContain('espada_mas1');
  });

  it('refuses to equip an item the party does not have', () => {
    const s = game([pc('garran')]);
    const r = run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'garran', item: 'armadura_mas1' } as never);
    expect(r.ok).toBe(false);
  });

  it('refuses to equip a consumable (nothing with a slot)', () => {
    const s = game([pc('garran')]);
    const r = run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'garran', item: 'potion_curacion' } as never);
    expect(r.ok).toBe(false);
  });
});

describe('useItem (potions outside combat)', () => {
  it('drinks a potion and heals, outside combat', () => {
    let s = game([pc('garran')]);
    s = engine.applyEffects(s, [{ type: 'modifyResource', entityId: 'garran', resource: 'hp', delta: -10 }]).state;
    const before = s.entities.garran!.resources.hp!.current;
    const r = run(s, { type: 'useItem', issuer: 'player:1', entityId: 'garran', item: 'potion_curacion' } as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.entities.garran!.resources.hp!.current).toBeGreaterThan(before);
  });

  it('refuses to drink a potion mid-combat (use the action-bar item there instead)', () => {
    let s = game([pc('garran'), createMonster({ id: 'rat', monsterId: 'giant_rat', controllerId: 'ai', factionId: 'foes', position: { x: 5, y: 0 }, spriteId: 'rat' })]);
    const started = run(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['garran', 'rat'] } as never);
    if (!started.ok) throw new Error(started.error.code);
    s = started.state;
    const r = run(s, { type: 'useItem', issuer: 'player:1', entityId: 'garran', item: 'potion_curacion' } as never);
    expect(r.ok).toBe(false);
  });
});

describe('rulesets/dnd5e Ruleset.itemSlot / equippedInSlot', () => {
  it('reports slots for gear and nothing for consumables', () => {
    expect(dnd5e.itemSlot!('espada_mas1')).toBe('weapon');
    expect(dnd5e.itemSlot!('anillo_proteccion')).toBe('ring');
    expect(dnd5e.itemSlot!('potion_curacion')).toBeUndefined();
    expect(dnd5e.itemSlot!('coronas')).toBeUndefined();
  });

  it('equippedInSlot finds what a character has equipped in a slot', () => {
    let s = game([pc('garran')]);
    s = (run(s, { type: 'equipItem', issuer: 'player:1', entityId: 'garran', item: 'anillo_proteccion' } as never) as { state: GameState }).state;
    expect(dnd5e.equippedInSlot!(s.entities.garran!, 'ring')).toBe('anillo_proteccion');
    expect(dnd5e.equippedInSlot!(s.entities.garran!, 'weapon')).toBeUndefined();
  });
});

// Sanity check that every item id the drop tables can roll resolves to a known mechanical
// item (rulesets/dnd5e/data/magic-items.json) - a typo here would silently drop nothing.
describe('content integrity', () => {
  it('every lootable item id used by rollLoot exists in ITEMS, or is plain currency ("coronas")', () => {
    const tables = (lootJson as unknown as { tables: Record<string, { item?: string }[]> }).tables;
    for (const table of Object.values(tables)) {
      for (const entry of table) {
        if (entry.item && entry.item !== 'coronas') expect(ITEMS[entry.item], `loot.json references unknown item "${entry.item}"`).toBeDefined();
      }
    }
  });

  it('rollLoot never throws for every monster id in MONSTERS', () => {
    // Smoke test across the whole bestiary (not just the golden path roster), so a new
    // monster id never silently breaks loot rolling.
    const corpses = Object.keys(MONSTERS).map((id, i) => createMonster({ id: `x${i}`, monsterId: id, controllerId: 'ai', factionId: 'foes', position: { x: 0, y: 0 }, spriteId: 'none' }));
    expect(() => rollLoot({ seed: 1 } as GameState, corpses)).not.toThrow();
  });
});
