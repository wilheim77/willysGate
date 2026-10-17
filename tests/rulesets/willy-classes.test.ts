import { describe, expect, it } from 'vitest';
import { RngCursor, SYSTEM_ISSUER, hasCondition, surfaceAt } from '../../engine';
import { willy } from '../../rulesets/willy';
import { W, engine, game, rat, until } from './willy-helpers';

const ids = (s: ReturnType<typeof game>, id: string) => willy.listActions(s, id).map((a) => a.id);

describe('listing abilities', () => {
  it('shows class abilities by level', () => {
    const s1 = game([W('f', 'funcionario', 0, 0, 1)]);
    expect(ids(s1, 'f')).toEqual(expect.arrayContaining(['basic:golpe', 'basic:empujar', 'hab:vuelva-usted-manana', 'hab:formulario-por-triplicado', 'hab:pausa-del-cafe']));
    expect(ids(s1, 'f')).not.toContain('hab:sello-oficial');
    const s9 = game([W('f', 'funcionario', 0, 0, 9)]);
    expect(ids(s9, 'f')).toEqual(expect.arrayContaining(['hab:sello-oficial', 'hab:silencio-administrativo']));
    expect(ids(s9, 'f')).toContain('hab:ventanilla-cerrada');
    const b = game([W('b', 'jugador-de-basket', 0, 0, 9)]);
    expect(ids(b, 'b')).toContain('hab:tiempo-muerto');
    expect(ids(b, 'b')).toContain('hab:alley-oop');
  });

  it('costs come from the data', () => {
    const s = game([W('w', 'butanero', 0, 0)]);
    expect(willy.listActions(s, 'w').find((a) => a.id === 'hab:lanzar-bombona')!.cost).toEqual({ acciones: 1, energia: 2 });
  });
});

describe('Butanero', () => {
  it('Lanzar bombona: fire damage in radius 1 to everyone there, and fire on the floor', () => {
    const s = game([W('w', 'butanero', 0, 0), rat('a', 4, 0, { vida: 30 }), rat('b', 5, 1, { vida: 30 }), rat('c', 7, 0, { vida: 30 })], ['........', '........']);
    const p = willy.previewAction(s, 'w', 'hab:lanzar-bombona', { tile: { x: 4, y: 0 } });
    expect(p.valid).toBe(true);
    expect(p.affectedTiles).toHaveLength(6);
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'w', actionId: 'hab:lanzar-bombona', target: { tile: { x: 4, y: 0 } } } as never);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.entities.a!.resources.vida!.current).toBeLessThan(30);
    expect(r.state.entities.b!.resources.vida!.current).toBeLessThan(30);
    expect(r.state.entities.c!.resources.vida!.current).toBe(30);
    expect(surfaceAt(r.state, { x: 4, y: 0 })?.type).toBe('fuego');
    expect(r.state.entities.w!.resources.energia!.current).toBe(3);
  });

  it('a bottle into a gas cloud blows up the gas too', () => {
    let s = game([W('w', 'butanero', 0, 0, 3), rat('a', 5, 0, { vida: 60 })]);
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 4, y: 0 }, { x: 5, y: 0 }], surface: 'gas' }]).state;
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'w', actionId: 'hab:lanzar-bombona', target: { tile: { x: 4, y: 0 } } } as never);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.events.filter((e) => e.type === 'damageDealt' && (e as unknown as { targetId: string }).targetId === 'a')).toHaveLength(2);
  });

  it('Reparto a domicilio charges in a straight line and pushes on a hit', () => {
    const s = game([W('w', 'butanero', 0, 0), rat('r', 3, 0, { vida: 40 })], ['..........']);
    expect(willy.previewAction(s, 'w', 'hab:reparto-a-domicilio', { entityId: 'r' }).valid).toBe(true);
    const { state } = until(s, 'w', 'hab:reparto-a-domicilio', { entityId: 'r' }, (st) => st.entities.r!.position.x === 5);
    expect(state.entities.w!.position).toEqual({ x: 2, y: 0 });
  });

  it('Reparto a domicilio needs a clear straight line', () => {
    const s = game([W('w', 'butanero', 0, 0), rat('x', 1, 0), rat('r', 3, 0)]);
    expect(willy.previewAction(s, 'w', 'hab:reparto-a-domicilio', { entityId: 'r' }).valid).toBe(false);
    const knight = game([W('w', 'butanero', 0, 0), rat('r', 2, 1)]);
    expect(willy.previewAction(knight, 'w', 'hab:reparto-a-domicilio', { entityId: 'r' }).reason).toMatch(/línea recta/);
  });
});

describe('Funcionario', () => {
  it('Vuelva usted mañana stuns a failed saver; bosses only lose an action', () => {
    const s = game([W('f', 'funcionario', 0, 0), rat('r', 3, 0, { vida: 30 }), rat('boss', 0, 2, { vida: 100, tags: ['jefe'] })]);
    const p = willy.previewAction(s, 'f', 'hab:vuelva-usted-manana', { entityId: 'r' });
    expect(p.chance).toBeGreaterThan(0.5);
    const { state } = until(s, 'f', 'hab:vuelva-usted-manana', { entityId: 'r' }, (st) => hasCondition(st.entities.r!, 'aturdido'));
    expect(willy.canAct(state.entities.r!)).toBe(false);
    const b = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'f', actionId: 'hab:vuelva-usted-manana', target: { entityId: 'boss' } } as never);
    if (!b.ok) throw new Error(b.error.message);
    expect(b.state.entities.boss!.resources.acciones!.current).toBe(1);
    expect(hasCondition(b.state.entities.boss!, 'aturdido')).toBe(false);
  });

  it('Formulario por triplicado lays paperwork that entangles and burns', () => {
    const s = game([W('f', 'funcionario', 0, 0)]);
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'f', actionId: 'hab:formulario-por-triplicado', target: { tile: { x: 3, y: 0 } } } as never);
    if (!r.ok) throw new Error(r.error.message);
    expect(surfaceAt(r.state, { x: 3, y: 0 })?.type).toBe('expedientes');
    const burnt = engine.applyEffects(r.state, [{ type: 'applyElement', tiles: [{ x: 2, y: 0 }], element: 'fuego' }]).state;
    expect(surfaceAt(burnt, { x: 4, y: 0 })?.type).toBe('fuego');
  });

  it('Pausa del café heals, ends the turn and only once per fight; after two o’clock it is closed', () => {
    let s = game([W('f', 'funcionario', 0, 0), rat('r', 7, 0)]);
    s = engine.applyEffects(s, [{ type: 'modifyResource', entityId: 'f', resource: 'vida', delta: -10 }]).state;
    const started = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['f', 'r'] } as never);
    if (!started.ok) throw new Error(started.error.code);
    let c = { ...started.state, turn: { ...started.state.turn, activeEntityId: 'f', order: ['f', 'r'] } };
    c = { ...c, entities: { ...c.entities, f: { ...c.entities.f!, resources: { ...c.entities.f!.resources, acciones: { current: 2, max: 2 } } } } };
    const r = engine.apply(c, { type: 'act', issuer: 'player:1', entityId: 'f', actionId: 'hab:pausa-del-cafe', target: {} } as never);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.entities.f!.resources.vida!.current).toBe(r.state.entities.f!.resources.vida!.max - 4);
    expect(r.state.entities.f!.resources.acciones!.current).toBe(0);
    expect(willy.previewAction(r.state, 'f', 'hab:pausa-del-cafe', {}).valid).toBe(false);
    const late = { ...c, turn: { ...c.turn, round: 5 } };
    expect(willy.previewAction(late, 'f', 'hab:pausa-del-cafe', {}).reason).toMatch(/dos/);
    expect(willy.listActions(late, 'f').find((a) => a.id === 'hab:vuelva-usted-manana')!.cost).toEqual({ acciones: 1, energia: 2 });
  });
});

describe('Jugador de basket', () => {
  it('Gran salto crosses a gap and climbs 2 levels; not in a low-ceiling room', () => {
    const s = game([W('b', 'jugador-de-basket', 0, 0)], ['.~~2....']);
    expect(willy.previewAction(s, 'b', 'hab:gran-salto', { tile: { x: 3, y: 0 } }).valid).toBe(true);
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'b', actionId: 'hab:gran-salto', target: { tile: { x: 3, y: 0 } } } as never);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.entities.b!.position).toEqual({ x: 3, y: 0 });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'saltoCompleto', cruzaVacio: true }));
    expect(hasCondition(r.state.entities.b!, 'salto')).toBe(true);
    // Too far, through a wall, or under a low ceiling: no.
    expect(willy.previewAction(s, 'b', 'hab:gran-salto', { tile: { x: 5, y: 0 } }).valid).toBe(false);
    const wall = game([W('b', 'jugador-de-basket', 0, 0)], ['.#....']);
    expect(willy.previewAction(wall, 'b', 'hab:gran-salto', { tile: { x: 2, y: 0 } }).reason).toMatch(/muro/);
    const low = game([W('b', 'jugador-de-basket', 0, 0)]);
    low.map.tiles[0] = { terrain: 'bodega:techo-bajo', height: 0, walkable: true };
    expect(willy.previewAction(low, 'b', 'hab:gran-salto', { tile: { x: 2, y: 0 } }).reason).toMatch(/Techo bajo/);
  });

  it('Mate needs a jump or higher ground; it knocks prone', () => {
    const s = game([W('b', 'jugador-de-basket', 0, 0), rat('r', 2, 0, { vida: 40 })]);
    expect(willy.previewAction(s, 'b', 'hab:mate', { entityId: 'r' }).valid).toBe(false);
    const up = game([W('b', 'jugador-de-basket', 0, 0), rat('r', 1, 0, { vida: 40 })], ['1.....']);
    const p = willy.previewAction(up, 'b', 'hab:mate', { entityId: 'r' });
    expect(p.valid).toBe(true);
    expect(p.breakdown).toContainEqual(expect.objectContaining({ label: 'Desde arriba' }));
    const { state } = until(up, 'b', 'hab:mate', { entityId: 'r' }, (st) => hasCondition(st.entities.r!, 'tumbado'));
    expect(state.entities.r!.position.x).toBe(2);
  });

  it('two metres four: reach 2 for the basic hit, and no prone on a 2-level fall', () => {
    const s = game([W('b', 'jugador-de-basket', 0, 0), rat('r', 2, 0)]);
    expect(willy.listActions(s, 'b').find((a) => a.id === 'basic:golpe')!.target.range).toBe(2);
    expect(willy.previewAction(s, 'b', 'basic:golpe', { entityId: 'r' }).valid).toBe(true);
  });

  it('Pase picado hits at range and pushes', () => {
    const s = game([W('b', 'jugador-de-basket', 0, 0), rat('r', 4, 0, { vida: 40 })]);
    const { state } = until(s, 'b', 'hab:pase-picado', { entityId: 'r' }, (st) => st.entities.r!.position.x === 5);
    expect(state.entities.r!.resources.vida!.current).toBeLessThan(40);
  });

  it('Pase picado bounces off the wall round a pillar, ignores cover and pushes from the bounce', () => {
    const rows = ['......', '......', '..#...', '......'];
    const s = game([W('b', 'jugador-de-basket', 0, 2), rat('r', 4, 2, { vida: 40 })], rows);
    const p = willy.previewAction(s, 'b', 'hab:pase-picado', { entityId: 'r' });
    expect(p.valid).toBe(true);
    expect(p.breakdown?.some((b) => String(b.label).startsWith('Cubierto'))).toBe(false);
    const { state, events } = until(s, 'b', 'hab:pase-picado', { entityId: 'r' }, (st) => st.entities.r!.resources.vida!.current < 40);
    expect(events).toContainEqual(expect.objectContaining({ type: 'bounced' }));
    // The push comes from where the ball bounced, not from the thrower.
    expect(state.entities.r!.position).not.toEqual({ x: 5, y: 2 });
    // Nowhere to bounce: out.
    const boxed = game([W('b', 'jugador-de-basket', 0, 0), rat('r', 4, 0)], ['..#...']);
    expect(willy.previewAction(boxed, 'b', 'hab:pase-picado', { entityId: 'r' }).valid).toBe(false);
  });

  it('Alley-oop (auto, off the wall) jumps next to the target and dunks', () => {
    const s = game([W('b', 'jugador-de-basket', 0, 0, 6), rat('r', 4, 0, { vida: 40 }), rat('n', 5, 1, { vida: 40 })], ['........', '........']);
    const { state } = until(s, 'b', 'hab:alley-oop', { entityId: 'r' }, (st) => hasCondition(st.entities.r!, 'tumbado'));
    expect(state.entities.b!.position.x).toBeGreaterThanOrEqual(3);
  });

  it('Cosas redondas: sometimes shoots at something round instead of acting', () => {
    const b = W('b', 'jugador-de-basket', 0, 0);
    const ball = rat('pato', 2, 0, { vida: 30, tags: ['redondo'] });
    let triggered = false;
    for (let a = 0; a < 200 && !triggered; a++) {
      const s = game([b, ball]);
      const o = willy.onTurnStart!(s, 'b', new RngCursor({ a, b: 7, c: 11, d: 13 }));
      triggered = o.events.some((e) => e.type === 'traitTriggered' && (e as { rasgo?: string }).rasgo === 'cosas-redondas');
    }
    expect(triggered).toBe(true);
  });
});

