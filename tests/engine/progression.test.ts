import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, SYSTEM_ISSUER, createEngine, extendRuleset, levelForPoints, nextLevel, progressOf } from '../../engine';
import { asciiMap, deepFreeze, makeEntity } from '../fixtures/helpers';
import { toyRuleset } from '../fixtures/toyRuleset';

/**
 * Shared party progress, with the non-D&D toy ruleset: hunters have a "rank" that rises with
 * the party's points, and night creatures carry a bounty the winners share.
 */
const ruleset = extendRuleset(toyRuleset, {
  id: 'toy-ranks',
  progression: {
    label: 'Gloria',
    levelOf: (e) => (e.tags.includes('hunter') ? (e.stats.rank ?? 1) : null),
    levelUp: (_s, e, level) => ({ ...e, stats: { ...e.stats, rank: level } }),
    rewardFor: (e) => e.stats.bounty ?? 0,
  },
});
const progression = { thresholds: { 2: 100, 3: 250 } };
const engine = createEngine(ruleset, 'toy-ranks', { dialogues: {}, progression });

const pool = (n: number) => ({ current: n, max: n });
const being = (id: string, faction: string, x: number, extra: { controllerId?: string; tags?: string[]; stats?: Record<string, number> } = {}) =>
  makeEntity({
    id,
    factionId: faction,
    controllerId: extra.controllerId ?? (faction === 'hunters' ? 'player:1' : 'ai'),
    position: { x, y: 0 },
    stats: { will: id === 'van' ? 10 : 0, stride: 3, ...extra.stats },
    resources: { blood: pool(6), action: pool(1), reaction: pool(1) },
    tags: extra.tags ?? [],
  });

function setup(): GameState {
  return deepFreeze(
    engine.newGame({
      seed: 3,
      map: asciiMap(['..........']),
      entities: [
        being('van', 'hunters', 0, { tags: ['hunter'], stats: { rank: 1 } }),
        being('mina', 'hunters', 1, { tags: ['hunter'], stats: { rank: 1 } }),
        // A hunter nobody controls yet does not share the pool (until a player recruits her).
        being('lucy', 'hunters', 9, { controllerId: 'ai', tags: ['hunter'], stats: { rank: 1 } }),
        being('nos', 'night', 4, { stats: { bounty: 60 } }),
        being('ghoul', 'night', 5, { stats: { bounty: 50 } }),
      ],
    }),
  );
}

function run(state: GameState, cmd: object) {
  const r = engine.apply(state, cmd as BaseCommand);
  if (!r.ok) throw new Error(`${(cmd as BaseCommand).type} failed: ${r.error.code} ${r.error.message}`);
  return r;
}
const gain = (s: GameState, amount: number) => run(s, { type: 'script', issuer: SYSTEM_ISSUER, effects: [{ type: 'gainProgress', amount, reason: 'talk' }] });

describe('party progression', () => {
  it('thresholds: the level points reach, and the next one', () => {
    expect(levelForPoints(progression, 0)).toBe(0);
    expect(levelForPoints(progression, 100)).toBe(2);
    expect(levelForPoints(progression, 999)).toBe(3);
    expect(nextLevel(progression, 1)).toEqual({ level: 2, points: 100 });
    expect(nextLevel(progression, 3)).toBeNull();
  });

  it('gainProgress adds to one shared pool and says so', () => {
    const r = gain(setup(), 40);
    expect(progressOf(r.state)).toBe(40);
    expect(r.events).toContainEqual({ type: 'progressGained', amount: 40, total: 40, reason: 'talk' });
    expect(r.events.some((e) => e.type === 'leveledUp')).toBe(false);
  });

  it('an award with an id pays out once, however often the conversation is replayed', () => {
    const once = (s: GameState) => run(s, { type: 'script', issuer: SYSTEM_ISSUER, effects: [{ type: 'gainProgress', amount: 30, id: 'juicio' }] });
    const r = once(once(setup()).state);
    expect(progressOf(r.state)).toBe(30);
    expect(r.events.some((e) => e.type === 'progressGained')).toBe(false);
  });

  it('crossing a threshold raises every player-controlled member, in the same command', () => {
    const r = gain(setup(), 260);
    expect(r.state.entities.van!.stats.rank).toBe(3);
    expect(r.state.entities.mina!.stats.rank).toBe(3);
    expect(r.state.entities.lucy!.stats.rank).toBe(1);
    expect(r.state.entities.nos!.stats.rank).toBeUndefined();
    expect(r.events).toContainEqual({ type: 'leveledUp', level: 3, from: 1, entityIds: ['van', 'mina'] });
  });

  it('a member who joins later catches up on the next command', () => {
    const leveled = gain(setup(), 120).state;
    const r = run(leveled, { type: 'script', issuer: SYSTEM_ISSUER, effects: [{ type: 'setController', entityId: 'lucy', controllerId: 'player:1' }] });
    expect(r.state.entities.lucy!.stats.rank).toBe(2);
    expect(r.events).toContainEqual({ type: 'leveledUp', level: 2, from: 1, entityIds: ['lucy'] });
  });

  it('waits for a conversation to end before levelling', () => {
    const talking = { ...setup(), systems: { dialogue: { treeId: 'x', nodeId: 'y', actorId: 'van' } } } as unknown as GameState;
    const r = gain(talking, 150);
    expect(progressOf(r.state)).toBe(150);
    expect(r.state.entities.van!.stats.rank).toBe(1);
  });

  it('winning a fight shares the bounty of the foes brought down; losing gives nothing', () => {
    let s = run(setup(), { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['van', 'mina', 'nos', 'ghoul'] }).state;
    // The foes simply fall; the fight ends when the turn passes.
    s = run(s, { type: 'script', issuer: SYSTEM_ISSUER, effects: [{ type: 'modifyResource', entityId: 'nos', resource: 'blood', delta: -6 }, { type: 'modifyResource', entityId: 'ghoul', resource: 'blood', delta: -6 }] }).state;
    expect(progressOf(s)).toBe(0);
    const r = run(s, { type: 'endTurn', issuer: 'player:1', entityId: 'van' });
    expect(r.state.turn.mode).toBe('exploration');
    expect(progressOf(r.state)).toBe(110);
    expect(r.events).toContainEqual({ type: 'progressGained', amount: 110, total: 110, reason: 'combat' });
    expect(r.state.entities.van!.stats.rank).toBe(2);

    // Van falls on his own turn (the turn passes by itself) and the night wins.
    const lost = run(setup(), { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['van', 'mina', 'nos', 'ghoul'] }).state;
    const after = run(lost, { type: 'script', issuer: SYSTEM_ISSUER, effects: [{ type: 'modifyResource', entityId: 'nos', resource: 'blood', delta: -6 }, { type: 'modifyResource', entityId: 'van', resource: 'blood', delta: -6 }, { type: 'modifyResource', entityId: 'mina', resource: 'blood', delta: -6 }] });
    expect(after.state.turn.mode).toBe('exploration');
    expect(progressOf(after.state)).toBe(0);
  });

  it('without progression content, points are counted but nobody levels', () => {
    const bare = createEngine(ruleset, 'toy-ranks');
    const r = bare.apply(setup(), { type: 'script', issuer: SYSTEM_ISSUER, effects: [{ type: 'gainProgress', amount: 500 }] } as BaseCommand);
    expect(r.ok && progressOf(r.state)).toBe(500);
    expect(r.ok && r.state.entities.van!.stats.rank).toBe(1);
  });
});
