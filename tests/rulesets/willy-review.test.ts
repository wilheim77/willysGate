import { describe, expect, it } from 'vitest';
import { type ActionTarget, type Entity, type GameState, OBJECT_TAG, OBSTACLE_TAG, RngCursor, SYSTEM_ISSUER, hasCondition, nextAiCommand } from '../../engine';
import { CLASSES, willy } from '../../rulesets/willy';
import { W, engine, game, rat, until } from './willy-helpers';

const crate = (id: string, x: number, y: number): Entity => ({ ...rat(id, x, y, { vida: 20 }), tags: [OBJECT_TAG, OBSTACLE_TAG] });

describe('review 4 fixes', () => {
  it('Empujar: the preview chance and the real roll use the same numbers, also for creatures', () => {
    const pusher = rat('p', 1, 0, { fue: 9 });
    const s = game([{ ...pusher, controllerId: 'player:1' }, rat('r', 2, 0, { fue: 4, vida: 30 })]);
    const p = willy.previewAction(s, 'p', 'basic:empujar', { entityId: 'r' });
    // FUE 9 vs DIF 8 + 4 = 12: needs a 3 → 90 %.
    expect(p.chance).toBeCloseTo(0.9);
    const o = willy.performAction(s, 'p', 'basic:empujar', { entityId: 'r' }, new RngCursor(s.rng));
    const roll = o.events.find((e) => e.type === 'shoveRolled') as unknown as { roll: { target: number; modifiers: { value: number }[] } };
    expect(roll.roll.target).toBe(12);
    expect(roll.roll.modifiers.reduce((a, m) => a + m.value, 0)).toBe(9);
    expect(o.events.some((e) => e.type === 'saveRolled')).toBe(false);
  });

  it('shove previews tell the AI what the environment would do (the void takes the target out)', () => {
    const s = game([W('w', 'butanero', 1, 0), rat('r', 2, 0, { vida: 30 })], ['...~']);
    const p = willy.previewAction(s, 'w', 'basic:empujar', { entityId: 'r' });
    expect(p.expectedDamage).toBeCloseTo(p.chance! * 30);
    expect(p.breakdown).toContainEqual(expect.objectContaining({ label: 'Consecuencia', value: '¡fuera de plano!' }) as never);
  });

  it('the AI pushes an enemy into the void instead of just hitting it', () => {
    const brute = { ...rat('brute', 1, 0, { fue: 12, vida: 30, ataque: 4 }), controllerId: 'ai' };
    const victim = { ...W('w', 'butanero', 2, 0), factionId: 'concursantes' };
    let s = game([brute, victim], ['....~']);
    const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['brute', 'w'] } as never);
    if (!r.ok) throw new Error(r.error.code);
    s = { ...r.state, turn: { ...r.state.turn, order: ['brute', 'w'], activeEntityId: 'brute', movementUsed: 0 } };
    s = { ...s, entities: { ...s.entities, w: { ...s.entities.w!, position: { x: 3, y: 0 } }, brute: { ...s.entities.brute!, position: { x: 2, y: 0 }, resources: { ...s.entities.brute!.resources, acciones: { current: 2, max: 2 } } } } };
    const cmd = nextAiCommand(willy, s, 'brute') as unknown as { type: string; actionId?: string };
    expect(cmd).toMatchObject({ type: 'act', actionId: 'basic:empujar' });
  });

  it('cover: one crate in between −2, two −5; adjacent attacks ignore it', () => {
    const shooter = { ...W('b', 'jugador-de-basket', 0, 0) };
    const one = game([shooter, crate('c1', 2, 0), rat('r', 4, 0)]);
    expect(willy.previewAction(one, 'b', 'hab:pase-picado', { entityId: 'r' }).breakdown).toContainEqual(expect.objectContaining({ label: 'Cubierto a medias', value: '-2' }) as never);
    const two = game([shooter, crate('c1', 1, 0), crate('c2', 2, 0), rat('r', 4, 0)]);
    expect(willy.previewAction(two, 'b', 'hab:pase-picado', { entityId: 'r' }).breakdown).toContainEqual(expect.objectContaining({ label: 'Cubierto del todo', value: '-5' }) as never);
  });

  it('afortunado is spent on the next attack; escondido is lost by attacking', () => {
    let s = game([W('w', 'butanero', 0, 0), rat('r', 1, 0, { vida: 40 })]);
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'w', condition: 'afortunado' }, { type: 'applyCondition', entityId: 'w', condition: 'escondido' }]).state;
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'w', actionId: 'basic:golpe', target: { entityId: 'r' } } as never);
    if (!r.ok) throw new Error(r.error.message);
    expect(hasCondition(r.state.entities.w!, 'afortunado')).toBe(false);
    expect(hasCondition(r.state.entities.w!, 'escondido')).toBe(false);
  });

  it('petrified creatures take no damage; Willy is immune to fear (Terco como una mula)', () => {
    let s = game([W('w', 'butanero', 0, 0), rat('r', 1, 0, { vida: 40 })]);
    s = engine.applyEffects(s, [{ type: 'applyCondition', entityId: 'r', condition: 'petrificado' }]).state;
    const o = willy.performAction(s, 'w', 'hab:lanzar-bombona', { tile: { x: 1, y: 0 } }, new RngCursor(s.rng));
    expect(o.events.some((e) => e.type === 'damageDealt' && (e as unknown as { targetId: string }).targetId === 'r')).toBe(false);
    expect(s.entities.w!.tags).toContain('inmune:asustado');
  });

  it('entangled lasts 2 turns (renewed while inside) and «Liberarse» gets you out', () => {
    const s = game([W('w', 'butanero', 0, 0)]);
    const o = willy.onSurface!(s, 'w', 'red', 'enter', new RngCursor(s.rng));
    expect(o.effects).toContainEqual(expect.objectContaining({ condition: 'enredado', remainingTurns: 2 }));
    const stuck = engine.applyEffects(s, o.effects).state;
    expect(willy.listActions(stuck, 'w').map((a) => a.id)).toContain('basic:liberarse');
    const { state } = until(stuck, 'w', 'basic:liberarse', {}, (st) => !hasCondition(st.entities.w!, 'enredado'));
    expect(willy.movementBudget(state.entities.w!, state)).toBeGreaterThan(0);
  });

  it('explosion previews warn when friends (or you) are in the blast', () => {
    const s = game([W('w', 'butanero', 0, 0), W('f', 'funcionario', 3, 0), rat('r', 4, 0)]);
    const p = willy.previewAction(s, 'w', 'hab:lanzar-bombona', { tile: { x: 4, y: 0 } });
    expect(p.breakdown).toContainEqual(expect.objectContaining({ label: '¡Cuidado! También alcanza a' }) as never);
  });
});

/** Candidate targets for an action: self, every entity, and every tile in range. */
function candidates(s: GameState, actorId: string, range: number): ActionTarget[] {
  const me = s.entities[actorId]!;
  const out: ActionTarget[] = [{}, ...Object.keys(s.entities).map((id) => ({ entityId: id }))];
  for (let y = 0; y < s.map.height; y++) for (let x = 0; x < s.map.width; x++) if (Math.max(Math.abs(x - me.position.x), Math.abs(y - me.position.y)) <= range) out.push({ tile: { x, y } });
  return out;
}

// Golpe de valor needs something in the bag (tests/content/willy-golpe-de-valor.test.ts).
const SITUATIONAL = new Set(['basic:liberarse', 'hab:bis', 'hab:actualizacion-de-firmware', 'hab:mate', 'hab:golpe-de-valor']);

describe('every ability of every class, at several levels', () => {
  const rows = ['..........', '....2.....', '..........', '..........'];
  for (const cls of Object.values(CLASSES)) {
    for (const level of [1, 3, 6, 9]) {
      it(`${cls.id} level ${level}: every listed action has a valid use that resolves`, () => {
        let s = game([W('w', cls.id, 3, 2, level), W('ally', 'butanero', 2, 2), rat('a', 4, 2, { vida: 60 }), rat('b', 6, 0, { vida: 60 }), rat('boss', 7, 3, { vida: 100, tags: ['jefe'] })], rows);
        const started = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['w', 'ally', 'a', 'b', 'boss'] } as never);
        if (!started.ok) throw new Error(started.error.code);
        s = { ...started.state, turn: { ...started.state.turn, order: ['w', ...started.state.turn.order.filter((x) => x !== 'w')], activeEntityId: 'w', movementUsed: 0 } };
        // Give the 5G line something to do at higher levels.
        const uses = { 1: 0, 3: 7, 6: 18, 9: 25 }[level as 1 | 3 | 6 | 9];
        const w = s.entities.w!;
        s = { ...s, entities: { ...s.entities, w: { ...w, conditions: [], resources: { ...w.resources, 'uso:red-g': { current: uses, max: 99999 }, acciones: { current: 2, max: 2 }, energia: { current: 20, max: 20 } } } } };
        const actions = willy.listActions(s, 'w');
        expect(actions.length).toBeGreaterThan(4);
        for (const action of actions) {
          // Situational ones (need a previous song, a summon, or a jump first) have their own tests.
          if (SITUATIONAL.has(action.id)) continue;
          const target = candidates(s, 'w', action.target.range).find((t) => willy.previewAction(s, 'w', action.id, t).valid);
          expect(target, `${cls.id} ${level} ${action.id} has no valid target`).toBeDefined();
          const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 'w', actionId: action.id, target: target! } as never);
          expect(r.ok, `${cls.id} ${level} ${action.id}: ${r.ok ? '' : r.error.message}`).toBe(true);
        }
      });
    }
  }
});
