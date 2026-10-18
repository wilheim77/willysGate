import { describe, expect, it } from 'vitest';
import { type Entity, type GameState, itemCount } from '../../engine';
import { BAG, throwableItem, willy } from '../../rulesets/willy';
import '../../content/willy/meta-content';
import { W, engine, game, rat } from '../rulesets/willy-helpers';

function withBag(s: GameState, items: Record<string, number>): GameState {
  return engine.applyEffects(s, Object.entries(items).map(([item, count]) => ({ type: 'giveItem', owner: BAG, item, count }))).state;
}

function withUses(s: GameState, id: string, uses: number): GameState {
  const e = s.entities[id]!;
  const next: Entity = { ...e, resources: { ...e.resources, 'uso:golpe-de-valor': { current: uses, max: 99999 } } };
  return { ...s, entities: { ...s.entities, [id]: next } };
}

describe('Tasador: Golpe de valor', () => {
  const base = () => game([W('t', 'tasador', 0, 0), rat('r', 3, 0, { vida: 99, def: 1 })]);

  it('needs something in the bag to throw', () => {
    expect(willy.previewAction(base(), 't', 'hab:golpe-de-valor', { entityId: 'r' }).valid).toBe(false);
  });

  it('picks junk first, then non-healing, then healing; gold only with a spare copy', () => {
    const s = withBag(base(), { 'pastillas-juanola': 3, 'folleto-la-prudente': 1 });
    expect(throwableItem(s)?.id).toBe('folleto-la-prudente');
    expect(throwableItem(withBag(base(), { 'pastillas-juanola': 3 }))?.id).toBe('pastillas-juanola');
    const gold = 'dado-trucado';
    expect(throwableItem(withBag(base(), { [gold]: 1, 'pastillas-juanola': 1 }))?.id).toBe('pastillas-juanola');
    expect(throwableItem(withBag(base(), { [gold]: 2, 'pastillas-juanola': 1 }))?.id).toBe(gold);
  });

  it('damage grows with the value; the item is lost even on a miss', () => {
    const s = withBag(base(), { 'pastillas-juanola': 2 });
    const p = willy.previewAction(s, 't', 'hab:golpe-de-valor', { entityId: 'r' });
    expect(p.valid).toBe(true);
    expect(p.breakdown?.[0]?.value).toContain('Pastillas Juanola');
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 't', actionId: 'hab:golpe-de-valor', target: { entityId: 'r' } } as never);
    if (!r.ok) throw new Error(r.error.code);
    expect(itemCount(r.state, BAG, 'pastillas-juanola')).toBe(1);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'itemThrown', item: 'pastillas-juanola' }));
    // Level 4 adds the whole value instead of half.
    const low = willy.previewAction(s, 't', 'hab:golpe-de-valor', { entityId: 'r' }).expectedDamage!;
    const high = willy.previewAction(withUses(s, 't', 48), 't', 'hab:golpe-de-valor', { entityId: 'r' }).expectedDamage!;
    expect(high).toBeGreaterThan(low);
  });

  it('at Maestría bronze comes back', () => {
    const s = withUses(withBag(base(), { 'pastillas-juanola': 1 }), 't', 80);
    const r = engine.apply(s, { type: 'act', issuer: 'player:1', entityId: 't', actionId: 'hab:golpe-de-valor', target: { entityId: 'r' } } as never);
    if (!r.ok) throw new Error(r.error.code);
    expect(itemCount(r.state, BAG, 'pastillas-juanola')).toBe(1);
  });
});
