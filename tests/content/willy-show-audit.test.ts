import { describe, expect, it } from 'vitest';
import { type GameEvent, type GameState, type JsonValue, OBJECT_TAG, RngCursor, SYSTEM_ISSUER } from '../../engine';
import { willy } from '../../rulesets/willy';
import { audienceOf, showAfterCommand, sponsorsOf } from '../../rulesets/willy/show';
import '../../content/willy/setup';
import { W, engine, game, rat } from '../rulesets/willy-helpers';

/** Show items from the design audit (DESIGN.md §6, classes.json, items.json). */

const of = (events: GameEvent[], type: string) => events.filter((e) => e.type === type) as unknown as Record<string, unknown>[];
const run = (s: GameState, events: GameEvent[]) => showAfterCommand(willy, s, events, new RngCursor(s.rng));
const withSystem = (s: GameState, k: string, v: unknown): GameState => ({ ...s, systems: { ...s.systems, [k]: v as JsonValue } });

function inCombat(s: GameState): GameState {
  const ids = Object.values(s.entities).filter((e) => !e.tags.includes(OBJECT_TAG)).map((e) => e.id);
  const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ids } as never);
  if (!r.ok) throw new Error(r.error.code);
  return r.state;
}

describe('Show audit: boxes and the clock', () => {
  it('«Al filo»: leaving by the stairs with <=10 % of the clock pays a bronze box', () => {
    const s = game([W('willy', 'butanero', 0, 0)]);
    const out = run(s, [{ type: 'floorExited', metodo: 'escalera', relojRestantePct: 8, planta: 1 } as GameEvent]);
    expect(of(out.events, 'audienceBonus').some((b) => b.alFilo === true)).toBe(true);
    expect(of(out.events, 'boxDelivered').some((b) => String(b.motivo).startsWith('al-filo'))).toBe(true);
    const calm = run(s, [{ type: 'floorExited', metodo: 'escalera', relojRestantePct: 40, planta: 1 } as GameEvent]);
    expect(of(calm.events, 'audienceBonus').some((b) => b.alFilo === true)).toBe(false);
  });

  it('boredom counts the floor clock: 30 s gone with nothing happening costs 1 %', () => {
    let s = game([W('willy', 'butanero', 0, 0)]);
    s = { ...s, map: { ...s.map, id: 'planta-1' } };
    s = withSystem(s, 'clock', { remaining: 600, total: 900 });
    s = withSystem(s, 'audiencia', { valor: 2000, reloj: 600 });
    const later = withSystem(s, 'clock', { remaining: 565, total: 900 });
    const out = run(later, [{ type: 'noop' } as GameEvent]);
    expect(of(out.events, 'audienceChanged')[0]).toMatchObject({ causa: 'aburrimiento', delta: -20 });
  });
});

describe('Show audit: class abilities and items', () => {
  it('the Mimo only mimes: «Hacer el ganso» gives half', () => {
    const mimo = inCombat(game([W('willy', 'mimo', 0, 0), rat('r', 6, 0)], ['........']));
    const butanero = inCombat(game([W('willy', 'butanero', 0, 0), rat('r', 6, 0)], ['........']));
    const gain = (s: GameState) => Number(of(run(s, [{ type: 'showOff', entityId: 'willy' } as GameEvent]).events, 'audienceChanged').find((c) => c.causa === 'ganso')?.delta ?? 0);
    const car = (s: GameState) => 1 + 0.05 * (s.entities.willy!.stats.car ?? 5);
    expect(gain(mimo) / car(mimo)).toBeCloseTo(gain(butanero) / car(butanero) / 2, 0);
  });

  it('the Bardo repeating a song loses audience («Repertorio corto»)', () => {
    let s = game([W('willy', 'bardo-de-verbena', 0, 0)]);
    s = withSystem(s, 'audiencia', { valor: 5000 });
    const out = run(s, [{ type: 'traitTriggered', entityId: 'willy', rasgo: 'repertorio-corto' } as GameEvent]);
    expect(of(out.events, 'audienceChanged')[0]).toMatchObject({ causa: 'repertorio-corto', delta: -200 });
  });

  it('the Influencer\'s «Unboxing» pays per silver-or-better item', () => {
    const s = game([W('willy', 'influencer', 0, 0)]);
    expect(s.entities.willy!.tags).toContain('rasgo:unboxing');
    const out = run(s, [{ type: 'boxOpened', caja: 'plata', objetos: [{ rareza: 'plata' }, { rareza: 'bronce' }, { rareza: 'oro' }] } as unknown as GameEvent]);
    expect(of(out.events, 'audienceChanged').some((c) => c.causa === 'unboxing')).toBe(true);
  });

  it('the Share embotellado adds 25 % of the audience', () => {
    let s = game([W('willy', 'butanero', 0, 0)]);
    s = withSystem(s, 'audiencia', { valor: 4000 });
    const out = run(s, [{ type: 'itemUsed', item: 'share-embotellado', actorId: 'willy' } as GameEvent]);
    expect(of(out.events, 'audienceChanged')[0]).toMatchObject({ causa: 'share-embotellado', delta: 1000 });
  });

  it('the «Especial de audiencia» aviso multiplies the next floor by 1.5, then is spent', () => {
    let s = game([W('willy', 'butanero', 0, 0)]);
    s = { ...s, map: { ...s.map, id: 'planta-1' }, flags: { ...s.flags, 'mod:especialAudiencia': 1 } };
    s = { ...s, ...applied(s, run(s, [{ type: 'noop' } as GameEvent]).effects) };
    expect(audienceOf(s)!.especial).toMatchObject({ desde: 1, piso: null });
    // Arriving on floor 2.
    let t: GameState = { ...s, map: { ...s.map, id: 'planta-2' } };
    t = applied(t, run(t, [{ type: 'mapChanged', from: 'planta-1', to: 'planta-2' } as GameEvent]).effects);
    expect(audienceOf(t)!.especial).toMatchObject({ piso: 2 });
    const out = run(t, [{ type: 'floorExited', metodo: 'escalera', relojRestantePct: 50, planta: 2 } as GameEvent]);
    const after = applied(t, out.effects);
    expect(audienceOf(after)!.especial ?? null).toBeNull();
    expect(after.flags['mod:especialAudiencia']).toBe(0);
  });
});

function applied(s: GameState, effects: unknown[]): GameState {
  let out = s;
  for (const e of effects as { type: string; system?: string; value?: unknown; flag?: string }[]) {
    if (e.type === 'setSystem') out = { ...out, systems: { ...out.systems, [e.system!]: e.value as JsonValue } };
    if (e.type === 'setFlag') out = { ...out, flags: { ...out.flags, [e.flag!]: e.value as never } };
  }
  return out;
}

describe('Show audit: sponsor gifts', () => {
  it('in combat a gift waits for the end of the round (parachute); out of combat it arrives at once', () => {
    let s = inCombat(game([W('willy', 'butanero', 0, 0), rat('r', 6, 0)], ['........']));
    s = withSystem(s, 'audiencia', { valor: 5000 });
    const out = run(s, [{ type: 'noop' } as GameEvent]);
    let st = applied(s, out.effects);
    const sp = sponsorsOf(st)!;
    // Colmena at 49: the next fall pushes it past 50 (aFavor → gift).
    st = withSystem(st, 'patrocinadores', { ...sp, porId: { ...sp.porId, colmena: { ...sp.porId.colmena!, afinidad: 49, estado: 'interesado', mirando: true } } });
    const fall = run(st, [{ type: 'entityFell', entityId: 'r', levels: 2 } as GameEvent]);
    expect(of(fall.events, 'sponsorGiftIncoming')).toHaveLength(1);
    expect(of(fall.events, 'sponsorGift')).toHaveLength(0);
    let next = applied(st, fall.effects);
    next = { ...next, turn: { ...next.turn, round: next.turn.round + 1 } };
    const dropped = run(next, [{ type: 'turnStarted', entityId: 'willy', round: next.turn.round } as GameEvent]);
    expect(of(dropped.events, 'sponsorGift')).toHaveLength(1);
  });
});

describe('Show audit: hooks for the Willy agent\'s rules', () => {
  it('«Charanga» (event from the ruleset) gives audience', () => {
    const s = inCombat(game([W('willy', 'bardo-de-verbena', 0, 0), rat('r', 6, 0)], ['........']));
    expect(of(run(s, [{ type: 'charanga', entityId: 'willy' } as GameEvent]).events, 'audienceChanged').some((c) => c.causa === 'charanga')).toBe(true);
  });

  it('«Canción del verano» only pays at Maestría (level 5)', () => {
    const s = inCombat(game([W('willy', 'bardo-de-verbena', 0, 0), rat('r', 6, 0)], ['........']));
    const song = { type: 'cancionDelVerano', entityId: 'willy', enemigos: 2 } as GameEvent;
    expect(of(run(s, [song]).events, 'audienceChanged').some((c) => c.causa === 'cancion-del-verano-maestria')).toBe(false);
    const master = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, resources: { ...s.entities.willy!.resources, 'uso:cancion-del-verano': { current: 999, max: 99999 } } } } };
    expect(of(run(master, [song]).events, 'audienceChanged').some((c) => c.causa === 'cancion-del-verano-maestria')).toBe(true);
  });

  it('the «Carisma televisivo» perk adds 10 % to every gain', () => {
    const plain = inCombat(game([W('willy', 'butanero', 0, 0), rat('r', 6, 0)], ['........']));
    const perk = { ...plain, entities: { ...plain.entities, willy: { ...plain.entities.willy!, tags: [...plain.entities.willy!.tags, 'rasgo:carisma-televisivo'] } } };
    const gain = (s: GameState) => Number(of(run(s, [{ type: 'showOff', entityId: 'willy' } as GameEvent]).events, 'audienceChanged')[0]?.delta ?? 0);
    expect(gain(perk) / gain(plain)).toBeCloseTo(1.1, 1);
  });
});
