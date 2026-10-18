import { describe, expect, it } from 'vitest';
import { RngCursor } from '../../engine';
import { willy } from '../../rulesets/willy';
import { Resolver, dealDamage, preventDefeatHooks } from '../../rulesets/willy/resolve';
import { W, game, rat } from './willy-helpers';

describe('Willy: preventDefeatHooks', () => {
  it('a preventing hook keeps the target at 1 health, with no entityDefeated and no XP', () => {
    const s = game([W('willy', 'butanero', 0, 0), rat('r', 1, 0, { tags: ['xp:50'] })]);
    const hook = (_r: Resolver, id: string) => id === 'r';
    preventDefeatHooks.push(hook);
    try {
      const r = new Resolver(willy, s, new RngCursor(s.rng));
      dealDamage(r, 'r', 99, 'golpe', 'willy');
      expect(r.state.entities.r!.resources.vida!.current).toBe(1);
      expect(r.state.entities.r!.conditions.some((c) => c.id === 'eliminado')).toBe(false);
      expect(r.events.map((e) => e.type)).not.toContain('entityDefeated');
      expect(r.state.entities.willy!.resources.xp!.current).toBe(s.entities.willy!.resources.xp!.current);
    } finally {
      preventDefeatHooks.splice(preventDefeatHooks.indexOf(hook), 1);
    }
  });
});
