import { describe, expect, it } from 'vitest';
import { type GameState } from '../../engine';
import { createWilly, willy } from '../../rulesets/willy';
import { tierLabel } from '../../rulesets/willy/character';
import { announce } from '../../content/willy/announce';

const w = createWilly({ id: 'w', controllerId: 'player:1', factionId: 'concursantes', position: { x: 0, y: 0 }, spriteId: 'w', classId: 'butanero' });
const withUses = (n: number) => ({ ...w, resources: { ...w.resources, 'uso:lanzar-bombona': { current: n, max: 99999 } } });

describe('Willy: abilities that level with use', () => {
  it('show «Nivel N · usos X/Y», and Maestría at the top', () => {
    expect(tierLabel(withUses(3), 'lanzar-bombona')).toBe('Nivel 1 · usos 3/8');
    expect(tierLabel(withUses(30), 'lanzar-bombona')).toBe('Nivel 3 · usos 30/48');
    expect(tierLabel(withUses(90), 'lanzar-bombona')).toBe('Nivel 5 · Maestría (90 usos)');
    const state = { entities: { w: withUses(10) }, map: { id: 'x', width: 1, height: 1, tiles: [{ terrain: 'piedra-mojada', height: 0, walkable: true }] }, systems: {}, flags: {}, turn: { mode: 'exploration' } } as unknown as GameState;
    expect(willy.listActions(state, 'w').find((a) => a.id === 'hab:lanzar-bombona')!.description).toContain('Nivel 2 · usos 10/24');
  });

  it('a tier-up is announced; the Maestría big', () => {
    const state = { entities: { w } } as unknown as GameState;
    expect(announce({ type: 'skillLevelUp', entityId: 'w', habilidad: 'lanzar-bombona', nombre: 'Lanzar bombona', nivel: 2, maestria: false } as never, state)).toEqual({ text: 'Lanzar bombona sube a nivel 2' });
    expect(announce({ type: 'skillLevelUp', entityId: 'w', habilidad: 'lanzar-bombona', nombre: 'Lanzar bombona', nivel: 5, maestria: true } as never, state)).toMatchObject({ big: true });
  });
});
