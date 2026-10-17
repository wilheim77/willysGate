import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, type Trap, hasCondition, withTraps } from '../../engine';
import { W, engine, game } from './willy-helpers';

const hook = (id: string, x: number, detect = 30): Trap => ({ id, tiles: [{ x, y: 0 }], hidden: true, armed: true, params: { tipo: 'anzuelo', detect, dif: 30, dano: '1d6', efecto: 'enredado' } });

function walk(state: GameState, x: number) {
  const r = engine.apply(state, { type: 'move', issuer: 'player:1', entityId: 'w', to: { x, y: 0 } } as BaseCommand);
  if (!r.ok) throw new Error(r.error.message);
  return r;
}

describe('Willy: traps', () => {
  it('stepping on a hook hurts and entangles (a DIF nobody beats without a 20)', () => {
    let hits = 0;
    for (let seed = 0; seed < 20; seed++) {
      const base = withTraps(game([W('w', 'butanero', 0, 0)]), [hook('t', 2)]);
      const r = walk({ ...base, rng: { ...base.rng, a: (base.rng.a + seed * 7919) >>> 0 } }, 3);
      const w = r.state.entities.w!;
      expect(r.events.some((e) => e.type === 'trapTriggered')).toBe(true);
      if (hasCondition(w, 'enredado')) {
        hits++;
        expect(w.resources.vida!.current).toBeLessThan(w.resources.vida!.max);
      }
    }
    expect(hits).toBeGreaterThan(14);
  });

  it('a lucky contestant spots it before stepping on it', () => {
    const lucky = { ...W('w', 'butanero', 0, 0) };
    lucky.stats = { ...lucky.stats, sue: 6 };
    const r = walk(withTraps(game([lucky]), [hook('t', 3, 14)]), 5);
    expect(r.events.some((e) => e.type === 'trapSpotted')).toBe(true);
    expect(r.state.entities.w!.position.x).toBeLessThan(3);
  });
});
