import { describe, expect, it } from 'vitest';
import { narrate } from '../../content/willy/narrator';
import type { GameState } from '../../engine';
import { W, game, rat } from '../rulesets/willy-helpers';

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

  it('banks written against the show views fire: a monster down, with its name and agreement filled', () => {
    const s = game([W('willy', 'butanero', 0, 0), rat('r', 1, 0)]);
    const lines = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const line = narrate({ type: 'entityDefeated', entityId: 'r', cause: 'golpe', actorId: 'willy' } as never, s);
      if (line) lines.add(line);
    }
    expect(lines.size).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toMatch(/[{}]/);
  });

  it('a critical hit by Willy (attackRolled) reaches the «critico» bank', () => {
    const s = game([W('willy', 'butanero', 0, 0), rat('r', 1, 0)]);
    let line: string | null = null;
    for (let i = 0; i < 20 && !line; i++) line = narrate({ type: 'attackRolled', attackerId: 'willy', targetId: 'r', hit: true, crit: true, natural: 20 } as never, s);
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/[{}]/);
  });
});
