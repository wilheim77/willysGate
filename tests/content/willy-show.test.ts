import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, type JsonValue, OBJECT_TAG, RngCursor, SYSTEM_ISSUER, hasCondition } from '../../engine';
import { willy } from '../../rulesets/willy';
import { Resolver, dealDamage } from '../../rulesets/willy/resolve';
import { audienceOf, shareOf, showAfterCommand, showLateAfterCommand, sponsorsOf } from '../../rulesets/willy/show';
import '../../content/willy/show';
import { W, engine, game, rat, until } from '../rulesets/willy-helpers';

/** The show (audience, sponsors, Share) wired at runtime through Ruleset.afterCommand. */

const of = (events: GameEvent[], type: string) => events.filter((e) => e.type === type) as unknown as Record<string, unknown>[];

function withSystem(s: GameState, system: string, value: unknown): GameState {
  return { ...s, systems: { ...s.systems, [system]: value as JsonValue } };
}

function inCombat(s: GameState, first: string): GameState {
  const ids = Object.values(s.entities).filter((e) => !e.tags.includes(OBJECT_TAG)).map((e) => e.id);
  const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ids } as never);
  if (!r.ok) throw new Error(r.error.code);
  const st = r.state;
  const order = [first, ...st.turn.order.filter((id) => id !== first)];
  return { ...st, turn: { ...st.turn, order, activeEntityId: first, movementUsed: 0 } };
}

const pushIntoVoid = (s: GameState) => until(s, 'willy', 'basic:empujar', { entityId: 'r' }, (st) => hasCondition(st.entities.r!, 'eliminado'));

describe('Willy show: audience', () => {
  it('a shove into the void gives audience (kill + «fuera de plano»), doubled the first time', () => {
    const s = game([W('willy', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 })], ['...~']);
    const { state, events } = pushIntoVoid(s);
    const changes = of(events, 'audienceChanged');
    expect(changes.map((c) => c.causa)).toEqual(expect.arrayContaining(['eliminar', 'fuera-de-plano']));
    // Butanero CAR 6 → ×1.3; first time ×2; planta 1 ×1: 100 → 260, 600 → 1560.
    expect(changes.find((c) => c.causa === 'eliminar')!.delta).toBe(260);
    expect(changes.find((c) => c.causa === 'fuera-de-plano')!.delta).toBe(1560);
    // Plus «habilidad nueva» (first Empujar of the run): 200 × 1.3 × 2.
    expect(audienceOf(state)!.valor).toBe(1000 + 260 + 1560 + 520);
    expect(changes.find((c) => c.causa === 'fuera-de-plano')!.entityId).toBe('r');
  });

  it('the same trick again soon after is worth less (novelty)', () => {
    const s = game([W('willy', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 })], ['...~']);
    const first = pushIntoVoid(s).state;
    const again = { ...first, entities: { ...first.entities, r: rat('r', 2, 0, { vida: 30 }), willy: { ...first.entities.willy!, resources: { ...first.entities.willy!.resources, acciones: { current: 2, max: 2 } } } } };
    const { events } = pushIntoVoid(again);
    expect(of(events, 'audienceChanged').find((c) => c.causa === 'eliminar')!.delta).toBe(Math.round(130 * 0.7));
  });

  it('waiting a whole turn loses viewers, but never below the floor minimum', () => {
    let s = inCombat(game([W('willy', 'butanero', 0, 0), rat('r', 5, 0)], ['........']), 'willy');
    s = withSystem(s, 'audiencia', { ...freshish(), valor: 2000, turnoWilly: { activo: true, actuo: false, interesante: false } });
    const r = engine.apply(s, { type: 'endTurn', issuer: 'player:1', entityId: 'willy' } as BaseCommand);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lost = of(r.events, 'audienceChanged').find((c) => c.causa === 'esperar');
    expect(lost?.delta).toBe(-40);
    // At the planta 1 minimum (500) a wait costs nothing more.
    const low = withSystem(s, 'audiencia', { ...freshish(), valor: 500, turnoWilly: { activo: true, actuo: false, interesante: false } });
    const r2 = engine.apply(low, { type: 'endTurn', issuer: 'player:1', entityId: 'willy' } as BaseCommand);
    expect(r2.ok && of(r2.events, 'audienceChanged').length).toBe(0);
  });

  it('milestones pay a box once (5.000 → bronce)', () => {
    let s = game([W('willy', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 })], ['...~']);
    s = withSystem(s, 'audiencia', { ...freshish(), valor: 4000 });
    const { state, events } = pushIntoVoid(s);
    expect(of(events, 'audienceMilestone')).toEqual([expect.objectContaining({ espectadores: 5000, caja: 'bronce' })]);
    expect(of(events, 'boxDelivered')).toEqual([expect.objectContaining({ caja: 'bronce', motivo: 'hito:5000', origen: 'audiencia' })]);
    expect(audienceOf(state)!.hitos).toEqual([5000]);
  });
});

describe('Willy show: other systems', () => {
  it('an achievement unlocked in the same command gives audience (late pass, after the achievements)', () => {
    const s = game([W('willy', 'butanero', 1, 0)]);
    const out = showLateAfterCommand(willy, s, [{ type: 'achievementUnlocked', logroId: 'x', logro: 'X' } as GameEvent], new RngCursor(s.rng));
    expect(of(out.events, 'audienceChanged')[0]).toMatchObject({ causa: 'logro' });
    // The main pass leaves it alone (no double count).
    expect(of(showAfterCommand(willy, s, [{ type: 'achievementUnlocked', logroId: 'x' } as GameEvent], new RngCursor(s.rng)).events, 'audienceChanged')).toHaveLength(0);
  });
});

describe('Willy show: sponsors', () => {
  it('La Colmena loves a fall: interest at 20, a message and a deal on the table; the deal can be signed and met', () => {
    let s = game([W('willy', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 })], ['...~']);
    const first = pushIntoVoid(s);
    const sp = sponsorsOf(first.state)!;
    // fueraDePlano kill (+6 × 1.3 Carisma) for La Colmena.
    expect(sp.porId.colmena!.afinidad).toBeCloseTo(7.8);
    // Nudge it near «interesado» and do it again.
    s = withSystem(first.state, 'patrocinadores', { ...sp, porId: { ...sp.porId, colmena: { ...sp.porId.colmena!, afinidad: 15 } } });
    s = { ...s, entities: { ...s.entities, r: rat('r', 2, 0, { vida: 30 }), willy: { ...s.entities.willy!, resources: { ...s.entities.willy!.resources, acciones: { current: 2, max: 2 } } } } };
    const second = pushIntoVoid(s);
    expect(of(second.events, 'sponsorStateChanged')).toEqual(expect.arrayContaining([expect.objectContaining({ patrocinadorId: 'colmena', a: 'interesado' })]));
    expect(of(second.events, 'sponsorMessage').some((m) => m.patrocinadorId === 'colmena' && m.tipo === 'interes')).toBe(true);
    const offered = of(second.events, 'sponsorDealOffered').find((o) => o.patrocinadorId === 'colmena');
    expect(offered).toBeDefined();

    const signed = engine.apply(second.state, { type: 'aceptarContrato', issuer: 'player:1', patrocinadorId: 'colmena' } as BaseCommand);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    expect(sponsorsOf(signed.state)!.contratos).toHaveLength(1);
    // Can't sign twice.
    expect(engine.apply(signed.state, { type: 'aceptarContrato', issuer: 'player:1', patrocinadorId: 'colmena' } as BaseCommand).ok).toBe(false);
  });

  it('a deal not met by the end of its floor fines coins and costs affinity', () => {
    let s = game([W('willy', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 })], ['...~']);
    s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, resources: { ...s.entities.willy!.resources, fichas: { current: 100, max: 99999 } } } } };
    const base = pushIntoVoid(s).state;
    const sp = sponsorsOf(base)!;
    s = withSystem(base, 'patrocinadores', { ...sp, contratos: [{ patrocinadorId: 'colmena', contratoId: 'salto-de-fe', progreso: 0, cantidad: 2, piso: 1 }] });
    const out = showAfterCommand(willy, s, [{ type: 'floorExited', metodo: 'escalera', relojRestantePct: 50, planta: 1 } as GameEvent], new RngCursor(s.rng));
    const broken = of(out.events, 'sponsorDealBroken')[0];
    expect(broken).toMatchObject({ patrocinadorId: 'colmena', contratoId: 'salto-de-fe', motivo: 'plazo', multa: 10 });
    expect(of(out.events, 'coinsGranted')[0]).toMatchObject({ amount: -10 });
    expect(of(out.events, 'sponsorMessage').some((m) => m.tipo === 'roto')).toBe(true);
    expect(of(out.events, 'sponsorAffinityChanged').find((a) => a.patrocinadorId === 'colmena')!.delta).toBe(-10);
  });
});

describe('Willy show: the presenter\'s Share', () => {
  const presenter = () => rat('jefe-presentador', 3, 0, { vida: 40, tags: ['jefe'] });

  it('while he has Share he stays at 1 health; at 0 he can be beaten', () => {
    let s = game([W('willy', 'butanero', 0, 0), presenter()], ['........']);
    s = withSystem(s, 'share', { valor: 30, max: 100 });
    const r = new Resolver(willy, s, new RngCursor(s.rng));
    dealDamage(r, 'jefe-presentador', 999, 'golpe', 'willy');
    expect(r.state.entities['jefe-presentador']!.resources.vida!.current).toBe(1);
    expect(r.events.some((e) => e.type === 'enAntena')).toBe(true);
    expect(r.events.some((e) => e.type === 'entityDefeated')).toBe(false);

    const zero = withSystem(s, 'share', { valor: 0, max: 100 });
    const r0 = new Resolver(willy, zero, new RngCursor(zero.rng));
    dealDamage(r0, 'jefe-presentador', 999, 'golpe', 'willy');
    expect(r0.events.some((e) => e.type === 'entityDefeated')).toBe(true);
  });

  it('spectacle drains his Share, but only during his fight', () => {
    let s = game([W('willy', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 }), presenter()], ['...~....']);
    s = withSystem(s, 'share', { valor: 50, max: 100 });
    // Out of his fight nothing changes.
    expect(shareOf(pushIntoVoid(s).state)!.valor).toBe(50);
    s = withSystem(inCombat(s, 'willy'), 'share', { valor: 50, max: 100 });
    const { state, events } = pushIntoVoid(s);
    expect(shareOf(state)!.valor).toBeLessThan(50);
    expect(of(events, 'meterChanged')[0]).toMatchObject({ medidor: 'share', de: 50 });
  });
});

function freshish() {
  return { valor: 1000, pico: 1000, hitos: [], vistos: [], recientes: [], turno: 0, pisos: [], primas: [], habilidades: [], turnoWilly: { activo: false, actuo: false, interesante: false }, ultimaAccion: null, aburrido: 0, gansos: 0, vidaInicio: null, viral: null, tramo: 1 };
}
