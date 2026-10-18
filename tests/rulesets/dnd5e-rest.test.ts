import { describe, expect, it } from 'vitest';
import { type BaseCommand, type DialogueTree, type Entity, type GameState, createEngine, hasCondition } from '../../engine';
import { createCharacter, dnd5e } from '../../rulesets/dnd5e';
import { asciiMap } from '../fixtures/helpers';

// A campfire you can talk to: «Descansar» runs the engine's `rest` effect.
const fire = (kind: string): DialogueTree =>
  ({
    id: 'hoguera',
    start: 'a',
    nodes: { a: { text: 'La hoguera.', choices: [{ id: 'rest', text: 'Descansar.', effects: [{ type: 'rest', kind }] }, { id: 'no', text: 'Seguir.' }] } },
  }) as unknown as DialogueTree;

const ABILITIES = { str: 14, dex: 14, con: 14, int: 14, wis: 12, cha: 10 };
const pc = (id: string, classId: string, x: number): Entity =>
  createCharacter({ id, name: id, controllerId: 'player:1', factionId: 'party', position: { x, y: 0 }, spriteId: 'hero', classId, raceId: 'human', level: 5, abilities: { ...ABILITIES } });

let lastEvents: { type: string; kind?: string }[] = [];
function camp(kind: string, tweak: (s: GameState) => GameState): GameState {
  const engine = createEngine(dnd5e, 'test', { dialogues: { hoguera: fire(kind) } });
  const campfire: Entity = { ...pc('hoguera', 'fighter', 3), controllerId: 'none', factionId: 'scenery', tags: ['object', 'dialogue:hoguera'] };
  let s = engine.newGame({ seed: 3, map: asciiMap(['.....']), entities: [pc('fighter', 'fighter', 0), pc('wizard', 'wizard', 1), pc('cleric', 'cleric', 2), campfire] });
  s = tweak(s);
  for (const cmd of [{ type: 'interact', entityId: 'cleric', targetId: 'hoguera' }, { type: 'chooseOption', index: 0 }]) {
    const r = engine.apply(s, { issuer: 'player:1', ...cmd } as BaseCommand);
    if (!r.ok) throw new Error(`${r.error.code} ${r.error.message}`);
    s = r.state;
    lastEvents = r.events as { type: string; kind?: string }[];
  }
  return s;
}

const set = (s: GameState, id: string, res: string, current: number): GameState => ({
  ...s,
  entities: { ...s.entities, [id]: { ...s.entities[id]!, resources: { ...s.entities[id]!.resources, [res]: { ...s.entities[id]!.resources[res]!, current } } } },
});

describe('5e rests', () => {
  it('emits { type: rested, kind } after the rest is applied, in the same command (the client checkpoints on it)', () => {
    camp('long', (s0) => set(s0, 'fighter', 'hp', 3));
    const i = lastEvents.findIndex((e) => e.type === 'rested');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(lastEvents[i]!.kind).toBe('long');
    expect(lastEvents.slice(0, i).some((e) => e.type === 'restRecovered')).toBe(true);
    expect(lastEvents.slice(i + 1).some((e) => e.type === 'restRecovered' || e.type === 'resourceChanged')).toBe(false);
  });

  it('a short rest spends hit dice up to about 3/4 HP and refreshes short-rest features', () => {
    const s = camp('short', (s0) => set(set(s0, 'fighter', 'hp', 5), 'fighter', 'second_wind', 0));
    const f = s.entities.fighter!;
    expect(f.resources.hp!.current).toBeGreaterThan(5);
    expect(f.resources.hit_dice!.current).toBeLessThan(5);
    expect(f.resources.second_wind!.current).toBe(1);
  });

  it('Arcane Recovery gives a wizard spell slot levels back, once per long rest', () => {
    const drained = (s0: GameState) => set(set(set(s0, 'wizard', 'spell_slot_1', 0), 'wizard', 'spell_slot_2', 0), 'wizard', 'spell_slot_3', 0);
    const s = camp('short', drained);
    const w = s.entities.wizard!;
    const levels = w.resources.spell_slot_1!.current + 2 * w.resources.spell_slot_2!.current + 3 * w.resources.spell_slot_3!.current;
    expect(levels).toBe(3); // half of level 5, rounded up
    expect(w.resources.arcane_recovery!.current).toBe(0);
  });

  it('a long rest restores everything and gets the fallen up', () => {
    const s = camp('long', (s0) => {
      let t = set(set(s0, 'fighter', 'hp', 0), 'wizard', 'spell_slot_1', 0);
      t = set(t, 'fighter', 'hit_dice', 0);
      t = { ...t, entities: { ...t.entities, fighter: { ...t.entities.fighter!, conditions: [{ id: 'downed' }, { id: 'poisoned' }] } } };
      return t;
    });
    const f = s.entities.fighter!;
    expect(hasCondition(f, 'downed')).toBe(false);
    expect(hasCondition(f, 'poisoned')).toBe(false);
    expect(f.resources.hp!.current).toBe(f.resources.hp!.max);
    expect(f.resources.hit_dice!.current).toBe(2); // half of 5 back
    expect(s.entities.wizard!.resources.spell_slot_1!.current).toBe(s.entities.wizard!.resources.spell_slot_1!.max);
  });
});
