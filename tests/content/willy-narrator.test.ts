import { describe, expect, it } from 'vitest';
import { narrate } from '../../content/willy/narrator';
import type { GameState } from '../../engine';

const state = { entities: {} } as unknown as GameState;

describe('Willy narrator', () => {
  it('the first 5G use gets the joke', () => {
    expect(narrate({ type: 'skillUsed', habilidad: 'red-g', nivel: 1, primeraVez: true } as never, state)).toContain('5G no servía para nada');
  });
  it('lines with missing variables are skipped, not shown with holes', () => {
    for (let i = 0; i < 20; i++) {
      const line = narrate({ type: 'achievementUnlocked' } as never, state);
      if (line) expect(line).not.toMatch(/\{|«»/);
    }
  });
});
