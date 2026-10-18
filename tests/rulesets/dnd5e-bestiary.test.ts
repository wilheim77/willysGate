import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, type RngCursor, SYSTEM_ISSUER, applyEffects, createEngine, hasCondition, nextAiCommand } from '../../engine';
import { MONSTERS, SPELLS, WEAPONS, armorClass, createCharacter, createMonster, dnd5e } from '../../rulesets/dnd5e';
import { MONSTER_ACTIONS } from '../../rulesets/dnd5e/data';
import { asciiMap } from '../fixtures/helpers';

const engine = createEngine(dnd5e, 'test');
const ABILITIES = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };

const pc = (id: string, x: number, y: number, extra: Partial<Parameters<typeof createCharacter>[0]> = {}) =>
  createCharacter({ id, name: id, controllerId: 'player:1', factionId: 'party', position: { x, y }, spriteId: 'hero', classId: 'fighter', raceId: 'human', level: 3, abilities: { ...ABILITIES }, ...extra });
const monster = (id: string, monsterId: string, x: number, y: number) =>
  createMonster({ id, monsterId, controllerId: 'ai', factionId: 'foes', position: { x, y }, spriteId: monsterId });

/** A frail wizard: AC 12, 11 hit points, no CON or STR save proficiency. */
const WIZARD = { classId: 'wizard', abilities: { str: 3, dex: 14, con: 8, int: 16, wis: 10, cha: 8 } };

const ROWS = ['............', '............', '............', '............', '............', '............'];

function game(entities: Entity[], seed = 42, rows = ROWS): GameState {
  return engine.newGame({ seed, map: asciiMap(rows), entities });
}

function run(state: GameState, cmd: BaseCommand) {
  const r = engine.apply(state, cmd);
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.error.code} ${r.error.message}`);
  return r;
}

function fight(state: GameState, first: string): GameState {
  const started = run(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: Object.keys(state.entities) } as never).state;
  const order = [first, ...started.turn.order.filter((id) => id !== first)];
  return { ...started, turn: { ...started.turn, order, activeEntityId: first, movementUsed: 0 } };
}

const act = (state: GameState, entityId: string, actionId: string, target: object) => run(state, { type: 'act', issuer: 'ai', entityId, actionId, target } as never);

/** A die that always rolls `n` (clamped to the die). */
const fixedRng = (n: number) => ({ die: (sides: number) => Math.min(n, sides) }) as unknown as RngCursor;

function withHp(e: Entity, hp: number): Entity {
  return { ...e, resources: { ...e.resources, hp: { ...e.resources.hp!, current: hp } } };
}

describe('bestiary data', () => {
  it('every stat block builds, and its weapons, spells and powers exist', () => {
    for (const id of Object.keys(MONSTERS)) {
      const m = MONSTERS[id]!;
      expect(() => monster('x', id, 0, 0), id).not.toThrow();
      for (const w of m.weapons) expect(WEAPONS[w], `${id}: weapon ${w}`).toBeDefined();
      for (const s of m.spellcasting?.spells ?? []) expect(SPELLS[s], `${id}: spell ${s}`).toBeDefined();
      for (const s of Object.keys(m.spellcasting?.innate ?? {})) expect(SPELLS[s], `${id}: innate ${s}`).toBeDefined();
      for (const a of m.actions ?? []) expect(MONSTER_ACTIONS[a], `${id}: action ${a}`).toBeDefined();
      for (const w of Object.keys(m.riders ?? {})) expect(m.weapons, `${id}: rider on ${w}`).toContain(w);
      for (const [w, seq] of Object.entries(m.combos ?? {})) {
        expect(m.weapons, `${id}: combo ${w}`).toContain(w);
        for (const x of seq) expect(m.weapons, `${id}: combo part ${x}`).toContain(x);
      }
      expect(m.xp, `${id}: xp`).toBeGreaterThan(0);
    }
  });

  it('casters get slots, a casting ability and the SRD spell DC', () => {
    const fanatic = monster('f', 'cult_fanatic', 0, 0);
    expect(fanatic.resources.spell_slot_1?.max).toBe(4);
    expect(fanatic.resources.spell_slot_2?.max).toBe(3);
    expect(fanatic.tags).toEqual(expect.arrayContaining(['casting:wis', 'spell:hold_person', 'spell:sacred_flame']));
    const preview = dnd5e.previewAction(game([fanatic, pc('hero', 3, 0)]), 'f', 'spell:hold_person', { entityId: 'hero' });
    expect(preview.breakdown?.[0]?.label).toContain('CD 11'); // SRD: spell save DC 11
    // The mage starts with Mage Armor up: AC 15.
    const mage = monster('m', 'mage', 0, 0);
    expect(armorClass(mage)).toBe(15);
  });
});

describe('special abilities', () => {
  it("a ghoul's claws paralyze on a failed save, but never an elf", () => {
    let paralyzed = 0;
    let elfParalyzed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const raceId of ['human', 'elf']) {
        const s = fight(game([monster('g', 'ghoul', 0, 0), pc('hero', 1, 0, { ...WIZARD, raceId })], seed), 'g');
        const after = act(s, 'g', 'attack:claws', { entityId: 'hero' }).state;
        if (hasCondition(after.entities.hero!, 'paralyzed')) {
          if (raceId === 'elf') elfParalyzed++;
          else paralyzed++;
        }
      }
    }
    expect(paralyzed).toBeGreaterThan(5);
    expect(elfParalyzed).toBe(0);
  });

  it('a paralyzed hero loses its turn and the ghoul AI goes for the claws', () => {
    const s = fight(game([monster('g', 'ghoul', 0, 0), pc('hero', 1, 0, WIZARD)]), 'g');
    const cmd = nextAiCommand(dnd5e, s, 'g') as BaseCommand & { actionId?: string };
    expect(cmd.actionId).toBe('attack:claws');
    const held = { ...s, entities: { ...s.entities, hero: { ...s.entities.hero!, conditions: [{ id: 'paralyzed', remainingTurns: 1 }] } } };
    expect(dnd5e.canAct(held.entities.hero!)).toBe(false);
  });

  it("a wolf's bite knocks a target prone on a failed save", () => {
    let prone = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = fight(game([monster('w', 'wolf', 0, 0), pc('hero', 1, 0, WIZARD)], seed), 'w');
      if (hasCondition(act(s, 'w', 'attack:wolf_bite', { entityId: 'hero' }).state.entities.hero!, 'prone')) prone++;
    }
    expect(prone).toBeGreaterThan(5);
  });

  it("a wight's life drain lowers the hit point maximum until the fight ends", () => {
    let drainedOnce = false;
    for (let seed = 1; seed <= 40 && !drainedOnce; seed++) {
      const hero = pc('hero', 1, 0, WIZARD);
      let s = fight(game([monster('w', 'wight', 0, 0), hero], seed), 'w');
      const maxBefore = s.entities.hero!.resources.hp!.max;
      s = act(s, 'w', 'attack:life_drain', { entityId: 'hero' }).state;
      const hp = s.entities.hero!.resources.hp!;
      const drained = s.entities.hero!.resources.drained?.max ?? 0;
      if (drained === 0) continue;
      drainedOnce = true;
      expect(hp.max).toBe(maxBefore - drained);
      expect(hp.current).toBeLessThanOrEqual(hp.max);
      // Fight over: the maximum comes back, the wounds stay.
      const restored = applyEffects(dnd5e, s, dnd5e.onCombatEnd!(s, 'party').effects).state;
      expect(restored.entities.hero!.resources.hp!.max).toBe(maxBefore);
      expect(restored.entities.hero!.resources.hp!.current).toBe(hp.current);
    }
    expect(drainedOnce).toBe(true);
  });

  it('a giant spider webs a hero it cannot reach to bite, once, and the web only comes back on a 5-6', () => {
    const wide = ['................', '................'];
    let s = fight(game([monster('sp', 'giant_spider', 0, 0), pc('hero', 11, 0)], 42, wide), 'sp');
    // Too far to bite this turn: it closes in and webs.
    for (let i = 0; i < 3; i++) {
      const cmd = nextAiCommand(dnd5e, s, 'sp') as BaseCommand & { actionId?: string };
      if (cmd.type !== 'move') {
        expect(cmd.actionId).toBe('ability:web');
        break;
      }
      s = run(s, cmd).state;
    }
    s = fight(game([monster('sp', 'giant_spider', 0, 0), pc('hero', 4, 0)]), 'sp');
    s = act(s, 'sp', 'ability:web', { entityId: 'hero' }).state;
    expect(s.entities.sp!.resources.use_web!.current).toBe(0);
    // Spent: not affordable, so the AI won't pick it.
    const affordable = dnd5e.listActions(s, 'sp').filter((a) => Object.entries(a.cost).every(([r, n]) => (s.entities.sp!.resources[r]?.current ?? 0) >= n));
    expect(affordable.map((a) => a.id)).not.toContain('ability:web');
    const low = dnd5e.onTurnStart!(s, 'sp', fixedRng(4));
    expect(low.effects.some((e) => (e as { resource?: string }).resource === 'use_web')).toBe(false);
    const high = dnd5e.onTurnStart!(s, 'sp', fixedRng(5));
    expect(high.effects.some((e) => (e as { resource?: string }).resource === 'use_web')).toBe(true);
  });

  it('a web that hits restrains: no movement, and attacks against it have advantage', () => {
    let restrained = false;
    for (let seed = 1; seed <= 20 && !restrained; seed++) {
      const s = act(fight(game([monster('sp', 'giant_spider', 0, 0), pc('hero', 4, 0, WIZARD)], seed), 'sp'), 'sp', 'ability:web', { entityId: 'hero' }).state;
      if (!hasCondition(s.entities.hero!, 'restrained')) continue;
      restrained = true;
      expect(s.entities.hero!.resources.hp!.current).toBe(s.entities.hero!.resources.hp!.max); // a web does no damage
      expect(dnd5e.movementBudget(s.entities.hero!, s)).toBe(0);
    }
    expect(restrained).toBe(true);
  });

  it('parry turns a melee hit that only just lands into a miss', () => {
    let parried = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = fight(game([pc('hero', 0, 0), monster('k', 'knight', 1, 0)], seed), 'hero');
      const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'hero', actionId: 'attack:longsword', target: { entityId: 'k' } } as never);
      if (r.ok && r.events.some((e) => e.type === 'reactionUsed' && (e as { detail?: string }).detail === 'Parada')) parried++;
    }
    expect(parried).toBeGreaterThan(0);
  });
});

describe('monster AI', () => {
  it('a cult fanatic casts at a hero instead of just stabbing', () => {
    const s = fight(game([monster('f', 'cult_fanatic', 0, 0), pc('hero', 5, 0)]), 'f');
    const cmd = nextAiCommand(dnd5e, s, 'f') as BaseCommand & { actionId?: string };
    expect(cmd.type).toBe('act');
    expect(cmd.actionId).toMatch(/^spell:/);
  });

  it('an acolyte heals a badly wounded ally', () => {
    const ally = withHp(monster('b', 'bandit', 1, 0), 2);
    const s = fight(game([monster('a', 'acolyte', 0, 0), ally, pc('hero', 8, 0)]), 'a');
    const cmd = nextAiCommand(dnd5e, s, 'a') as BaseCommand & { actionId?: string; target?: { entityId?: string } };
    expect(cmd.actionId).toBe('spell:cure_wounds');
    expect(cmd.target?.entityId).toBe('b');
  });

  it('a knight rallies its men with Leadership, once', () => {
    let s = fight(game([monster('k', 'knight', 0, 0), monster('v1', 'veteran', 1, 1), monster('v2', 'veteran', 0, 1), pc('hero', 9, 0)]), 'k');
    const cmd = nextAiCommand(dnd5e, s, 'k') as BaseCommand & { actionId?: string };
    expect(cmd.actionId).toBe('ability:leadership');
    s = act(s, 'k', 'ability:leadership', {}).state;
    expect(hasCondition(s.entities.v1!, 'blessed')).toBe(true);
    expect(hasCondition(s.entities.hero!, 'blessed')).toBe(false);
    expect(s.entities.k!.resources.use_leadership!.current).toBe(0);
  });

  it("doesn't waste a recharge bomb on one enemy, but throws it into a crowd", () => {
    const lone = fight(game([monster('b', 'foreman', 0, 0), pc('hero', 1, 0)]), 'b');
    expect((nextAiCommand(dnd5e, lone, 'b') as BaseCommand & { actionId?: string }).actionId).not.toBe('ability:powder_bomb');
    const crowd = fight(game([monster('b', 'foreman', 0, 0), pc('h1', 6, 2), pc('h2', 6, 3), pc('h3', 7, 2), pc('h4', 7, 3)]), 'b');
    expect((nextAiCommand(dnd5e, crowd, 'b') as BaseCommand & { actionId?: string }).actionId).toBe('ability:powder_bomb');
  });

  it('a mage that has already acted backs away to its preferred distance', () => {
    const s = fight(game([monster('m', 'mage', 3, 2), pc('hero', 1, 2)]), 'm');
    const spent = { ...s, entities: { ...s.entities, m: { ...s.entities.m!, resources: { ...s.entities.m!.resources, action: { current: 0, max: 1 }, bonus_action: { current: 0, max: 1 } } } } };
    const cmd = nextAiCommand(dnd5e, spent, 'm') as BaseCommand & { to?: { x: number; y: number } };
    expect(cmd.type).toBe('move');
    expect(Math.max(Math.abs(cmd.to!.x - 1), Math.abs(cmd.to!.y - 2))).toBeGreaterThanOrEqual(5);
  });

  it('a ghast stinks: heroes starting their turn next to it may be poisoned', () => {
    const s = fight(game([monster('g', 'ghast', 0, 0), pc('hero', 1, 0)]), 'g');
    const out = dnd5e.onTurnStart!(s, 'hero', fixedRng(1));
    expect(out.effects.some((e) => (e as { condition?: string }).condition === 'poisoned')).toBe(true);
    const far = fight(game([monster('g', 'ghast', 0, 0), pc('hero', 3, 0)]), 'g');
    expect(dnd5e.onTurnStart!(far, 'hero', fixedRng(1)).effects.length).toBe(0);
  });
});
