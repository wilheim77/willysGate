import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, SYSTEM_ISSUER, hasCondition } from '../../engine';
import { CLASSES, COMPANIONS, companionStats, createCompanion, willy } from '../../rulesets/willy';
import { W, engine, game, rat } from './willy-helpers';

function party(classId: string, lvl = 1, foes: Entity[] = [rat('r', 2, 1, { vida: 60 }), rat('r2', 5, 1, { vida: 60 })]): GameState {
  const w = W('w', classId, 0, 1, lvl);
  const c = createCompanion(classId, w, { x: 1, y: 1 })!;
  const hurt = { ...w, resources: { ...w.resources, vida: { ...w.resources.vida!, current: 3 } } };
  return game([hurt, c, ...foes], ['........', '........', '........']);
}

const mateOf = (s: GameState) => Object.values(s.entities).find((e) => e.tags.includes('companero'))!;

describe('Willy: companions', () => {
  it('every class has a companion with two working abilities', () => {
    for (const classId of Object.keys(CLASSES)) {
      const data = COMPANIONS[classId];
      expect(data, classId).toBeDefined();
      expect(data!.habilidades.length).toBeGreaterThanOrEqual(2);
      const s = party(classId);
      const mate = mateOf(s);
      expect(mate.controllerId).toBe('player:1');
      expect(mate.factionId).toBe('concursantes');
      const actions = willy.listActions(s, mate.id).filter((a) => a.id.startsWith('comp:'));
      expect(actions.map((a) => a.id)).toEqual(data!.habilidades.map((h) => `comp:${h.id}`));
      for (const a of actions) {
        const target =
          a.target.kind === 'self' ? {} : a.target.kind === 'tile' ? { tile: { x: 2, y: 1 } } : a.target.filter === 'ally' ? { entityId: 'w' } : { entityId: 'r' };
        const p = willy.previewAction(s, mate.id, a.id, target);
        expect(p.valid, `${classId} ${a.id}: ${p.reason}`).toBe(true);
        const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: mate.id, actionId: a.id, target } as BaseCommand);
        expect(r.ok, `${classId} ${a.id}: ${r.ok ? '' : r.error.message}`).toBe(true);
      }
    }
  });

  it('levels with Willy when a fight starts', () => {
    const w = W('w', 'butanero', 0, 1, 6);
    const c = createCompanion('butanero', W('w', 'butanero', 0, 1, 1), { x: 2, y: 1 })!;
    const s = game([w, c, rat('r', 6, 1)], ['........', '........']);
    const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['w', c.id, 'r'] } as BaseCommand);
    if (!r.ok) throw new Error(r.error.message);
    const after = r.state.entities[c.id]!;
    const want = companionStats(COMPANIONS.butanero!, 6);
    expect(after.stats.nivel).toBe(6);
    expect(after.resources.vida!.max).toBe(want.vida);
    expect(after.stats.ataque).toBe(want.ataque);
    expect(after.tags).toContain(`arma:${want.dano}`);
  });

  it('a fallen companion stays down on that map and is back (at half health) on the next one', () => {
    const s = party('socorrista');
    const mate = mateOf(s);
    const down = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['w', mate.id, 'r'] } as BaseCommand);
    if (!down.ok) throw new Error(down.error.message);
    // Knocked out here.
    const ko: GameState = {
      ...down.state,
      turn: { ...down.state.turn, mode: 'exploration' } as GameState['turn'],
      entities: { ...down.state.entities, [mate.id]: { ...down.state.entities[mate.id]!, resources: { ...down.state.entities[mate.id]!.resources, vida: { ...down.state.entities[mate.id]!.resources.vida!, current: 0 } }, conditions: [{ id: 'eliminado' }], tags: [...down.state.entities[mate.id]!.tags, `caido-en:${s.map.id}`] } },
    };
    const same = engine.apply(ko, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['w', 'r'] } as BaseCommand);
    if (!same.ok) throw new Error(same.error.message);
    expect(hasCondition(same.state.entities[mate.id]!, 'eliminado')).toBe(true);
    const elsewhere = { ...ko, map: { ...ko.map, id: 'planta-2' } };
    const next = engine.apply(elsewhere, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['w', 'r'] } as BaseCommand);
    if (!next.ok) throw new Error(next.error.message);
    const back = next.state.entities[mate.id]!;
    expect(hasCondition(back, 'eliminado')).toBe(false);
    expect(back.resources.vida!.current).toBe(Math.ceil(back.resources.vida!.max / 2));
    expect(next.state.turn.order).toContain(mate.id);
  });

  it('with Chencho on court, Tiempo muerto pumps him up instead of calling a second Chencho', () => {
    const s = party('jugador-de-basket', 3);
    const mate = mateOf(s);
    const tired = { ...s, entities: { ...s.entities, [mate.id]: { ...mate, resources: { ...mate.resources, vida: { ...mate.resources.vida!, current: 2 }, energia: { ...mate.resources.energia!, current: 0 } } } } };
    expect(willy.previewAction(tired, 'w', 'hab:tiempo-muerto', {}).valid).toBe(true);
    const r = engine.apply(tired, { type: 'act', issuer: 'player:1', entityId: 'w', actionId: 'hab:tiempo-muerto', target: {} } as BaseCommand);
    if (!r.ok) throw new Error(r.error.message);
    const after = r.state.entities[mate.id]!;
    expect(after.resources.vida!.current).toBeGreaterThan(2);
    expect(after.resources.energia!.current).toBe(after.resources.energia!.max);
    expect(hasCondition(after, 'animado')).toBe(true);
    expect(Object.keys(r.state.entities).some((id) => id.startsWith('chencho-el-base#'))).toBe(false);
  });
});
