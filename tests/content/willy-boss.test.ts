import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, type JsonValue, RngCursor, SYSTEM_ISSUER, lightLevelAt, storedLighting } from '../../engine';
import { willy } from '../../rulesets/willy';
import { HANDLERS, listActions } from '../../rulesets/willy/actions';
import { Resolver, dealDamage } from '../../rulesets/willy/resolve';
import { type BossFight, bossAfterCommand, bossFightOf, bossLit, showAfterCommand } from '../../rulesets/willy/show';
import { SHOW } from '../../content/willy/show';
import { W, engine, game, rat } from '../rulesets/willy-helpers';

/** The final boss's phases (rulesets/willy/show/boss.ts, content/willy/data/jefe-final.json). */

const BOSS = 'jefe-presentador';
const of = (events: GameEvent[], type: string) => events.filter((e) => e.type === type) as unknown as Record<string, unknown>[];
const rows = Array.from({ length: 9 }, () => '.........');

let started: GameEvent[] = [];

function fight(bossHp = 100): GameState {
  const s = game([W('willy', 'butanero', 4, 6, 10), rat(BOSS, 4, 2, { vida: 100, tags: ['jefe'] })], rows);
  const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['willy', BOSS] } as never);
  if (!r.ok) throw new Error(r.error.code);
  const st = r.state;
  started = r.events;
  const b = st.entities[BOSS]!;
  return { ...st, entities: { ...st.entities, [BOSS]: { ...b, resources: { ...b.resources, vida: { current: bossHp, max: 100 } } } } };
}

function step(state: GameState, events: GameEvent[] = []): { state: GameState; events: GameEvent[] } {
  const out = bossAfterCommand(willy, state, events, new RngCursor(state.rng));
  return { state: applyAll(state, out.effects), events: out.events };
}

function applyAll(state: GameState, effects: Parameters<Resolver['apply']>): GameState {
  const r = new Resolver(willy, state, new RngCursor(state.rng));
  r.apply(...effects);
  return r.state;
}

const withFight = (s: GameState, f: Partial<BossFight>) => ({ ...s, systems: { ...s.systems, jefeFinal: { ...bossFightOf(s)!, ...f } as unknown as JsonValue } });

describe('Final boss: phases', () => {
  it('starts in the Ronda de preguntas and goes dark at 66 %: Pausa publicitaria with spotlights', () => {
    let s = fight();
    // Starting the fight (engine command → afterCommand) opens the Ronda de preguntas.
    expect(of(started, 'bossPhase')[0]).toMatchObject({ jefe: BOSS, fase: 1 });
    expect(of(started, 'bossLine').length).toBe(1);
    const b = s.entities[BOSS]!;
    s = { ...s, entities: { ...s.entities, [BOSS]: { ...b, resources: { ...b.resources, vida: { current: 60, max: 100 } } } } };
    const dark = step(s);
    expect(of(dark.events, 'bossPhase')).toEqual(expect.arrayContaining([expect.objectContaining({ fase: 2, nombre: 'Pausa publicitaria' })]));
    const f = bossFightOf(dark.state)!;
    expect(f.fase).toBe(2);
    expect(f.focos).toHaveLength(SHOW.boss!.pausaPublicitaria.focos);
    expect(storedLighting(dark.state).ambient).toBeCloseTo(SHOW.boss!.pausaPublicitaria.ambiente);
    // Back to the light at 33 %: the Gran final.
    const g = dark.state.entities[BOSS]!;
    const final = step({ ...dark.state, entities: { ...dark.state.entities, [BOSS]: { ...g, resources: { ...g.resources, vida: { current: 30, max: 100 } } } } });
    expect(bossFightOf(final.state)!.fase).toBe(3);
    expect(storedLighting(final.state).ambient).toBeGreaterThan(SHOW.boss!.pausaPublicitaria.ambiente);
  });

  it('in the dark he takes no damage unless lit; under a spotlight it is ×1.5', () => {
    let s = step(fight(60)).state;
    s = step(s).state;
    expect(bossFightOf(s)!.fase).toBe(2);
    const dark = new Resolver(willy, withFight(s, { movil: null }), new RngCursor(s.rng));
    expect(bossLit(dark.state)).toBe(false);
    expect(dealDamage(dark, BOSS, 10, 'golpe', 'willy')).toBe(0);
    expect(dark.events.some((e) => e.type === 'bossInDark')).toBe(true);
    // A spotlight on him.
    const boss = s.entities[BOSS]!;
    const f = bossFightOf(s)!;
    const lit = withFight(s, { focos: [{ id: 'foco-0', position: boss.position, hasta: 99 }, ...f.focos.slice(1)] });
    const relit = step(lit, [{ type: 'spotlightOn' } as GameEvent]).state;
    expect(lightLevelAt(relit, boss.position)).toBeGreaterThanOrEqual(SHOW.boss!.pausaPublicitaria.umbralLuz);
    const r = new Resolver(willy, relit, new RngCursor(relit.rng));
    expect(dealDamage(r, BOSS, 10, 'golpe', 'willy')).toBe(15);
  });

  it('a question lights three tiles; at the end of the next round the false ones open', () => {
    let s = step(fight()).state;
    // Round 2 ends: the question.
    s = { ...s, turn: { ...s.turn, round: 2 } };
    const asked = step(s);
    const q = of(asked.events, 'bossQuestion')[0]!;
    expect(q).toBeDefined();
    const opciones = q.opciones as { respuesta: string; position: { x: number; y: number } }[];
    expect(opciones).toHaveLength(3);
    const f = bossFightOf(asked.state)!;
    const wrong = f.pregunta!.baldosas.find((b) => !b.correcta)!;
    // Willy waits on a false tile.
    let t = asked.state;
    t = { ...t, entities: { ...t.entities, willy: { ...t.entities.willy!, position: wrong.position } }, turn: { ...t.turn, round: 3 } };
    const before = t.entities.willy!.resources.vida!.current;
    const opened = step(t);
    expect(of(opened.events, 'trapdoorOpened')[0]).toMatchObject({ entityId: 'willy' });
    expect(opened.state.entities.willy!.resources.vida!.current).toBeLessThan(before);
    expect(opened.state.entities.willy!.conditions.some((c) => c.id === 'tumbado')).toBe(true);
  });

  it('a right answer puts him under a spotlight for a round (+50 %)', () => {
    let s = step(fight()).state;
    s = step({ ...s, turn: { ...s.turn, round: 2 } }).state;
    const good = bossFightOf(s)!.pregunta!.baldosas.find((b) => b.correcta)!;
    s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, position: good.position } }, turn: { ...s.turn, round: 3 } };
    const out = step(s);
    expect(of(out.events, 'trapdoorOpened')).toHaveLength(0);
    expect(bossLit(out.state)).toBe(true);
    const r = new Resolver(willy, out.state, new RngCursor(out.state.rng));
    expect(dealDamage(r, BOSS, 10, 'golpe', 'willy')).toBe(15);
  });

  it('«Encender foco» appears next to a spotlight that is off, and switches it on', () => {
    let s = step(fight(60)).state;
    s = step(s).state;
    const foco = bossFightOf(s)!.focos[0]!;
    const next = { x: foco.position.x + (foco.position.x > 0 ? -1 : 1), y: foco.position.y };
    s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, position: next } }, turn: { ...s.turn, activeEntityId: 'willy', order: ['willy', BOSS] } };
    expect(listActions(s, 'willy').map((a) => a.id)).toContain('show:encender-foco');
    expect(HANDLERS['show:encender-foco']).toBeDefined();
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'willy', actionId: 'show:encender-foco', target: {} } as BaseCommand);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(of(r.events, 'spotlightOn')[0]).toMatchObject({ focoId: foco.id });
    expect(lightLevelAt(r.state, foco.position)).toBeGreaterThanOrEqual(SHOW.boss!.pausaPublicitaria.umbralLuz);
  });

  it('his hits on Willy in the dark bite the audience into his Share', () => {
    let s = step(fight(60)).state;
    s = step(s).state;
    s = { ...s, systems: { ...s.systems, share: { valor: 40, max: 100 } as unknown as JsonValue } };
    const hit = { type: 'attackRolled', attackerId: BOSS, targetId: 'willy', hit: true, crit: false } as GameEvent;
    const bite = step(s, [hit]);
    expect(of(bite.events, 'shareStolen')[0]).toMatchObject({ pct: SHOW.boss!.pausaPublicitaria.mordiscoPct });
    const show = showAfterCommand(willy, bite.state, [hit, ...bite.events], new RngCursor(bite.state.rng));
    expect(of(show.events, 'audienceChanged').some((c) => c.causa === 'mordisco')).toBe(true);
  });

  it('the audience vote only drains the Share in the Gran final', () => {
    let s = step(fight()).state;
    s = { ...s, systems: { ...s.systems, share: { valor: 40, max: 100 } as unknown as JsonValue } };
    const turn = { type: 'turnStarted', entityId: BOSS } as GameEvent;
    expect(of(showAfterCommand(willy, s, [turn], new RngCursor(s.rng)).events, 'audienceVote')).toHaveLength(0);
    const final = withFight(s, { fase: 3 });
    expect(of(showAfterCommand(willy, final, [turn], new RngCursor(final.rng)).events, 'audienceVote')).toHaveLength(1);
  });
});

describe('Final boss: the end', () => {
  it('his defeat gets his last line (bossLine momento derrotado) and the lights come back', () => {
    let s = step(fight(60)).state;
    s = step(s).state;
    const b = s.entities[BOSS]!;
    const down = { ...s, entities: { ...s.entities, [BOSS]: { ...b, resources: { ...b.resources, vida: { current: 0, max: 100 } }, conditions: [...b.conditions, { id: 'eliminado' }] } } };
    const out = step(down, [{ type: 'entityDefeated', entityId: BOSS, cause: 'golpe' } as GameEvent]);
    expect(of(out.events, 'bossLine')[0]).toMatchObject({ momento: 'derrotado' });
    expect(bossFightOf(out.state) ?? null).toBeNull();
    expect(storedLighting(out.state).ambient).toBeGreaterThan(SHOW.boss!.pausaPublicitaria.ambiente);
  });
});

describe('Final boss: the Gran final and «Sin reflejo»', () => {
  function granFinal(): GameState {
    let s = step(fight(60)).state;
    s = step(s).state;
    const b = s.entities[BOSS]!;
    return step({ ...s, entities: { ...s.entities, [BOSS]: { ...b, resources: { ...b.resources, vida: { current: 30, max: 100 } } } } }).state;
  }

  it('the lighting rig hangs over him; from its rope it drops once: 2d6 and Aturdido to whoever is under it', () => {
    const s = granFinal();
    const rig = bossFightOf(s)!.parrilla!;
    expect(rig).toBeTruthy();
    expect(rig.centro).toEqual(s.entities[BOSS]!.position);
    let t: GameState = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, position: rig.cuerda } }, turn: { ...s.turn, activeEntityId: 'willy', order: ['willy', BOSS] } };
    t = { ...t, systems: { ...t.systems, share: { valor: 0, max: 100 } as unknown as JsonValue } };
    expect(listActions(t, 'willy').map((a) => a.id)).toContain('show:derribar-parrilla');
    const before = t.entities[BOSS]!.resources.vida!.current;
    const r = engine.apply(t, { type: 'act', issuer: 'player:1', entityId: 'willy', actionId: 'show:derribar-parrilla', target: {} } as BaseCommand);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(of(r.events, 'rigDropped')[0]).toMatchObject({ afectados: [BOSS] });
    const boss = r.state.entities[BOSS]!;
    expect(boss.resources.vida!.current).toBeLessThan(before);
    expect(boss.conditions.some((c) => c.id === 'aturdido') || boss.resources.vida!.current <= 0).toBe(true);
    // Once only.
    expect(bossFightOf(r.state)!.parrilla!.usada).toBe(true);
    expect(listActions(r.state, 'willy').map((a) => a.id)).not.toContain('show:derribar-parrilla');
  });

  it('«Sin reflejo»: nothing he does gives anyone audience (a crit of his on Willy, for one)', () => {
    const s = granFinal();
    const crit = { type: 'attackRolled', attackerId: BOSS, targetId: 'willy', hit: true, crit: true } as GameEvent;
    const theirs = showAfterCommand(willy, s, [crit], new RngCursor(s.rng));
    expect(of(theirs.events, 'audienceChanged').filter((c) => Number(c.delta) > 0)).toHaveLength(0);
    // The same «drama» from anyone else does count.
    const other = { ...s, entities: { ...s.entities, r: rat('r', 0, 0) } };
    const mine = showAfterCommand(willy, other, [{ ...crit, attackerId: 'r' } as GameEvent], new RngCursor(s.rng));
    expect(of(mine.events, 'audienceChanged').some((c) => c.causa === 'drama')).toBe(true);
  });
});
