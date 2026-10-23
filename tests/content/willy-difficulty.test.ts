import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, RngCursor, createEngine } from '../../engine';
import { willy } from '../../rulesets/willy';
import { clockOf } from '../../rulesets/willy/clock';
import { Resolver, dealDamage } from '../../rulesets/willy/resolve';
import { maps, newWillyGame } from '../../content/willy/setup';

const engine = createEngine(willy, 'willy-difficulty', { dialogues: {}, maps });

function at(dificultad: string): GameState {
  const s = newWillyGame(engine, 3, { start: 'planta-3' });
  return { ...s, flags: { ...s.flags, dificultad } };
}

function firstStep(s: GameState): GameState {
  const w = s.entities.willy!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const r = engine.apply(s, { type: 'move', issuer: 'player:1', entityId: 'willy', to: { x: w.position.x + dx, y: w.position.y + dy } } as BaseCommand);
    if (r.ok) return r.state;
  }
  throw new Error('no step');
}

function hit(s: GameState, id: string, raw: number): number {
  const r = new Resolver(willy, s, new RngCursor(s.rng));
  return dealDamage(r, id, raw, 'golpe');
}

describe('Willy: difficulty', () => {
  it('the clock: Turista ×1.5, Prime time ×0.95', () => {
    const base = clockOf(firstStep(at('concursante')))!.total;
    expect(clockOf(firstStep(at('turista')))!.total).toBe(Math.round(base * 1.5));
    expect(clockOf(firstStep(at('primetime')))!.total).toBe(Math.round(base * 0.95));
  });

  it('damage: Turista softens what Willy takes, Prime time hardens the enemies', () => {
    const s = firstStep(at('concursante'));
    const foe = Object.values(s.entities).find((e) => e.factionId === 'monstruos')!;
    expect(hit(s, 'willy', 10)).toBe(10);
    expect(hit({ ...s, flags: { ...s.flags, dificultad: 'turista' } }, 'willy', 10)).toBe(6);
    expect(hit({ ...s, flags: { ...s.flags, dificultad: 'turista' } }, foe.id, 10)).toBe(10);
    expect(hit({ ...s, flags: { ...s.flags, dificultad: 'primetime' } }, foe.id, 10)).toBe(9);
    expect(hit({ ...s, flags: { ...s.flags, dificultad: 'primetime' } }, 'willy', 10)).toBe(10);
  });
});
