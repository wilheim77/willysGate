import { describe, expect, it } from 'vitest';
import { type Entity, type GameState, OBJECT_TAG, RngCursor, SYSTEM_ISSUER, hasCondition, surfaceAt } from '../../engine';
import { skillLevel, willy } from '../../rulesets/willy';
import { W, engine, game, rat, until } from './willy-helpers';

function act(s: GameState, actorId: string, actionId: string, target: object) {
  const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: actorId, actionId, target } as never);
  if (!r.ok) throw new Error(`${actionId}: ${r.error.code} ${r.error.message}`);
  return r;
}

function withUses(e: Entity, ability: string, uses: number): Entity {
  return { ...e, resources: { ...e.resources, [`uso:${ability}`]: { current: uses, max: 99999 } } };
}

function inCombat(s: GameState, first: string): GameState {
  const ids = Object.values(s.entities).filter((e) => !e.tags.includes(OBJECT_TAG)).map((e) => e.id);
  const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ids } as never);
  if (!r.ok) throw new Error(r.error.code);
  const st = r.state;
  const order = [first, ...st.turn.order.filter((id) => id !== first)];
  const ents = { ...st.entities, [first]: { ...st.entities[first]!, resources: { ...st.entities[first]!.resources, acciones: { current: 2, max: 2 } } } };
  return { ...st, entities: ents, turn: { ...st.turn, order, activeEntityId: first, movementUsed: 0 } };
}

const two = ['..........', '..........', '..........'];

describe('Influencer', () => {
  it('Flash del selfie blinds the enemies in a cone', () => {
    const s = game([W('i', 'influencer', 0, 1), rat('a', 2, 1), rat('b', 3, 2), rat('back', 0, 0)], two);
    const r = act(s, 'i', 'hab:flash-del-selfie', { tile: { x: 3, y: 1 } });
    expect(hasCondition(r.state.entities.a!, 'cegado')).toBe(true);
    expect(hasCondition(r.state.entities.b!, 'cegado')).toBe(true);
    expect(hasCondition(r.state.entities.back!, 'cegado')).toBe(false);
  });

  it('Viral marks the next spectacular moment; Cancelación scares (not bosses until mastery)', () => {
    const s = game([W('i', 'influencer', 0, 0, 9), rat('r', 3, 0), rat('boss', 4, 0, { tags: ['jefe'] })]);
    expect(hasCondition(act(s, 'i', 'hab:viral', {}).state.entities.i!, 'viral')).toBe(true);
    const c = act(s, 'i', 'hab:cancelacion', { entityId: 'r' });
    expect(hasCondition(c.state.entities.r!, 'asustado')).toBe(true);
    expect(willy.previewAction(s, 'i', 'hab:cancelacion', { entityId: 'boss' }).valid).toBe(false);
  });
});

describe('Bardo de verbena', () => {
  it('Paquito makes everyone around dance, and dancing moves them at turn start', () => {
    const s = game([W('b', 'bardo-de-verbena', 3, 1), rat('a', 4, 1, { vida: 30 }), rat('far', 9, 1)], two);
    const r = act(s, 'b', 'hab:paquito', {});
    expect(hasCondition(r.state.entities.a!, 'bailando')).toBe(true);
    expect(hasCondition(r.state.entities.far!, 'bailando')).toBe(false);
    const turn = willy.onTurnStart!(r.state, 'a', new RngCursor({ a: 9, b: 8, c: 7, d: 6 }));
    expect(turn.effects.some((e) => e.type === 'push')).toBe(true);
  });

  it('Pasodoble: +2 to hit and +1 damage; the same song twice in a row is shorter («Repertorio corto»)', () => {
    const s = game([W('b', 'bardo-de-verbena', 0, 0), rat('r', 1, 0)]);
    const before = willy.previewAction(s, 'b', 'basic:golpe', { entityId: 'r' }).chance!;
    const once = act(s, 'b', 'hab:pasodoble', {});
    expect(willy.previewAction(once.state, 'b', 'basic:golpe', { entityId: 'r' }).chance!).toBeCloseTo(before + 0.1);
    const twice = act(once.state, 'b', 'hab:pasodoble', {});
    expect(twice.events).toContainEqual(expect.objectContaining({ type: 'traitTriggered', rasgo: 'repertorio-corto' }));
    expect(twice.state.entities.b!.conditions.find((c) => c.id === 'pasodoble')!.remainingTurns).toBe(2);
  });

  it('Canción del verano dizzies; ¡Otra, otra! repeats the last song for free', () => {
    const s = game([W('b', 'bardo-de-verbena', 3, 1, 6), rat('a', 4, 1)], two);
    const sung = act(s, 'b', 'hab:cancion-del-verano', {});
    expect(hasCondition(sung.state.entities.a!, 'mareado')).toBe(true);
    const cleared = engine.applyEffects(sung.state, [{ type: 'removeCondition', entityId: 'a', condition: 'mareado' }]).state;
    const bis = act(cleared, 'b', 'hab:bis', {});
    expect(hasCondition(bis.state.entities.a!, 'mareado')).toBe(true);
  });

  it('Orquesta completa heals the Bardo every turn and keeps enemies dancing', () => {
    let s = game([W('b', 'bardo-de-verbena', 3, 1, 9), rat('a', 5, 1)], two);
    s = engine.applyEffects(s, [{ type: 'modifyResource', entityId: 'b', resource: 'vida', delta: -10 }]).state;
    const r = act(s, 'b', 'hab:orquesta-completa', {});
    const t = willy.onTurnStart!(r.state, 'b', new RngCursor(r.state.rng));
    expect(t.effects).toContainEqual(expect.objectContaining({ type: 'modifyResource', entityId: 'b', resource: 'vida', delta: 3 }));
    expect(t.effects).toContainEqual(expect.objectContaining({ type: 'applyCondition', entityId: 'a', condition: 'bailando' }));
  });
});

describe('Socorrista', () => {
  it('Rescate pulls a creature 3 tiles towards you', () => {
    const s = game([W('s', 'socorrista', 0, 0), rat('r', 4, 0)]);
    expect(act(s, 's', 'hab:rescate', { entityId: 'r' }).state.entities.r!.position).toEqual({ x: 1, y: 0 });
  });

  it('Silbatazo: no save for someone standing in water', () => {
    let s = game([W('s', 'socorrista', 0, 0), rat('r', 3, 0)]);
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 3, y: 0 }], surface: 'agua' }]).state;
    expect(willy.previewAction(s, 's', 'hab:silbatazo', { entityId: 'r' }).chance).toBe(1);
    expect(hasCondition(act(s, 's', 'hab:silbatazo', { entityId: 'r' }).state.entities.r!, 'aturdido')).toBe(true);
  });

  it('Boya hits at range and pushes; Bandera roja floods and pushes everyone out', () => {
    const s = game([W('s', 'socorrista', 0, 1, 9), rat('r', 3, 1, { vida: 40 })], two);
    const { state } = until(s, 's', 'hab:boya', { entityId: 'r' }, (st) => st.entities.r!.position.x === 5);
    expect(state.entities.r!.resources.vida!.current).toBeLessThan(40);
    const flood = act(game([W('s', 'socorrista', 4, 1, 9), rat('r', 5, 1)], two), 's', 'hab:bandera-roja', {});
    expect(surfaceAt(flood.state, { x: 4, y: 1 })?.type).toBe('agua');
    expect(flood.state.entities.r!.position.x).toBe(7);
  });

  it('Reanimación heals half your health, once per floor; «Como pez en el agua» moves faster in water', () => {
    let s = game([W('s', 'socorrista', 0, 0, 6)]);
    s = engine.applyEffects(s, [{ type: 'modifyResource', entityId: 's', resource: 'vida', delta: -20 }]).state;
    const r = act(s, 's', 'hab:reanimacion', { entityId: 's' });
    expect(r.state.entities.s!.resources.vida!.current).toBeGreaterThan(s.entities.s!.resources.vida!.current);
    expect(willy.previewAction(r.state, 's', 'hab:reanimacion', { entityId: 's' }).valid).toBe(false);
    const wet = engine.applyEffects(game([W('s', 'socorrista', 0, 0)]), [{ type: 'spawnSurface', tiles: [{ x: 0, y: 0 }], surface: 'agua' }]).state;
    expect(willy.movementBudget(wet.entities.s!, wet)).toBe(willy.movementBudget(wet.entities.s!, game([W('s', 'socorrista', 0, 0)])) + 2);
  });
});

describe('Tasador', () => {
  it('Ojo clínico: +4 and critical on 18-20 against the studied target, then it is used up', () => {
    const s = game([W('t', 'tasador', 0, 0), rat('r', 1, 0, { vida: 99, def: 18 })]);
    const before = willy.previewAction(s, 't', 'basic:golpe', { entityId: 'r' }).chance!;
    const studied = act(s, 't', 'hab:ojo-clinico', { entityId: 'r' });
    expect(willy.previewAction(studied.state, 't', 'basic:golpe', { entityId: 'r' }).chance!).toBeCloseTo(before + 0.2);
    const hit = act(studied.state, 't', 'basic:golpe', { entityId: 'r' });
    expect(hasCondition(hit.state.entities.r!, 'estudiado')).toBe(false);
  });

  it('Pieza de museo petrifies; pushing a petrified enemy shatters it', () => {
    const s = game([W('t', 'tasador', 0, 0, 9), W('w', 'butanero', 2, 0), rat('r', 3, 0, { vida: 40 })]);
    const p = act(s, 't', 'hab:pieza-de-museo', { entityId: 'r' });
    expect(hasCondition(p.state.entities.r!, 'petrificado')).toBe(true);
    const { state } = until(p.state, 'w', 'basic:empujar', { entityId: 'r' }, (st) => hasCondition(st.entities.r!, 'eliminado'));
    expect(willy.isStanding(state.entities.r!)).toBe(false);
  });

  it('«¡Que es de época!»: breaking scenery costs the Tasador an action next turn', () => {
    const vase = { ...rat('jarron', 1, 0, { vida: 1 }), tags: [OBJECT_TAG, 'jarron'] };
    const r = act(game([W('t', 'tasador', 0, 0), vase]), 't', 'basic:golpe', { entityId: 'jarron' });
    expect(hasCondition(r.state.entities.t!, 'pena')).toBe(true);
  });
});

describe('Mimo', () => {
  it('Cuerda imaginaria pulls; Caja invisible locks someone away from everything', () => {
    const s = game([W('m', 'mimo', 0, 0, 3), rat('r', 4, 0), rat('q', 2, 2)], two);
    expect(act(s, 'm', 'hab:cuerda-imaginaria', { entityId: 'r' }).state.entities.r!.position).toEqual({ x: 2, y: 0 });
    const boxed = act(s, 'm', 'hab:caja-invisible', { entityId: 'q' });
    expect(willy.canAct(boxed.state.entities.q!)).toBe(false);
    expect(willy.previewAction(boxed.state, 'm', 'basic:golpe', { entityId: 'q' }).valid).toBe(false);
  });

  it('Escalera imaginaria climbs any height; Contra el viento pushes a whole line', () => {
    const s = game([W('m', 'mimo', 0, 0, 9)], ['.4....']);
    expect(act(s, 'm', 'hab:escalera-imaginaria', { tile: { x: 1, y: 0 } }).state.entities.m!.position).toEqual({ x: 1, y: 0 });
    const wind = act(game([W('m', 'mimo', 0, 0, 9), rat('a', 2, 0), rat('b', 4, 0)], ['............']), 'm', 'hab:contra-el-viento', { tile: { x: 5, y: 0 } });
    expect(wind.state.entities.b!.position.x).toBe(7);
    expect(wind.state.entities.a!.position.x).toBe(5);
  });

  it('«Silencio absoluto»: hidden at the start of the fight', () => {
    const s = inCombat(game([W('m', 'mimo', 0, 0), rat('r', 6, 0)]), 'm');
    const t = willy.onTurnStart!(s, 'm', new RngCursor(s.rng));
    const after = engine.applyEffects(s, t.effects).state;
    expect(hasCondition(after.entities.m!, 'escondido')).toBe(true);
  });
});

describe('Ingeniero', () => {
  it('Arco voltaico hits everything on the line and electrifies water', () => {
    let s = game([W('e', 'ingeniero', 0, 0), rat('a', 2, 0, { vida: 30 }), rat('b', 3, 0, { vida: 30 })]);
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 4, y: 0 }], surface: 'agua' }]).state;
    const r = act(s, 'e', 'hab:arco-voltaico', { tile: { x: 5, y: 0 } });
    expect(r.state.entities.a!.resources.vida!.current).toBeLessThan(30);
    expect(r.state.entities.b!.resources.vida!.current).toBeLessThan(30);
    expect(surfaceAt(r.state, { x: 4, y: 0 })?.type).toBe('electrificada');
  });

  it('5G does nothing, says so on first use, and counts once per turn in combat', () => {
    const s = inCombat(game([W('e', 'ingeniero', 0, 0), rat('r', 6, 0)]), 'e');
    const a = willy.listActions(s, 'e').find((x) => x.id === 'hab:red-g')!;
    expect(a.label).toBe('5G');
    expect(a.cost).toEqual({ acciones: 1 });
    const first = act(s, 'e', 'hab:red-g', {});
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'skillUsed', habilidad: 'red-g', nivel: 1, primeraVez: true }));
    expect(first.state.entities.r).toEqual(s.entities.r);
    const again = act(first.state, 'e', 'hab:red-g', {});
    expect(again.state.entities.e!.resources['uso:red-g']!.current).toBe(1);
    // The next fight's first round counts again (the user saw 5 uses and no 6G).
    const over = engine.applyEffects(again.state, willy.onCombatEnd!(again.state, again.state.entities.e!.factionId).effects).state;
    const next = inCombat({ ...over, turn: { ...over.turn, mode: 'exploration', order: [], activeEntityId: null, round: 0 } }, 'e');
    const third = act(next, 'e', 'hab:red-g', {});
    expect(third.state.entities.e!.resources['uso:red-g']!.current).toBe(2);
    expect(willy.listActions(third.state, 'e').find((x) => x.id === 'hab:red-g')!.description).toContain('usos 2/6');
  });

  it('the G line levels 5G → 6G → … → 10G at 6/16/30/50/75 uses and each level does more', () => {
    const e = W('e', 'ingeniero', 0, 0);
    expect([0, 6, 16, 30, 50, 75].map((n) => skillLevel(withUses(e, 'red-g', n), 'red-g'))).toEqual([1, 2, 3, 4, 5, 6]);
    const six = game([withUses(e, 'red-g', 6), rat('r', 3, 0)]);
    const a = willy.listActions(six, 'e').find((x) => x.id === 'hab:red-g')!;
    expect(a.label).toBe('6G');
    expect(a.target).toMatchObject({ kind: 'creature', range: 4 });
    expect(hasCondition(act(six, 'e', 'hab:red-g', { entityId: 'r' }).state.entities.r!, 'mareado')).toBe(true);
    const ten = game([withUses(e, 'red-g', 75), rat('r', 3, 0), rat('boss', 4, 0, { vida: 100, tags: ['jefe'] })]);
    const boom = act(ten, 'e', 'hab:red-g', {});
    expect(hasCondition(boom.state.entities.r!, 'bailando')).toBe(true);
    expect(boom.state.entities.boss!.resources.vida!.current).toBe(75);
    expect(boom.state.flags['narrador:sinConexion']).toBe(true);
    expect(willy.previewAction(boom.state, 'e', 'hab:red-g', {}).valid).toBe(false);
  });

});
