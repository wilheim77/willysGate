import { describe, expect, it } from 'vitest';
import { RngCursor, SYSTEM_ISSUER, hasCondition, surfaceAt } from '../../engine';
import { WILLY_CREATION, buildWilly, createWilly, defaultCreation, defence, skillLevel, willy } from '../../rulesets/willy';
import { W, engine, game, rat, until } from './willy-helpers';


describe('Willy: character numbers', () => {
  it('a level-1 Butanero matches RULESET.md (24 vida, 5 energía, DEF 13, 5 casillas)', () => {
    const w = W('willy', 'butanero', 0, 0);
    expect(w.stats.fue).toBe(8);
    expect(w.resources.vida).toEqual({ current: 24, max: 24 });
    expect(w.resources.energia).toEqual({ current: 5, max: 5 });
    expect(w.resources.acciones).toEqual({ current: 2, max: 2 });
    expect(defence(w)).toBe(13);
    expect(willy.movementBudget(w, game([w]))).toBe(5);
    expect(w.tags).toEqual(expect.arrayContaining(['pc', 'humano', 'clase:butanero', 'rasgo:terco-como-una-mula', 'rasgo:hablar-del-tiempo', 'rasgo:riesgo-laboral']));
  });

  it('creatures keep the DEF and to-hit numbers from the floor data', () => {
    const r = rat('r', 0, 0);
    expect(defence(r)).toBe(10);
    expect(willy.movementBudget(r, game([r]))).toBe(5);
  });

  it('casting only picks a class and three free points; Willy is always human', () => {
    expect(WILLY_CREATION.steps.map((s) => s.id)).toEqual(['clase', 'puntos']);
    const pick = WILLY_CREATION.steps[0]!;
    expect(pick.kind === 'pick' && pick.options.length).toBe(9);
    const w = buildWilly(defaultCreation(), { id: 'willy', controllerId: 'player:1', factionId: 'concursantes', position: { x: 0, y: 0 } });
    expect(w.tags).toContain('humano');
    expect(w.spriteId).toBe('willy-butanero');
    expect(() => buildWilly({ clase: 'butanero', puntos: { fue: 3, agi: 3 } }, { id: 'w', controllerId: 'p', factionId: 'f', position: { x: 0, y: 0 } })).toThrow();
  });
});

describe('Willy: checks', () => {
  it('d20 + attribute vs DIF, with the odds from the RULESET table', () => {
    const w = createWilly({ id: 'w', controllerId: 'p', factionId: 'f', position: { x: 0, y: 0 }, spriteId: 'w', classId: 'socorrista', points: { fue: 0 } });
    // Socorrista FUE = 5 + 1 = 6: DIF 16 needs a 10 → 55 %.
    const s = game([w]);
    expect(willy.describeCheck!(s, { actorId: 'w', check: 'fue', target: 16 }).chance).toBeCloseTo(0.55);
    expect(willy.describeCheck!(s, { actorId: 'w', check: 'fue', target: 10 }).chance).toBeCloseTo(0.85);
    const res = willy.resolveCheck(s, { actorId: 'w', check: 'convencer', target: 13 }, new RngCursor(s.rng));
    expect(res.targetLabel).toBe('DIF');
    expect(res.dice[0]!.sides).toBe(20);
  });

  it('a natural 20 always succeeds and a natural 1 always fails', () => {
    const w = W('w', 'butanero', 0, 0);
    const s = game([w]);
    const seen = new Set<string>();
    for (let a = 0; a < 400 && seen.size < 2; a++) {
      const r = willy.resolveCheck(s, { actorId: 'w', check: 'fue', target: a % 2 ? 40 : -10 }, new RngCursor({ ...s.rng, a }));
      const nat = r.dice[0]!.kept[0];
      if (nat === 20) { expect(r.success).toBe(true); seen.add('20'); }
      if (nat === 1) { expect(r.success).toBe(false); seen.add('1'); }
    }
    expect(seen.size).toBe(2);
  });
});

describe('Willy: environment is the strongest weapon', () => {
  it('a shove into a wall hurts (1d6) and counts as a use of Empujar', () => {
    const s = game([W('w', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 })], ['...#']);
    const { state, events } = until(s, 'w', 'basic:empujar', { entityId: 'r' }, (st) => st.entities.r!.resources.vida!.current < 30);
    expect(events.some((e) => e.type === 'collided')).toBe(true);
    expect(state.entities.w!.resources['uso:empujar']!.current).toBe(1);
  });

  it('a shove into the void eliminates a normal enemy: «fuera de plano»', () => {
    const s = game([W('w', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 })], ['...~']);
    const { state, events } = until(s, 'w', 'basic:empujar', { entityId: 'r' }, (st) => hasCondition(st.entities.r!, 'eliminado'));
    expect(events.find((e) => e.type === 'entityDefeated')).toMatchObject({ cause: 'fueraDePlano', actorId: 'w' });
    expect(willy.isStanding(state.entities.r!)).toBe(false);
  });

  it('bosses do not fall into the void: they lose 20 % of their health', () => {
    const boss = rat('jefe', 2, 0, { vida: 100, tags: ['jefe'] });
    const s = game([W('w', 'butanero', 1, 0), boss], ['...~']);
    // Bosses are big: DIF 8 + FUE + 5.
    const { state } = until(s, 'w', 'basic:empujar', { entityId: 'jefe' }, (st) => st.entities.jefe!.resources.vida!.current < 100);
    expect(state.entities.jefe!.resources.vida!.current).toBe(80);
    expect(willy.isStanding(state.entities.jefe!)).toBe(true);
  });

  it('a shove off a 3-level ledge: 2d6 falling damage and prone', () => {
    const s = game([W('w', 'butanero', 0, 0), rat('r', 1, 0, { vida: 30 })], ['33...']);
    const { state } = until(s, 'w', 'basic:empujar', { entityId: 'r' }, (st) => st.entities.r!.position.x === 2);
    expect(state.entities.r!.resources.vida!.current).toBeLessThan(30);
    expect(hasCondition(state.entities.r!, 'tumbado')).toBe(true);
  });

  it('the Funcionario cannot be moved: Plaza en propiedad', () => {
    const s = game([W('w', 'butanero', 0, 0), W('f', 'funcionario', 1, 0)]);
    expect(willy.previewAction(s, 'w', 'basic:empujar', { entityId: 'f' }).valid).toBe(false);
  });

  it('Empujar levels up after 4 uses with effect, and then pushes harder', () => {
    let w = W('w', 'butanero', 1, 0);
    w = { ...w, resources: { ...w.resources, 'uso:empujar': { current: 3, max: 99999 } } };
    const s = game([w, rat('r', 2, 0, { vida: 30 })]);
    const { events, state } = until(s, 'w', 'basic:empujar', { entityId: 'r' }, (st) => st.entities.r!.position.x === 3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'skillLevelUp', habilidad: 'empujar', nivel: 2 }));
    expect(skillLevel(state.entities.w!, 'empujar')).toBe(2);
  });
});

describe('Willy: surfaces', () => {
  it('fire runs along oil; water + lightning electrifies; fire + water makes steam', () => {
    let s = game([]);
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [0, 1, 2].map((x) => ({ x, y: 0 })), surface: 'aceite' }]).state;
    s = engine.applyEffects(s, [{ type: 'applyElement', tiles: [{ x: 0, y: 0 }], element: 'fuego' }]).state;
    expect([0, 1, 2].map((x) => surfaceAt(s, { x, y: 0 })?.type)).toEqual(['fuego', 'fuego', 'fuego']);
    s = engine.applyEffects(s, [{ type: 'applyElement', tiles: [{ x: 1, y: 0 }], element: 'agua' }]).state;
    expect(surfaceAt(s, { x: 1, y: 0 })?.type).toBe('vapor');
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 5, y: 0 }, { x: 6, y: 0 }], surface: 'agua' }, { type: 'applyElement', tiles: [{ x: 5, y: 0 }], element: 'rayo' }]).state;
    expect(surfaceAt(s, { x: 6, y: 0 })?.type).toBe('electrificada');
  });

  it('walking into fire sets you burning; water puts it out and soaks you', () => {
    const s = game([rat('r', 0, 0, { vida: 30 })]);
    const rng = new RngCursor(s.rng);
    const burn = willy.onSurface!(s, 'r', 'fuego', 'enter', rng);
    expect(burn.effects).toContainEqual(expect.objectContaining({ type: 'applyCondition', condition: 'ardiendo' }));
    const burning = engine.applyEffects(s, burn.effects).state;
    const wet = willy.onSurface!(burning, 'r', 'agua', 'enter', rng);
    expect(wet.effects).toContainEqual(expect.objectContaining({ type: 'removeCondition', condition: 'ardiendo' }));
    expect(wet.effects).toContainEqual(expect.objectContaining({ type: 'applyCondition', condition: 'empapado' }));
  });

  it('wet targets take double lightning damage, except a son of the Cantabrian sea', () => {
    const s0 = game([rat('r', 0, 0, { vida: 50 }), W('w', 'socorrista', 2, 0)]);
    const s = engine.applyEffects(s0, [{ type: 'applyCondition', entityId: 'r', condition: 'empapado' }, { type: 'applyCondition', entityId: 'w', condition: 'empapado' }]).state;
    const zap = (id: string) => {
      const o = willy.onSurface!(s, id, 'electrificada', 'enter', new RngCursor({ a: 1, b: 2, c: 3, d: 4 }));
      return -(o.effects.find((e) => e.type === 'modifyResource' && e.resource === 'vida') as { delta: number }).delta;
    };
    expect(zap('r') % 2).toBe(0);
    expect(zap('r')).toBeGreaterThanOrEqual(2 * 1);
    expect(zap('w')).toBeLessThanOrEqual(6);
  });
});

describe('Willy: turns', () => {
  it('burning hurts at the start of the turn; «Hablar del tiempo» costs an action in the first fight', () => {
    let s = game([W('w', 'butanero', 0, 0), rat('r', 5, 0)]);
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'w', condition: 'ardiendo' }]).state;
    const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['w', 'r'] } as never);
    if (!r.ok) throw new Error(r.error.code);
    let t = r.state;
    for (let i = 0; i < 3 && t.turn.activeEntityId !== 'w'; i++) {
      const n = engine.apply(t, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: t.turn.activeEntityId! } as never);
      if (!n.ok) throw new Error(n.error.code);
      t = n.state;
    }
    expect(t.entities.w!.resources.vida!.current).toBeLessThan(24);
    expect(t.entities.w!.resources.acciones!.current).toBe(1);
    expect(t.flags[`willy:tiempo:${t.map.id}`]).toBe(true);
  });

  it('energy comes back when the fight ends', () => {
    let s = game([W('w', 'butanero', 0, 0), rat('r', 1, 0, { vida: 1 })]);
    s = engine.applyEffects(s, [{ type: 'modifyResource', entityId: 'w', resource: 'energia', delta: -5 }]).state;
    const o = willy.onCombatEnd!(s, 'concursantes');
    expect(o.effects).toContainEqual({ type: 'modifyResource', entityId: 'w', resource: 'energia', delta: 5 });
  });
});

describe('Willy: rules maths (RULESET.md)', () => {
  it('the DIF table: with attribute 6, DIF 10/13/16/20/25 → 85/70/55/35/10 %', () => {
    const w = createWilly({ id: 'w', controllerId: 'p', factionId: 'f', position: { x: 0, y: 0 }, spriteId: 'w', classId: 'socorrista' });
    const s = game([w]);
    const chances = [10, 13, 16, 20, 25].map((dif) => willy.describeCheck!(s, { actorId: 'w', check: 'fue', target: dif }).chance);
    chances.forEach((c, i) => expect(c).toBeCloseTo([0.85, 0.7, 0.55, 0.35, 0.1][i]!));
  });

  it('skills level up at exactly 4, 12, 25 and 45 uses', () => {
    const w = W('w', 'butanero', 0, 0);
    const at = (uses: number) => skillLevel({ ...w, resources: { ...w.resources, 'uso:empujar': { current: uses, max: 99999 } } }, 'empujar');
    expect([0, 3, 4, 11, 12, 24, 25, 44, 45, 99].map(at)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('attacks: a natural 20 is a critical hit and a natural 1 always misses (forced RNG)', () => {
    const s = game([W('w', 'butanero', 0, 0), rat('r', 1, 0, { vida: 99, def: 30 })]);
    const seen = { crit: false, fumble: false };
    for (let a = 0; a < 2000 && !(seen.crit && seen.fumble); a++) {
      const o = willy.performAction(s, 'w', 'basic:golpe', { entityId: 'r' }, new RngCursor({ a, b: 1, c: 2, d: 3 }));
      const roll = o.events.find((e) => e.type === 'attackRolled') as { natural: number; hit: boolean; crit: boolean } | undefined;
      if (roll?.natural === 20) {
        expect(roll.hit && roll.crit).toBe(true);
        seen.crit = true;
      }
      if (roll?.natural === 1) {
        expect(roll.hit).toBe(false);
        seen.fumble = true;
      }
    }
    expect(seen).toEqual({ crit: true, fumble: true });
  });

  it('performAction is deterministic for the same state and RNG', () => {
    const s = game([W('w', 'butanero', 0, 0), rat('a', 3, 0, { vida: 30 })]);
    const run = () => willy.performAction(s, 'w', 'hab:lanzar-bombona', { tile: { x: 3, y: 0 } }, new RngCursor({ a: 5, b: 6, c: 7, d: 8 }));
    expect(run()).toEqual(run());
  });

  it('hidden targets cannot be picked (the AI respects it)', () => {
    let s = game([W('w', 'butanero', 0, 0), rat('r', 1, 0)]);
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'r', condition: 'escondido' }]).state;
    expect(willy.previewAction(s, 'w', 'basic:golpe', { entityId: 'r' }).valid).toBe(false);
  });
});
