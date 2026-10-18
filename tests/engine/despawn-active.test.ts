import { describe, expect, it } from 'vitest';
import { type GameState, createEngine, extendRuleset } from '../../engine';
import { asciiMap, makeEntity } from '../fixtures/helpers';
import { toyRuleset } from '../fixtures/toyRuleset';

/**
 * Regression for a real softlock (reported by QA on the Willy expansion): a ruleset's
 * `afterCommand` hook can remove the entity the engine just handed the turn to (a room
 * collapsing on them, say). Previously the turn pointer was left dangling on that gone id,
 * and the next `nextAiCommand`/command crashed reading `state.entities[activeId]`.
 */
describe('a ruleset hook despawning the newly active combatant', () => {
  const ruleset = extendRuleset(toyRuleset, {
    id: 'toy-despawn-active',
    // Whoever's turn starts named "doomed" is removed right there, exactly like a floor
    // collapsing under a combatant the instant the engine hands them the turn.
    afterCommand: (state, events) => {
      const started = events.find((e) => e.type === 'turnStarted' && (e as unknown as { entityId: string }).entityId === 'doomed');
      return started ? { effects: [{ type: 'despawnEntity', entityId: 'doomed' }], events: [] } : { effects: [], events: [] };
    },
  });
  const engine = createEngine(ruleset, 'toy-despawn');

  function setup(): GameState {
    const base = engine.newGame({
      seed: 1,
      map: asciiMap(['....']),
      entities: [
        makeEntity({ id: 'hunter', position: { x: 0, y: 0 } }),
        makeEntity({ id: 'doomed', controllerId: 'ai', factionId: 'night', position: { x: 3, y: 0 } }),
        makeEntity({ id: 'ghoul', controllerId: 'ai', factionId: 'night', position: { x: 2, y: 0 } }),
      ],
    });
    // A third combatant survives "doomed", so the fight (and its turn order) carries on.
    return { ...base, turn: { mode: 'combat', round: 1, activeEntityId: 'hunter', order: ['hunter', 'doomed', 'ghoul'], initiative: {}, movementUsed: 0 } };
  }

  it('leaves the turn on a real, standing entity instead of a ghost id', () => {
    const r = engine.apply(setup(), { type: 'endTurn', issuer: 'player:1', entityId: 'hunter' } as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.entities.doomed).toBeUndefined();
    expect(r.state.turn.order).not.toContain('doomed');
    expect(r.state.turn.mode).toBe('combat');
    // The turn pointer must land on whoever is actually still there (ghoul), not the ghost.
    expect(r.state.entities[r.state.turn.activeEntityId ?? '']).toBeDefined();
    expect(r.state.turn.activeEntityId).toBe('ghoul');
    // Proof the engine itself is still usable: issuing another command does not throw.
    expect(() => engine.apply(r.state, { type: 'endTurn', issuer: 'player:1', entityId: r.state.turn.activeEntityId! } as never)).not.toThrow();
  });
});
