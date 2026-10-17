import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, SYSTEM_ISSUER, createEngine, hasCondition, isEvent, nextAiCommand } from '../../engine';
import { armorClass, createCharacter, createMonster, dnd5e } from '../../rulesets/dnd5e';
import { chanceToHit } from '../../rulesets/dnd5e/resolve';
import { asciiMap } from '../fixtures/helpers';

const engine = createEngine(dnd5e, 'test');
const ABILITIES = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };

const pc = (id: string, classId: string, level: number, x: number, y: number, extra: Partial<Parameters<typeof createCharacter>[0]> = {}) =>
  createCharacter({ id, name: id, controllerId: 'player:1', factionId: 'party', position: { x, y }, spriteId: 'hero', classId, raceId: 'human', level, abilities: { ...ABILITIES }, ...extra });
const monster = (id: string, monsterId: string, x: number, y: number) =>
  createMonster({ id, monsterId, controllerId: 'ai', factionId: 'sinpaga', position: { x, y }, spriteId: monsterId });

function game(entities: Entity[], rows = ['........', '........', '........', '........']): GameState {
  return engine.newGame({ seed: 42, map: asciiMap(rows), entities });
}

function run(state: GameState, cmd: BaseCommand) {
  const r = engine.apply(state, cmd);
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.error.code} ${r.error.message}`);
  return r;
}

/** Puts `id` first in the turn order regardless of initiative, for focused tests. */
function fight(state: GameState, first: string): GameState {
  const started = run(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: Object.keys(state.entities) } as never).state;
  const order = [first, ...started.turn.order.filter((id) => id !== first)];
  return { ...started, turn: { ...started.turn, order, activeEntityId: first, movementUsed: 0 } };
}

const act = (state: GameState, entityId: string, actionId: string, target: object, issuer = 'player:1') =>
  run(state, { type: 'act', issuer, entityId, actionId, target } as never);

describe('character creation (levels 1-6)', () => {
  it('builds a level 3 champion fighter from class data', () => {
    const f = pc('garran', 'fighter', 3, 0, 0);
    expect(f.stats.ac).toBe(16 + 2 + 1); // chain mail + shield + Defense style
    // CON 14 + 1 (human) = 15 → +2: 10 + 2 at level 1, then 6 + 2 per level.
    expect(f.resources.hp).toEqual({ current: 28, max: 28 });
    expect(f.tags).toEqual(expect.arrayContaining(['subclass:champion', 'feature:improved_critical', 'feature:action_surge', 'weapon:longsword']));
    expect(f.resources.second_wind).toEqual({ current: 1, max: 1 });
  });

  it('gives full casters the SRD slot table and level-gated spells', () => {
    const w3 = pc('w3', 'wizard', 3, 0, 0);
    const w5 = pc('w5', 'wizard', 5, 0, 0);
    expect([w3.resources.spell_slot_1?.max, w3.resources.spell_slot_2?.max, w3.resources.spell_slot_3]).toEqual([4, 2, undefined]);
    expect([w5.resources.spell_slot_1?.max, w5.resources.spell_slot_2?.max, w5.resources.spell_slot_3?.max]).toEqual([4, 3, 2]);
    expect(w3.tags).toContain('spell:misty_step');
    expect(w3.tags).not.toContain('spell:fireball');
    expect(w5.tags).toContain('spell:fireball');
  });

  it('applies racial traits', () => {
    const dwarf = pc('d', 'cleric', 3, 0, 0, { raceId: 'dwarf' });
    expect(dwarf.stats.speed).toBe(5);
    expect(dwarf.tags).toContain('resist:poison');
    const orc = pc('o', 'fighter', 3, 0, 0, { raceId: 'half_orc' });
    expect(orc.resources.relentless).toEqual({ current: 1, max: 1 });
  });

  it('extra attack, sneak attack dice and features appear at the right levels', () => {
    expect(pc('f4', 'fighter', 4, 0, 0).tags).not.toContain('feature:extra_attack');
    expect(pc('f5', 'fighter', 5, 0, 0).tags).toContain('feature:extra_attack');
    expect(pc('r5', 'rogue', 5, 0, 0).tags).toContain('feature:uncanny_dodge');
    expect(pc('c6', 'cleric', 6, 0, 0).resources.channel_divinity?.max).toBe(2);
  });
});

describe('attack maths', () => {
  it('computes exact hit chances with advantage and disadvantage', () => {
    expect(chanceToHit(5, 15, 'normal').hit).toBeCloseTo(0.55);
    expect(chanceToHit(5, 15, 'advantage').hit).toBeCloseTo(1 - 0.45 ** 2);
    expect(chanceToHit(5, 15, 'disadvantage').hit).toBeCloseTo(0.55 ** 2);
    // A natural 20 always hits; a natural 1 always misses.
    expect(chanceToHit(0, 30, 'normal').hit).toBeCloseTo(0.05);
    expect(chanceToHit(30, 5, 'normal').hit).toBeCloseTo(0.95);
    expect(chanceToHit(5, 15, 'normal', 19).crit).toBeCloseTo(0.1);
  });

  it('previews hit chance, expected damage and a glossary-linked breakdown', () => {
    const s = game([pc('garran', 'fighter', 3, 0, 0), monster('b', 'bandit', 1, 0)]);
    const p = dnd5e.previewAction(s, 'garran', 'attack:longsword', { entityId: 'b' });
    expect(p.valid).toBe(true);
    // +3 STR +2 prof vs AC 12: needs 7 → 70 %.
    expect(p.chance).toBeCloseTo(0.7);
    expect(p.breakdown?.map((b) => b.term)).toEqual(expect.arrayContaining(['hit_chance', 'attack_bonus', 'ac']));
  });

  it('grants advantage from higher ground', () => {
    const s = game([pc('dorotea', 'rogue', 3, 0, 0), monster('b', 'bandit', 1, 0)], ['1.......']);
    const p = dnd5e.previewAction(s, 'dorotea', 'attack:shortsword', { entityId: 'b' });
    expect(p.breakdown).toContainEqual(expect.objectContaining({ term: 'advantage', value: expect.stringContaining('desde arriba') }));
  });
});

describe('combat resolution', () => {
  it('resolves an attack into an attack roll, damage and death for monsters', () => {
    let s = fight(game([pc('garran', 'fighter', 5, 0, 0), monster('b', 'bandit', 1, 0)]), 'garran');
    s = { ...s, entities: { ...s.entities, b: { ...s.entities.b!, resources: { ...s.entities.b!.resources, hp: { current: 1, max: 11 } } } } };
    let r = act(s, 'garran', 'attack:longsword', { entityId: 'b' });
    // Extra Attack: up to two swings until the bandit drops.
    for (let tries = 0; tries < 10 && !hasCondition(r.state.entities.b!, 'dead'); tries++) {
      s = { ...s, rng: { ...s.rng, a: (s.rng.a + 1) >>> 0 } };
      r = act(s, 'garran', 'attack:longsword', { entityId: 'b' });
    }
    expect(r.events.some((e) => isEvent(e, 'attackRolled'))).toBe(true);
    expect(hasCondition(r.state.entities.b!, 'dead')).toBe(true);
    expect(r.state.turn.mode).toBe('exploration');
  });

  it('bleeds downed player characters out over 3 of their turns', () => {
    let s = fight(game([pc('anselmo', 'cleric', 3, 0, 0), pc('garran', 'fighter', 3, 1, 0), monster('b', 'bandit', 7, 3)]), 'garran');
    s = engine.applyEffects(s, [{ type: 'modifyResource', entityId: 'anselmo', resource: 'hp', delta: -999 }]).state;
    const hit = engine.applyEffects(s, [
      { type: 'applyCondition', entityId: 'anselmo', condition: 'downed' },
      { type: 'modifyResource', entityId: 'anselmo', resource: 'bleed', delta: 3 },
    ]).state;
    expect(dnd5e.isStanding(hit.entities.anselmo!)).toBe(false);
    // Nobody helps: let the turns roll.
    let t = hit;
    for (let i = 0; i < 9 && !hasCondition(t.entities.anselmo!, 'dead'); i++) {
      t = run(t, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: t.turn.activeEntityId! } as never).state;
    }
    expect(hasCondition(t.entities.anselmo!, 'dead')).toBe(true);
  });

  it('heals a downed ally back on their feet', () => {
    let s = fight(game([pc('anselmo', 'cleric', 3, 0, 0), pc('garran', 'fighter', 3, 1, 0), monster('b', 'bandit', 7, 3)]), 'anselmo');
    s = engine.applyEffects(s, [
      { type: 'modifyResource', entityId: 'garran', resource: 'hp', delta: -999 },
      { type: 'applyCondition', entityId: 'garran', condition: 'downed' },
      { type: 'modifyResource', entityId: 'garran', resource: 'bleed', delta: 3 },
    ]).state;
    const r = act(s, 'anselmo', 'spell:healing_word', { entityId: 'garran' });
    expect(hasCondition(r.state.entities.garran!, 'downed')).toBe(false);
    expect(r.state.entities.garran!.resources.hp!.current).toBeGreaterThan(0);
    expect(r.state.entities.anselmo!.resources.spell_slot_1!.current).toBe(3);
    expect(r.state.entities.anselmo!.resources.bonus_action!.current).toBe(0);
  });

  it('provokes an opportunity attack when leaving reach, unless disengaging', () => {
    let s = fight(game([pc('dorotea', 'rogue', 3, 0, 0), monster('b', 'bandit', 1, 0)]), 'dorotea');
    const fled = run(s, { type: 'move', issuer: 'player:1', entityId: 'dorotea', to: { x: 0, y: 3 } } as never);
    expect(fled.events).toContainEqual(expect.objectContaining({ type: 'reactionUsed', entityId: 'b', detail: 'Ataque de oportunidad' }));
    s = act(s, 'dorotea', 'feature:disengage', {}).state;
    const safe = run(s, { type: 'move', issuer: 'player:1', entityId: 'dorotea', to: { x: 0, y: 3 } } as never);
    expect(safe.events.some((e) => e.type === 'reactionUsed')).toBe(false);
  });

  it('fireball hits everyone in the sphere; an evoker spares allies', () => {
    const entities = [pc('mage', 'wizard', 5, 0, 0), pc('garran', 'fighter', 5, 5, 1), monster('b1', 'bandit', 5, 2), monster('b2', 'bandit', 6, 2), monster('far', 'bandit', 0, 3)];
    const s = fight(game(entities, ['........', '........', '........', '........']), 'mage');
    const r = act(s, 'mage', 'spell:fireball', { tile: { x: 5, y: 2 } });
    const saves = r.events.filter((e) => isEvent(e, 'saveRolled')).map((e) => (e as never as { entityId: string }).entityId);
    expect(saves.sort()).toEqual(['b1', 'b2']);
    expect(r.state.entities.garran!.resources.hp!.current).toBe(r.state.entities.garran!.resources.hp!.max);
    expect(r.state.entities.mage!.resources.spell_slot_3!.current).toBe(1);
  });

  it('shield turns a hit into a miss when it would make the difference', () => {
    const mage = pc('mage', 'wizard', 3, 0, 0);
    expect(armorClass(mage)).toBe(12);
    let s = fight(game([mage, monster('o', 'orc', 1, 0)]), 'o');
    let shielded = false;
    for (let i = 0; i < 20 && !shielded; i++) {
      const r = act({ ...s, rng: { ...s.rng, a: (s.rng.a + i) >>> 0 } }, 'o', 'attack:greataxe', { entityId: 'mage' }, 'ai');
      shielded = r.events.some((e) => e.type === 'reactionUsed' && (e as never as { detail: string }).detail === 'Escudo');
      if (shielded) {
        expect(r.state.entities.mage!.resources.spell_slot_1!.current).toBe(3);
        expect(r.events.find((e) => isEvent(e, 'attackRolled'))).toMatchObject({ hit: false });
      }
    }
    expect(shielded).toBe(true);
  });

  it('after a won fight, downed allies get up with 1 hit point', () => {
    let s = fight(game([pc('anselmo', 'cleric', 3, 0, 0), pc('garran', 'fighter', 5, 1, 0), monster('b', 'bandit', 2, 0)]), 'garran');
    s = engine.applyEffects(s, [
      { type: 'modifyResource', entityId: 'anselmo', resource: 'hp', delta: -999 },
      { type: 'applyCondition', entityId: 'anselmo', condition: 'downed' },
      { type: 'modifyResource', entityId: 'b', resource: 'hp', delta: -10 },
    ]).state;
    let r = act(s, 'garran', 'attack:longsword', { entityId: 'b' });
    for (let i = 1; i < 20 && r.state.turn.mode === 'combat'; i++) r = act({ ...s, rng: { ...s.rng, a: (s.rng.a + i) >>> 0 } }, 'garran', 'attack:longsword', { entityId: 'b' });
    expect(r.state.turn.mode).toBe('exploration');
    expect(r.state.entities.anselmo!.resources.hp!.current).toBe(1);
    expect(hasCondition(r.state.entities.anselmo!, 'downed')).toBe(false);
  });
});

describe('AI with 5e rules', () => {
  it('a bandit walks up to the weakest target and attacks', () => {
    const wizard = pc('mage', 'wizard', 3, 0, 0);
    const fighter = pc('garran', 'fighter', 3, 0, 3);
    let s = fight(game([wizard, fighter, monster('b', 'bandit', 4, 0)]), 'b');
    const first = nextAiCommand(dnd5e, s, 'b');
    expect(first.type).toBe('act'); // crossbow from where it stands
    s = run(s, first).state;
    const next = nextAiCommand(dnd5e, s, 'b');
    expect(['move', 'endTurn']).toContain(next.type);
  });
});

describe('multi-target spells', () => {
  it('Bless takes the allies the player picks (up to 3)', () => {
    const s = fight(game([pc('anselmo', 'cleric', 3, 0, 0), pc('garran', 'fighter', 3, 1, 0), pc('dorotea', 'rogue', 3, 2, 0), pc('mage', 'wizard', 3, 3, 0), monster('b', 'bandit', 4, 2)]), 'anselmo');
    const r = act(s, 'anselmo', 'spell:bless', { entityIds: ['garran', 'mage'] });
    const blessed = Object.values(r.state.entities).filter((e) => hasCondition(e, 'blessed')).map((e) => e.id).sort();
    expect(blessed).toEqual(['garran', 'mage']);
    expect(engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'anselmo', actionId: 'spell:bless', target: { entityIds: ['garran', 'mage', 'dorotea', 'anselmo'] } } as never)).toMatchObject({
      ok: false,
      error: { code: 'invalid_target' },
    });
    expect(engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'anselmo', actionId: 'spell:bless', target: { entityIds: ['garran', 'b'] } } as never)).toMatchObject({
      ok: false,
      error: { code: 'invalid_target' },
    });
  });

  it('Magic Missile spreads its three darts over the picked targets', () => {
    const s = fight(game([pc('mage', 'wizard', 3, 0, 0), monster('b1', 'thug', 4, 0), monster('b2', 'thug', 4, 2)]), 'mage');
    const r = act(s, 'mage', 'spell:magic_missile', { entityIds: ['b1', 'b2', 'b1'] });
    const hits = r.events.filter((e) => isEvent(e, 'damageDealt')).map((e) => (e as never as { targetId: string }).targetId);
    expect(hits.sort()).toEqual(['b1', 'b1', 'b2']);
  });

  it('a single picked target still gets every dart', () => {
    const s = fight(game([pc('mage', 'wizard', 3, 0, 0), monster('b1', 'thug', 4, 0)]), 'mage');
    const r = act(s, 'mage', 'spell:magic_missile', { entityId: 'b1' });
    expect(r.events.filter((e) => isEvent(e, 'damageDealt'))).toHaveLength(3);
  });

  it('Guidance adds 1d4 to ability checks', () => {
    let s = game([pc('anselmo', 'cleric', 3, 0, 0)]);
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'anselmo', condition: 'guided_check' }]).state;
    const { result } = engine.check(s, { actorId: 'anselmo', check: 'perception', target: 10 });
    expect(result.modifiers.map((m) => m.label)).toContain('Orientación divina');
  });
});
