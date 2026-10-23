import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, RngCursor, SYSTEM_ISSUER, createEngine, dialogueChoices, dialogueOf } from '../../engine';
import { DEFEATED_FLAG, FINAL_BOSS_TAG, FINAL_FLAG, SECRET_FLAG, endingAfterCommand, metaOf, willy } from '../../rulesets/willy';
import { DIALOGUES } from '../../content/willy/dialogues';
import { applyCasting, buildFloor, maps, newWillyGame } from '../../content/willy/setup';
import { ending } from '../../content/willy/run-modes';

const engine = createEngine(willy, 'willy-ending', { dialogues: DIALOGUES, maps });
const tree = DIALOGUES['final-temporada']!;

function wonGame(extraFlags: Record<string, boolean> = {}): GameState {
  const s = applyCasting(newWillyGame(engine, 7), { clase: 'butanero', puntos: {} });
  return { ...s, flags: { ...s.flags, [DEFEATED_FLAG]: true, [SECRET_FLAG]: false, ...extraFlags } };
}

/** Plays the ending conversation, picking the choice whose id matches at the decision. */
function playEnding(start: GameState, pick: string): { state: GameState; events: GameEvent[] } {
  let r = engine.apply(start, { type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId: 'final-temporada', actorId: 'willy' } as BaseCommand);
  if (!r.ok) throw new Error(r.error.code);
  let state = r.state;
  const events: GameEvent[] = [...r.events];
  for (let i = 0; i < 40 && dialogueOf(state); i++) {
    const node = tree.nodes[dialogueOf(state)!.nodeId]!;
    const index = node.choices ? node.choices.findIndex((c) => c.id === pick) : 0;
    r = engine.apply(state, { type: 'chooseOption', issuer: 'player:1', index } as BaseCommand);
    if (!r.ok) throw new Error(`${dialogueOf(state)!.nodeId}: ${r.error.code}`);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

describe('the season ending', () => {
  it('the last floor boss carries the final-boss tag (and only that one)', () => {
    const s = applyCasting(newWillyGame(engine, 3), { clase: 'butanero', puntos: {} });
    const last = Object.values(buildFloor(10, s).entities).filter((e) => e.tags.includes(FINAL_BOSS_TAG));
    expect(last.map((e) => e.id)).toEqual(['jefe-presentador']);
    expect(Object.values(buildFloor(8, s).entities).some((e) => e.tags.includes(FINAL_BOSS_TAG))).toBe(false);
  });

  it('defeating the final boss decides the season', () => {
    const s = applyCasting(newWillyGame(engine, 3), { clase: 'butanero', puntos: {} });
    const floor = buildFloor(10, s);
    const boss = Object.values(floor.entities).find((e) => e.tags.includes(FINAL_BOSS_TAG))!;
    const at10 = { ...s, entities: { ...s.entities, [boss.id]: boss } };
    const o = endingAfterCommand(willy, at10, [{ type: 'entityDefeated', entityId: boss.id } as GameEvent], new RngCursor(s.rng));
    expect(o.effects).toContainEqual({ type: 'setFlag', flag: DEFEATED_FLAG, value: true });
    expect(o.effects).toContainEqual({ type: 'setFlag', flag: SECRET_FLAG, value: false });
    // Another boss going down decides nothing.
    const other = endingAfterCommand(willy, at10, [{ type: 'entityDefeated', entityId: 'willy' } as GameEvent], new RngCursor(s.rng));
    expect(other.effects).toEqual([]);
  });

  it('ending B: the conversation ends the run as a victory, unlocks its achievements and offers the summary', () => {
    const { state, events } = playEnding(wonGame(), 'final-b');
    expect(dialogueOf(state)).toBeFalsy();
    expect(state.flags[FINAL_FLAG]).toBe('B');
    expect(events).toContainEqual(expect.objectContaining({ type: 'runEnded', resultado: 'victoria', final: 'B' }));
    expect(metaOf(state).logros).toEqual(expect.arrayContaining(['final-b', 'fin-de-temporada']));
    const summary = ending(state)!;
    expect(summary.button).toBe('Nueva temporada');
    expect(summary.lines[0]).toContain('Vuelta a casa');
    // runEnded only once, even if more commands follow.
    expect(events.filter((e) => e.type === 'runEnded')).toHaveLength(1);
  });

  it('no summary before the ending is chosen', () => {
    expect(ending(wonGame())).toBeNull();
  });

  it('the secret ending is only offered when its conditions held', () => {
    const at = (s: GameState) => {
      let r = engine.apply(s, { type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId: 'final-temporada', actorId: 'willy' } as BaseCommand);
      for (let i = 0; i < 6 && r.ok && dialogueOf(r.state)!.nodeId !== 'eleccion'; i++) r = engine.apply(r.state, { type: 'chooseOption', issuer: 'player:1', index: 0 } as BaseCommand);
      if (!r.ok) throw new Error(r.error.code);
      return dialogueChoices(willy, r.state, tree).map((c) => c.text);
    };
    expect(at(wonGame())).toHaveLength(2);
    expect(at(wonGame({ [SECRET_FLAG]: true }))).toHaveLength(3);
    const c = playEnding(wonGame({ [SECRET_FLAG]: true }), 'final-c');
    expect(c.events).toContainEqual(expect.objectContaining({ type: 'runEnded', final: 'C' }));
  });

  it('Xelda\'s office: on the critical path of the last floor (never the one before), with Xelda and her props', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = applyCasting(newWillyGame(engine, seed), { clase: 'butanero', puntos: {} });
      const plan = (st: GameState) => (st.systems.planta as unknown as { salas: { role: string; critical: boolean }[] }).salas;
      const ten = buildFloor(10, s);
      const at10 = { ...s, systems: { ...s.systems, ...ten.systems } };
      const scenes = plan(at10 as GameState).filter((r) => r.role === 'escena');
      expect(scenes, `seed ${seed}`).toHaveLength(1);
      expect(scenes[0]!.critical).toBe(true);
      const xelda = ten.entities.find((e) => e.id === 'xelda-despacho')!;
      expect(xelda.tags).toContain('dialogue:xelda-despacho');
      expect(ten.entities.filter((e) => e.spriteId === 'archivador')).toHaveLength(4);
      expect(ten.entities.some((e) => e.spriteId === 'mesa-xelda')).toBe(true);
      const nine = buildFloor(9, s);
      expect(nine.entities.some((e) => e.id === 'xelda-despacho')).toBe(false);
    }
    // The Camerinos' Xelda no longer has the contract (the office replaced that).
    expect(maps['camerino-9']!().entities.find((e) => e.id === 'xelda')!.tags.some((t) => t.startsWith('dialogue:'))).toBe(false);
  });

  it('talking to Xelda in her office: the reveal, then reading the contract sets the flag; the ending remembers the visit', () => {
    const s = applyCasting(newWillyGame(engine, 7), { clase: 'butanero', puntos: {} });
    const office = DIALOGUES['xelda-despacho']!;
    let r = engine.apply(s, { type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId: 'xelda-despacho', actorId: 'willy' } as BaseCommand);
    for (let i = 0; i < 12 && r.ok && dialogueOf(r.state); i++) {
      const node = office.nodes[dialogueOf(r.state)!.nodeId]!;
      const index = node.choices ? node.choices.findIndex((c) => c.id === 'leer') : 0;
      r = engine.apply(r.state, { type: 'chooseOption', issuer: 'player:1', index } as BaseCommand);
    }
    if (!r.ok) throw new Error(r.error.code);
    expect(r.state.flags['willy:contratoLeido']).toBe(true);
    expect(r.state.flags['willy:despachoVisto']).toBe(true);
    const won = { ...r.state, flags: { ...r.state.flags, [DEFEATED_FLAG]: true, [SECRET_FLAG]: false } };
    const started = engine.apply(won, { type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId: 'final-temporada', actorId: 'willy' } as BaseCommand);
    if (!started.ok) throw new Error(started.error.code);
    const next = engine.apply(started.state, { type: 'chooseOption', issuer: 'player:1', index: 0 } as BaseCommand);
    if (!next.ok) throw new Error(next.error.code);
    expect(dialogueOf(next.state)!.nodeId).toBe('xelda1visto');
  });
});
