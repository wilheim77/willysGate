import { describe, expect, it } from 'vitest';
import { narrate, narrateEvents } from '../../content/willy/narrator';
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

  it('a bank with enfriamientoTurnos stays quiet for that many of Willy\'s turns after speaking', () => {
    const s = game([W('willy', 'butanero', 0, 0)]);
    const up = { type: 'audienceChanged', delta: 900, deltaPct: 60, espectadores: 2400, causa: 'eliminar' } as never;
    const willyTurn = { type: 'turnStarted', entityId: 'willy' } as never;
    // Speaks at some point (probability 0.5)…
    let spoke = false;
    for (let i = 0; i < 40 && !spoke; i++) {
      spoke = !!narrateEvents([willyTurn, up], s);
    }
    expect(spoke).toBe(true);
    // …then not on the next turn (enfriamientoTurnos 2), whatever the dice.
    for (let i = 0; i < 20; i++) expect(narrateEvents([up], s)).toBeNull();
    // Two turns later it can talk again.
    narrateEvents([willyTurn], s);
    narrateEvents([willyTurn], s);
    let again = false;
    for (let i = 0; i < 40 && !again; i++) again = !!narrateEvents([up], s);
    expect(again).toBe(true);
  });

  it('lines carry their bank priority, so the client can let the big moments win', () => {
    const s = game([W('willy', 'butanero', 0, 0)]);
    let line: { text: string; priority: number } | null = null;
    for (let i = 0; i < 30 && !line; i++) line = narrateEvents([{ type: 'boxDelivered', caja: 'bronce', origen: 'logro' } as never], s);
    expect(line?.priority).toBeGreaterThanOrEqual(3);
  });
});
