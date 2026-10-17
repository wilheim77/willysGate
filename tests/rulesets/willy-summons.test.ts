import { describe, expect, it } from 'vitest';
import { type Entity, type GameState, OBJECT_TAG, RngCursor, SYSTEM_ISSUER, hasCondition, hasTag } from '../../engine';
import { willy } from '../../rulesets/willy';
import { W, engine, game, rat, until } from './willy-helpers';

function act(s: GameState, actorId: string, actionId: string, target: object) {
  const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: actorId, actionId, target } as never);
  if (!r.ok) throw new Error(`${actionId}: ${r.error.code} ${r.error.message}`);
  return r;
}

function inCombat(entities: Entity[], first: string, rows?: string[]): GameState {
  const s = game(entities, rows);
  const ids = entities.filter((e) => !e.tags.includes(OBJECT_TAG)).map((e) => e.id);
  const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ids } as never);
  if (!r.ok) throw new Error(r.error.code);
  const order = [first, ...r.state.turn.order.filter((id) => id !== first)];
  const fresh = { ...r.state.entities[first]!, resources: { ...r.state.entities[first]!.resources, acciones: { current: 2, max: 2 } } };
  return { ...r.state, entities: { ...r.state.entities, [first]: fresh }, turn: { ...r.state.turn, order, activeEntityId: first, movementUsed: 0 } };
}

const summonsOf = (s: GameState, owner: string) => Object.values(s.entities).filter((e) => hasTag(e, `invocado-por:${owner}`));
const rows = ['..........', '..........', '..........'];

describe('summons (R13)', () => {
  it('Colaboración: a fan joins the turn order right after the Influencer, controlled by the AI, for 3 rounds', () => {
    const s = inCombat([W('i', 'influencer', 2, 1, 3), rat('r', 8, 1)], 'i', rows);
    const r = act(s, 'i', 'hab:colaboracion', {});
    const [fan] = summonsOf(r.state, 'i');
    expect(fan).toMatchObject({ spriteId: 'fan-entusiasta', controllerId: 'ai', factionId: 'concursantes' });
    expect(r.state.turn.order.indexOf(fan!.id)).toBe(r.state.turn.order.indexOf('i') + 1);
    expect((r.state.systems.summons as Record<string, { roundsLeft: number }>)[fan!.id]!.roundsLeft).toBe(3);
  });

  it('Construir autómata: the player controls it; one at a time at level 1', () => {
    const s = inCombat([W('e', 'ingeniero', 2, 1), rat('r', 8, 1)], 'e', rows);
    const r = act(s, 'e', 'hab:construir-automata', { tile: { x: 3, y: 1 } });
    const [bot] = summonsOf(r.state, 'e');
    expect(bot).toMatchObject({ spriteId: 'automata-repetidor', controllerId: 'player:1', position: { x: 3, y: 1 } });
    expect(willy.previewAction(r.state, 'e', 'hab:construir-automata', { tile: { x: 1, y: 1 } }).valid).toBe(false);
    // Near the engineer: «Cobertura total» +1 to hit.
    const placed = engine.applyEffects(r.state, [{ type: 'setPosition', entityId: 'r', position: { x: 4, y: 1 } }]).state;
    expect(willy.previewAction(placed, bot!.id, 'basic:golpe', { entityId: 'r' }).breakdown).toContainEqual(expect.objectContaining({ label: 'Cobertura total' }) as never);
  });

  it('Antena repetidora fires a free arc at the nearest enemy when the engineer’s turn starts', () => {
    const s = inCombat([W('e', 'ingeniero', 2, 1, 6), rat('r', 6, 1, { vida: 40 })], 'e', rows);
    const r = act(s, 'e', 'hab:antena-repetidora', { tile: { x: 4, y: 1 } });
    const o = willy.onTurnStart!(r.state, 'e', new RngCursor({ a: 3, b: 4, c: 5, d: 6 }));
    expect(o.effects).toContainEqual(expect.objectContaining({ type: 'modifyResource', entityId: 'r', resource: 'vida' }));
    const [ant] = summonsOf(r.state, 'e');
    expect(willy.canAct(ant!)).toBe(false);
  });

  it('Despliegue masivo: three automatons at once; Actualización de firmware heals them', () => {
    let s = inCombat([W('e', 'ingeniero', 4, 1, 9), rat('r', 9, 1)], 'e', rows);
    s = act(s, 'e', 'hab:despliegue-masivo', {}).state;
    const bots = summonsOf(s, 'e');
    expect(bots).toHaveLength(3);
    s = engine.applyEffects(s, [{ type: 'modifyResource', entityId: bots[0]!.id, resource: 'vida', delta: -6 }]).state;
    s = { ...s, entities: { ...s.entities, e: { ...s.entities.e!, resources: { ...s.entities.e!.resources, acciones: { current: 2, max: 2 }, energia: { current: 9, max: 9 } } } } };
    const fixed = act(s, 'e', 'hab:actualizacion-de-firmware', { entityId: bots[0]!.id });
    expect(fixed.state.entities[bots[0]!.id]!.resources.vida!.current).toBe(10);
  });

  it('Tiempo muerto: Chencho comes on, and with him the alley-oop is the real thing (2d8)', () => {
    const s = inCombat([W('b', 'jugador-de-basket', 2, 1, 6), rat('r', 5, 1, { vida: 60 })], 'b', rows);
    const r = act(s, 'b', 'hab:tiempo-muerto', {});
    const [chencho] = summonsOf(r.state, 'b');
    expect(chencho).toMatchObject({ spriteId: 'chencho-el-base', controllerId: 'player:1' });
    const ready = { ...r.state, entities: { ...r.state.entities, b: { ...r.state.entities.b!, resources: { ...r.state.entities.b!.resources, acciones: { current: 2, max: 2 } } } } };
    expect(willy.previewAction(ready, 'b', 'hab:alley-oop', { entityId: 'r' }).breakdown).toContainEqual(expect.objectContaining({ label: 'Daño', value: '2d8' }) as never);
  });

  it('summons leave when the fight ends and when their owner is eliminated', () => {
    const s = inCombat([W('i', 'influencer', 2, 1, 3), rat('r', 8, 1)], 'i', rows);
    const r = act(s, 'i', 'hab:colaboracion', {});
    const end = willy.onCombatEnd!(r.state, 'concursantes');
    expect(end.effects).toContainEqual(expect.objectContaining({ type: 'despawnEntity' }));
    // The Influencer falls: her fan goes home with her.
    const weak = engine.applyEffects(r.state, [{ type: 'modifyResource', entityId: 'i', resource: 'vida', delta: 1 - r.state.entities.i!.resources.vida!.current }]).state;
    const near = engine.applyEffects(weak, [{ type: 'setPosition', entityId: 'r', position: { x: 3, y: 2 } }]).state;
    let dismissed = false;
    for (let a = 0; a < 300 && !dismissed; a++) {
      const o = willy.performAction(near, 'r', 'basic:golpe', { entityId: 'i' }, new RngCursor({ a, b: 1, c: 2, d: 3 }));
      dismissed = o.effects.some((e) => e.type === 'despawnEntity');
    }
    expect(dismissed).toBe(true);
  });
});

describe('barriers (R13)', () => {
  it('Pared invisible blocks the way and counts as a wall for shoves', () => {
    let s = inCombat([W('m', 'mimo', 2, 2), W('w', 'butanero', 3, 1), rat('r', 4, 1, { vida: 40 })], 'm', rows);
    s = act(s, 'm', 'hab:pared-invisible', { tile: { x: 5, y: 1 } }).state;
    const wall = Object.values(s.entities).find((e) => hasTag(e, 'barrera'))!;
    expect(wall.position).toEqual({ x: 5, y: 1 });
    expect(willy.isStanding(wall)).toBe(false);
    expect(willy.occupiesTile!(wall)).toBe(true);
    s = { ...s, turn: { ...s.turn, activeEntityId: 'w' }, entities: { ...s.entities, w: { ...s.entities.w!, resources: { ...s.entities.w!.resources, acciones: { current: 2, max: 2 } } } } };
    const { events, state } = until(s, 'w', 'basic:empujar', { entityId: 'r' }, (st) => st.entities.r!.resources.vida!.current < 40);
    expect(events).toContainEqual(expect.objectContaining({ type: 'collided', with: 'muro' }));
    expect(state.entities.r!.position).toEqual({ x: 4, y: 1 });
  });

  it('Ventanilla cerrada: a line of 3, and whoever bumps into it loses an action', () => {
    let s = inCombat([W('f', 'funcionario', 2, 1, 6), W('w', 'butanero', 3, 2), rat('r', 4, 1, { vida: 40 })], 'f', rows);
    s = act(s, 'f', 'hab:ventanilla-cerrada', { tile: { x: 5, y: 1 } }).state;
    expect(Object.values(s.entities).filter((e) => hasTag(e, 'barrera:persiana-de-ventanilla')).map((e) => e.position)).toEqual(
      expect.arrayContaining([{ x: 5, y: 1 }, { x: 5, y: 0 }, { x: 5, y: 2 }]),
    );
    s = { ...s, turn: { ...s.turn, activeEntityId: 'w' }, entities: { ...s.entities, w: { ...s.entities.w!, resources: { ...s.entities.w!.resources, acciones: { current: 2, max: 2 } } } } };
    const { events } = until(s, 'w', 'basic:empujar', { entityId: 'r' }, (_st, ev) => ev.some((e) => e.type === 'traitTriggered'));
    expect(events).toContainEqual(expect.objectContaining({ type: 'traitTriggered', rasgo: 'ventanilla-cerrada' }));
  });
});

describe('R20 hooks', () => {
  it('Siesta en la silla: ending a turn without moving may put the Socorrista to sleep', () => {
    const s = inCombat([W('s', 'socorrista', 2, 1), rat('r', 8, 1)], 's', rows);
    let slept = false;
    for (let a = 0; a < 200 && !slept; a++) {
      const o = willy.onTurnEnd!(s, 's', new RngCursor({ a, b: 2, c: 3, d: 4 }));
      slept = o.effects.some((e) => e.type === 'applyCondition' && e.condition === 'dormido');
    }
    expect(slept).toBe(true);
    const moved = { ...s, turn: { ...s.turn, movementUsed: 2 } };
    expect(willy.onTurnEnd!(moved, 's', new RngCursor(s.rng)).effects).toEqual([]);
  });

  it('Silencio absoluto: the Mimo starts every fight hidden', () => {
    const s = inCombat([W('m', 'mimo', 0, 0), rat('r', 6, 0)], 'r');
    expect(hasCondition(s.entities.m!, 'escondido')).toBe(true);
  });
});
