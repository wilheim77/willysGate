import { describe, expect, it } from 'vitest';
import {
  type BaseCommand,
  type DialogueTree,
  type GameState,
  createEngine,
  dialogueChoices,
  dialogueOf,
  itemCount,
  tileAt,
} from '../../engine';
import { toyRuleset } from '../fixtures/toyRuleset';
import { asciiMap, makeEntity } from '../fixtures/helpers';

const pool = (n: number) => ({ current: n, max: n });

const gate: DialogueTree = {
  id: 'gate',
  start: 'hello',
  nodes: {
    hello: {
      speaker: 'guard',
      text: '¿Quién va?',
      choices: [
        { text: 'Un amigo.', once: true, next: 'hello' },
        { text: '[Fe] Bendito seas.', when: { rule: 'faithAtLeast', params: { min: 3 } }, lockedHint: '[Fe 3]', next: 'blessed' },
        { text: 'Déjame pasar.', check: { check: 'will', dc: 9, success: 'open', failure: 'refused' } },
        { text: 'Tengo la llave.', when: { item: 'key' }, effects: [{ type: 'giveItem', owner: 'party', item: 'key', count: -1 }], next: 'open' },
        { text: 'Únete a mí.', when: { flag: 'bribed' }, effects: [{ type: 'setController', entityId: 'guard', controllerId: 'player:1', factionId: 'hunters' }] },
        { text: 'Muere.', effects: [{ type: 'startCombat', factions: ['watch'] }] },
      ],
    },
    blessed: { speaker: 'guard', text: 'Gracias, padre.', next: 'open' },
    open: { text: 'La puerta se abre.', effects: [{ type: 'setTile', position: { x: 2, y: 0 }, walkable: true }, { type: 'setFlag', flag: 'gate_open', value: true }] },
    refused: { speaker: 'guard', text: 'Ni hablar.', next: 'hello' },
  },
};

const engine = createEngine(toyRuleset, 'test', { dialogues: { gate } });

function world(faith = 0, will = 0): GameState {
  const map = asciiMap(['..#..']);
  return engine.newGame({
    seed: 3,
    map,
    entities: [
      makeEntity({ id: 'hero', position: { x: 0, y: 0 }, factionId: 'hunters', stats: { will, stride: 4 }, resources: { blood: pool(6), faith: pool(faith), action: pool(1), reaction: pool(1) } }),
      makeEntity({ id: 'guard', controllerId: 'ai', factionId: 'watch', position: { x: 1, y: 0 }, tags: ['dialogue:gate'], resources: { blood: pool(6), action: pool(1), reaction: pool(1) } }),
    ],
  });
}

function run(state: GameState, cmd: object): GameState {
  const r = engine.apply(state, { issuer: 'player:1', ...cmd } as BaseCommand);
  if (!r.ok) throw new Error(`${(cmd as { type: string }).type}: ${r.error.code} ${r.error.message}`);
  return r.state;
}
const talk = (s: GameState) => run(s, { type: 'interact', entityId: 'hero', targetId: 'guard' });
const pick = (s: GameState, index: number) => run(s, { type: 'chooseOption', index });
const shown = (s: GameState) => dialogueChoices(toyRuleset, s, gate);

describe('dialogue', () => {
  it('interacting with an adjacent entity starts its conversation', () => {
    const s = talk(world());
    expect(dialogueOf(s)).toMatchObject({ treeId: 'gate', nodeId: 'hello', actorId: 'hero', partnerId: 'guard' });
    const far = { ...world(), entities: { ...world().entities, guard: { ...world().entities.guard!, position: { x: 4, y: 0 } } } };
    expect(engine.apply(far, { type: 'interact', issuer: 'player:1', entityId: 'hero', targetId: 'guard' } as BaseCommand)).toMatchObject({ ok: false, error: { code: 'out_of_range' } });
  });

  it('hides unmet choices, shows locked ones with a hint, and forgets "once" choices after use', () => {
    let s = talk(world());
    const views = shown(s);
    expect(views.map((c) => c.index)).toEqual([0, 1, 2, 5]);
    expect(views.find((c) => c.index === 1)).toMatchObject({ available: false, lockedHint: '[Fe 3]' });
    expect(engine.apply(s, { type: 'chooseOption', issuer: 'player:1', index: 1 } as BaseCommand).ok).toBe(false);
    s = pick(s, 0);
    expect(shown(s).map((c) => c.index)).not.toContain(0);
    // Remembered across conversations.
    const { dialogue: _, ...systems } = s.systems;
    s = talk({ ...s, systems });
    expect(shown(s).map((c) => c.index)).not.toContain(0);
  });

  it('ruleset conditions unlock choices', () => {
    let s = talk(world(3));
    s = pick(s, 1);
    expect(dialogueOf(s)?.nodeId).toBe('blessed');
    s = pick(s, 0);
    expect(dialogueOf(s)?.nodeId).toBe('open');
    s = pick(s, 0);
    expect(dialogueOf(s)).toBeNull();
    expect(s.flags.gate_open).toBe(true);
    expect(tileAt(s.map, { x: 2, y: 0 })?.walkable).toBe(true);
  });

  it('checks roll through the ruleset and branch on the result, deterministically', () => {
    const easy = pick(talk(world(0, 20)), 2);
    expect(dialogueOf(easy)?.nodeId).toBe('open');
    const hard = pick(talk(world(0, -20)), 2);
    expect(dialogueOf(hard)?.nodeId).toBe('refused');
    const again = engine.apply(talk(world(0, 0)), { type: 'chooseOption', issuer: 'player:1', index: 2 } as BaseCommand);
    const twice = engine.apply(talk(world(0, 0)), { type: 'chooseOption', issuer: 'player:1', index: 2 } as BaseCommand);
    expect(again).toEqual(twice);
    expect(again.ok && again.events.some((e) => e.type === 'dialogueCheck')).toBe(true);
  });

  it('items gate choices and are spent; companions can be recruited', () => {
    let s = engine.applyEffects(world(), [{ type: 'giveItem', owner: 'party', item: 'key', count: 1 }]).state;
    s = pick(talk(s), 3);
    expect(itemCount(s, 'party', 'key')).toBe(0);
    let r = engine.applyEffects(world(), [{ type: 'setFlag', flag: 'bribed', value: true }]).state;
    r = pick(talk(r), 4);
    expect(r.entities.guard).toMatchObject({ controllerId: 'player:1', factionId: 'hunters' });
    expect(dialogueOf(r)).toBeNull();
  });

  it('a choice can start a fight, which ends the conversation', () => {
    const s = pick(talk(world()), 5);
    expect(s.turn.mode).toBe('combat');
    expect(dialogueOf(s)).toBeNull();
    expect(s.turn.order).toEqual(expect.arrayContaining(['hero', 'guard']));
  });

  it('only the speaker\'s controller can choose, and no talking during combat', () => {
    const s = talk(world());
    expect(engine.apply(s, { type: 'chooseOption', issuer: 'player:2', index: 0 } as BaseCommand).ok).toBe(false);
    const fighting = pick(talk(world()), 5);
    expect(engine.apply(fighting, { type: 'interact', issuer: 'player:1', entityId: 'hero', targetId: 'guard' } as BaseCommand).ok).toBe(false);
  });

  it('fixes from review 2: no talking to the dead, scripts only for startDialogue, fights and lost trees close conversations', () => {
    const dead = { ...world(), entities: { ...world().entities, guard: { ...world().entities.guard!, resources: { ...world().entities.guard!.resources, blood: { current: 0, max: 6 } } } } };
    expect(engine.apply(dead, { type: 'interact', issuer: 'player:1', entityId: 'hero', targetId: 'guard' } as BaseCommand).ok).toBe(false);
    expect(engine.apply(world(), { type: 'startDialogue', issuer: 'player:1', treeId: 'gate', actorId: 'hero' } as BaseCommand).ok).toBe(false);
    expect(engine.apply(world(), { type: 'startDialogue', issuer: 'system', treeId: 'gate', actorId: 'hero' } as BaseCommand).ok).toBe(true);
    // An encounter starting elsewhere ends the conversation.
    const talking = talk(world());
    const fight = engine.apply(talking, { type: 'startCombat', issuer: 'system', participants: ['hero', 'guard'] } as BaseCommand);
    expect(fight.ok && dialogueOf(fight.state)).toBeNull();
    // A saved conversation whose tree no longer exists can be closed.
    const lost = { ...talking, systems: { ...talking.systems, dialogue: { ...(talking.systems.dialogue as object), treeId: 'gone' } } };
    expect(engine.apply(lost, { type: 'endDialogue', issuer: 'player:1' } as BaseCommand).ok).toBe(true);
    const picked = engine.apply(lost, { type: 'chooseOption', issuer: 'player:1', index: 0 } as BaseCommand);
    expect(picked.ok && dialogueOf(picked.state)).toBeNull();
  });
});
