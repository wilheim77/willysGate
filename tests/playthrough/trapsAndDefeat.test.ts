import { describe, expect, it } from 'vitest';
import {
  SYSTEM_ISSUER,
  hasCondition,
  nextAiCommand,
  withTraps,
  type BaseCommand,
  type GameState,
  type Trap,
} from '../../engine';
import { createCharacter, createMonster, dnd5e } from '../../rulesets/dnd5e';
import { asciiMap } from '../fixtures/helpers';
import { makeEngine } from './setup';

/**
 * Playtest-reported blind spot (per the coordinator): the old combat soaks drove every
 * fighter - including the player's own - purely through the AI, and papered over a refused
 * command with a SYSTEM endTurn. That hid "the player's fighter can't act on their own
 * turn" (a trap underfoot, an opportunity attack, their own area spell) from ever hanging
 * the *real* game, where the client waits for that player's input. Now that engine/
 * commands.ts's `passTurnIfHelpless` passes the turn automatically whenever the active
 * fighter goes down mid-turn (any command, not just endTurn), these soaks exercise it with
 * the real dnd5e ruleset and real entities: hidden traps on both sides' paths, and the
 * three defeat shapes the client's "Volver a intentarlo" retry depends on.
 */

const engine = makeEngine();

function party(): ReturnType<typeof createCharacter>[] {
  return [
    createCharacter({ id: 'hero', name: 'Cobrador', controllerId: 'player:1', factionId: 'party', position: { x: 1, y: 1 }, spriteId: 'hero', classId: 'wizard', raceId: 'human', level: 3, abilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } }),
    createCharacter({ id: 'garran', name: 'Garrán', controllerId: 'player:1', factionId: 'party', position: { x: 2, y: 1 }, spriteId: 'garran', classId: 'fighter', raceId: 'half_orc', level: 3, abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 } }),
  ];
}

function foes(): ReturnType<typeof createMonster>[] {
  return [
    createMonster({ id: 'bandit-1', name: 'Sinpaga', monsterId: 'bandit', controllerId: 'ai', factionId: 'sinpaga', position: { x: 10, y: 1 }, spriteId: 'bandit' }),
    createMonster({ id: 'bandit-2', name: 'Sinpaga', monsterId: 'bandit', controllerId: 'ai', factionId: 'sinpaga', position: { x: 10, y: 2 }, spriteId: 'bandit' }),
  ];
}

/** A lethal trap on tile (x, y): deals far more damage than any level-3 character's max HP. */
function lethalTrap(id: string, x: number, y: number): Trap {
  return { id, tiles: [{ x, y }], hidden: false, armed: true, params: { save: 'dex', dc: 20, damage: '20d6', type: 'piercing' } };
}

/** Runs every turn through nextAiCommand (both sides), exactly as a real fight would be
 *  driven, now that the engine passes a helpless fighter's turn automatically. Throws (a
 *  real test failure) if the fight doesn't end within the budget. */
function soakCombat(state: GameState, maxCommands = 400): GameState {
  let s = state;
  let guard = 0;
  while (s.turn.mode === 'combat' && guard++ < maxCommands) {
    const activeId = s.turn.activeEntityId;
    if (!activeId) throw new Error('in combat with no active entity');
    const cmd = nextAiCommand(dnd5e, s, activeId);
    const r = engine.apply(s, cmd);
    if (!r.ok) throw new Error(`AI command rejected for ${activeId}: ${JSON.stringify(r.error)}`);
    s = r.state;
  }
  if (s.turn.mode === 'combat') throw new Error(`fight did not end within ${maxCommands} commands (round ${s.turn.round})`);
  return s;
}

describe('combat soak with hidden traps on the way', () => {
  const SEEDS = [1, 2, 3, 4, 5];

  for (const seed of SEEDS) {
    it(`a trap between the party and the enemies never hangs the fight (seed ${seed})`, () => {
      const map = asciiMap(Array.from({ length: 4 }, () => '.'.repeat(13)));
      let state = engine.newGame({ seed, map, entities: [...party(), ...foes()] });
      // One trap roughly on the party's approach, one on the enemies' - either side can
      // trigger a mid-own-turn KO.
      state = withTraps(state, [lethalTrap('party-side', 4, 1), lethalTrap('foe-side', 7, 2)]);
      const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['hero', 'garran', 'bandit-1', 'bandit-2'] } as BaseCommand & {
        participants: string[];
      });
      expect(started.ok, started.ok ? '' : JSON.stringify((started as { error: unknown }).error)).toBe(true);
      if (!started.ok) return;
      let result: GameState;
      expect(() => (result = soakCombat(started.state)), `seed ${seed}: the fight hung or a command was rejected`).not.toThrow();
      expect(result!.turn.mode).toBe('exploration');
    });
  }

  it('an opportunity attack that drops the mover mid-step still passes the turn on', () => {
    // Garrán (high HP fighter) baits a bandit adjacent, then a frail hero tries to walk
    // past within its reach - if the OA downs hero mid-move, hero's own turn must still
    // end on its own (passTurnIfHelpless), not hang waiting for a command hero can't send.
    const map = asciiMap(['.......']);
    let state = engine.newGame({
      seed: 7,
      map,
      entities: [
        createCharacter({ id: 'hero', name: 'Cobrador', controllerId: 'player:1', factionId: 'party', position: { x: 0, y: 0 }, spriteId: 'hero', classId: 'wizard', raceId: 'human', level: 1, abilities: { str: 8, dex: 10, con: 8, int: 15, wis: 10, cha: 10 } }),
        createMonster({ id: 'bandit-1', name: 'Sinpaga', monsterId: 'bandit_captain', controllerId: 'ai', factionId: 'sinpaga', position: { x: 1, y: 0 }, spriteId: 'bandit' }),
      ],
    });
    const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['hero', 'bandit-1'] } as BaseCommand & { participants: string[] });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    let result: GameState;
    expect(() => (result = soakCombat({ ...started.state, turn: { ...started.state.turn, activeEntityId: 'hero', order: ['hero', 'bandit-1'] } }, 50))).not.toThrow();
    expect(result!.turn.mode === 'combat' || result!.turn.mode === 'exploration').toBe(true);
  });
});

describe('defeat shapes the client\'s "Volver a intentarlo" retry depends on', () => {
  it('the whole party downed: combat ends, the enemy side wins, nobody on the party side can stand', () => {
    const map = asciiMap(['....']);
    const entities = [
      createCharacter({ id: 'hero', name: 'Cobrador', controllerId: 'player:1', factionId: 'party', position: { x: 0, y: 0 }, spriteId: 'hero', classId: 'wizard', raceId: 'human', level: 3, abilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } }),
      createCharacter({ id: 'garran', name: 'Garrán', controllerId: 'player:1', factionId: 'party', position: { x: 1, y: 0 }, spriteId: 'garran', classId: 'fighter', raceId: 'half_orc', level: 3, abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 } }),
      createMonster({ id: 'bandit-1', name: 'Sinpaga', monsterId: 'bandit', controllerId: 'ai', factionId: 'sinpaga', position: { x: 2, y: 0 }, spriteId: 'bandit' }),
    ];
    let state = engine.newGame({ seed: 1, map, entities });
    const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: entities.map((e) => e.id) } as BaseCommand & { participants: string[] });
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    state = started.state;
    // Both party members go down directly (0 HP each), independent of any one fight's dice.
    state = {
      ...state,
      entities: {
        ...state.entities,
        hero: { ...state.entities.hero!, resources: { ...state.entities.hero!.resources, hp: { current: 0, max: state.entities.hero!.resources.hp!.max } }, conditions: [{ id: 'downed' }] },
        garran: { ...state.entities.garran!, resources: { ...state.entities.garran!.resources, hp: { current: 0, max: state.entities.garran!.resources.hp!.max } }, conditions: [{ id: 'downed' }] },
      },
    };
    // Running the bandit's own turn (or any command) should notice nobody's left standing
    // on the party side and end combat in the bandit's favour.
    const active = { ...state, turn: { ...state.turn, activeEntityId: 'bandit-1' } };
    const r = engine.apply(active, nextAiCommand(dnd5e, active, 'bandit-1'));
    expect(r.ok, r.ok ? '' : JSON.stringify((r as { error: unknown }).error)).toBe(true);
    if (!r.ok) return;
    expect(r.state.turn.mode, 'combat should have ended with the whole party down').toBe('exploration');
    expect(dnd5e.isStanding(r.state.entities.hero!), 'hero should not be able to stand').toBe(false);
    expect(dnd5e.isStanding(r.state.entities.garran!), 'garran should not be able to stand').toBe(false);
  });

  it('the Cobrador dead (not just downed) while the companions win: he stays dead, not revived', () => {
    const map = asciiMap(['....']);
    const entities = [
      createCharacter({ id: 'hero', name: 'Cobrador', controllerId: 'player:1', factionId: 'party', position: { x: 0, y: 0 }, spriteId: 'hero', classId: 'wizard', raceId: 'human', level: 3, abilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } }),
      createCharacter({ id: 'garran', name: 'Garrán', controllerId: 'player:1', factionId: 'party', position: { x: 1, y: 0 }, spriteId: 'garran', classId: 'fighter', raceId: 'half_orc', level: 6, abilities: { str: 18, dex: 13, con: 16, int: 10, wis: 12, cha: 8 } }),
      createMonster({ id: 'bandit-1', name: 'Sinpaga', monsterId: 'bandit', controllerId: 'ai', factionId: 'sinpaga', position: { x: 2, y: 0 }, spriteId: 'bandit' }),
    ];
    let state = engine.newGame({ seed: 1, map, entities });
    const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: entities.map((e) => e.id) } as BaseCommand & { participants: string[] });
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    state = started.state;
    state = { ...state, entities: { ...state.entities, hero: { ...state.entities.hero!, conditions: [{ id: 'dead' }], resources: { ...state.entities.hero!.resources, hp: { current: 0, max: state.entities.hero!.resources.hp!.max } } } } };
    // Garrán alone finishes off the bandit: the party side still wins (hero's death
    // doesn't flip the faction's outcome), but hero himself must not come back.
    state = { ...state, entities: { ...state.entities, 'bandit-1': { ...state.entities['bandit-1']!, conditions: [{ id: 'dead' }], resources: { ...state.entities['bandit-1']!.resources, hp: { current: 0, max: state.entities['bandit-1']!.resources.hp!.max } } } } };
    const active = { ...state, turn: { ...state.turn, activeEntityId: 'garran' } };
    const r = engine.apply(active, nextAiCommand(dnd5e, active, 'garran'));
    expect(r.ok, r.ok ? '' : JSON.stringify((r as { error: unknown }).error)).toBe(true);
    if (!r.ok) return;
    expect(r.state.turn.mode).toBe('exploration');
    expect(hasCondition(r.state.entities.hero!, 'dead'), 'hero should still be dead').toBe(true);
    expect(dnd5e.isStanding(r.state.entities.hero!), 'a dead hero cannot stand').toBe(false);
  });

  it('the Cobrador downed (not dead) while the party wins: he must be able to stand afterwards', () => {
    const map = asciiMap(['....']);
    const entities = [
      createCharacter({ id: 'hero', name: 'Cobrador', controllerId: 'player:1', factionId: 'party', position: { x: 0, y: 0 }, spriteId: 'hero', classId: 'wizard', raceId: 'human', level: 3, abilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } }),
      createCharacter({ id: 'garran', name: 'Garrán', controllerId: 'player:1', factionId: 'party', position: { x: 1, y: 0 }, spriteId: 'garran', classId: 'fighter', raceId: 'half_orc', level: 6, abilities: { str: 18, dex: 13, con: 16, int: 10, wis: 12, cha: 8 } }),
      createMonster({ id: 'bandit-1', name: 'Sinpaga', monsterId: 'bandit', controllerId: 'ai', factionId: 'sinpaga', position: { x: 2, y: 0 }, spriteId: 'bandit' }),
    ];
    let state = engine.newGame({ seed: 1, map, entities });
    const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: entities.map((e) => e.id) } as BaseCommand & { participants: string[] });
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    state = started.state;
    state = { ...state, entities: { ...state.entities, hero: { ...state.entities.hero!, conditions: [{ id: 'downed' }], resources: { ...state.entities.hero!.resources, hp: { current: 0, max: state.entities.hero!.resources.hp!.max }, bleed: { current: 3, max: 3 } } } } };
    // Left at 1 HP, not pre-killed: the bandit has to actually go down through a real
    // combat command, so `checkCombatEnd` fires within THAT command (as it does in a real
    // fight) rather than leaving a stale "combat should already be over" state for an
    // intervening turn (e.g. hero's own bleed-out) to tick through first.
    state = { ...state, entities: { ...state.entities, 'bandit-1': { ...state.entities['bandit-1']!, resources: { ...state.entities['bandit-1']!.resources, hp: { current: 1, max: state.entities['bandit-1']!.resources.hp!.max } } } } };
    let s: GameState = { ...state, turn: { ...state.turn, activeEntityId: 'garran' } };
    let guard = 0;
    while (s.turn.mode === 'combat' && guard++ < 50) {
      const activeId = s.turn.activeEntityId!;
      const cmd = nextAiCommand(dnd5e, s, activeId);
      const r = engine.apply(s, cmd);
      expect(r.ok, r.ok ? '' : JSON.stringify((r as { error: unknown }).error)).toBe(true);
      if (!r.ok) return;
      s = r.state;
    }
    expect(s.turn.mode).toBe('exploration');
    // onCombatEnd's "winners' fallen get back up with 1 HP" fix: downed-not-dead on the
    // winning side must be able to stand once the fight is over (the client's precondition
    // for NOT offering "Volver a intentarlo").
    expect(hasCondition(s.entities.hero!, 'downed'), 'hero should no longer be downed').toBe(false);
    expect(dnd5e.isStanding(s.entities.hero!), 'hero must be able to stand after winning').toBe(true);
    expect(s.entities.hero!.resources.hp!.current, 'hero should be back up with at least 1 HP').toBeGreaterThan(0);
  });
});
