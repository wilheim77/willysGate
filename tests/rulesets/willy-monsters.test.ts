import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, SYSTEM_ISSUER, hasCondition } from '../../engine';
import { createCreature, willy } from '../../rulesets/willy';
import { MONSTER_ABILITIES } from '../../rulesets/willy/monsters';
import { W, engine, game } from './willy-helpers';

const monster = (id: string, abilities: string[], x: number, y: number, extra: string[] = []): Entity => {
  const e = createCreature({ id, name: id, controllerId: 'ai', factionId: 'monstruos', position: { x, y }, spriteId: 'x', vida: 30, def: 10, ataque: 4, dano: '1d4', movimiento: 4, tags: [...abilities.map((a) => `habilidad:${a}`), ...extra] });
  return { ...e, resources: { ...e.resources, energia: { current: 9, max: 9 } } };
};

/** Willy at (2,1) with company at (3,1), a hurt foe ally at (1,2), the monster at (1,1). */
function scene(abilityId: string): GameState {
  const hurt = createCreature({ id: 'amigo', name: 'amigo', controllerId: 'ai', factionId: 'monstruos', position: { x: 0, y: 2 }, spriteId: 'x', vida: 30, def: 10, ataque: 2, dano: '1d4', movimiento: 4 });
  return game([monster('m', [abilityId], 1, 1), W('w', 'butanero', 2, 1), W('w2', 'mimo', 2, 2), { ...hurt, resources: { ...hurt.resources, vida: { current: 5, max: 30 } } }], ['......', '......', '......', '......']);
}

describe('Willy: enemy abilities', () => {
  it('every ability previews and resolves from a creature that has it', () => {
    for (const id of Object.keys(MONSTER_ABILITIES)) {
      const s = scene(id);
      const action = willy.listActions(s, 'm').find((a) => a.id === `mon:${id}`)!;
      expect(action, id).toBeDefined();
      const target = action.target.kind === 'self' ? {} : action.target.kind === 'tile' ? { tile: { x: 2, y: 1 } } : action.target.filter === 'ally' ? { entityId: 'amigo' } : { entityId: 'w' };
      const p = willy.previewAction(s, 'm', action.id, target);
      expect(p.valid, `${id}: ${p.reason}`).toBe(true);
      const r = engine.apply(s, { type: 'act', issuer: 'ai', entityId: 'm', actionId: action.id, target } as BaseCommand);
      expect(r.ok, `${id}: ${r.ok ? '' : r.error.message}`).toBe(true);
    }
  });

  it('a self-destruct hurts everyone around and takes the can out', () => {
    const s = scene('autodestruccion');
    const r = engine.apply(s, { type: 'act', issuer: 'ai', entityId: 'm', actionId: 'mon:autodestruccion', target: {} } as BaseCommand);
    if (!r.ok) throw new Error(r.error.message);
    expect(hasCondition(r.state.entities.m!, 'eliminado')).toBe(true);
    expect(r.state.entities.w!.resources.vida!.current).toBeLessThan(s.entities.w!.resources.vida!.current);
  });

  it('a creature with estalla:<id> blows up when knocked out', () => {
    const can = monster('lata', [], 3, 1, ['estalla:autodestruccion']);
    const s = game([W('w', 'butanero', 2, 1), { ...can, resources: { ...can.resources, vida: { current: 1, max: 4 } } }], ['......']);
    const before = s.entities.w!.resources.vida!.current;
    for (let i = 0; i < 40; i++) {
      const t = { ...s, rng: { ...s.rng, a: (s.rng.a + i * 7919) >>> 0 } };
      const r = engine.apply(t, { type: 'act', issuer: 'player:1', entityId: 'w', actionId: 'basic:golpe', target: { entityId: 'lata' } } as BaseCommand);
      if (r.ok && hasCondition(r.state.entities.lata!, 'eliminado')) {
        expect(r.events.some((e) => e.type === 'exploded')).toBe(true);
        expect(r.state.entities.w!.resources.vida!.current).toBeLessThan(before);
        return;
      }
    }
    throw new Error('never knocked out');
  });

  it('summoners bring their extras into the fight, after them in the turn order', () => {
    const s = scene('llamar-figurantes');
    const started = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['m', 'w', 'w2'] } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    const st = { ...started.state, turn: { ...started.state.turn, activeEntityId: 'm' } };
    const r = engine.apply(st, { type: 'act', issuer: 'ai', entityId: 'm', actionId: 'mon:llamar-figurantes', target: {} } as BaseCommand);
    if (!r.ok) throw new Error(r.error.message);
    const extras = Object.values(r.state.entities).filter((e) => e.tags.includes('invocado-por:m'));
    expect(extras.length).toBe(2);
    expect(r.state.turn.order).toEqual(expect.arrayContaining(extras.map((e) => e.id)));
  });

  it('ranged enemies that kite keep their distance', () => {
    const s = game([monster('k', [], 1, 0, ['kite'])], ['....']);
    expect(willy.aiProfile!(s, 'k')).toMatchObject({ keepAway: 4 });
    expect(willy.aiProfile!(s, 'nadie')).toBeUndefined();
  });
});
