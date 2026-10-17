import { describe, expect, it } from 'vitest';
import { SYSTEM_ISSUER, createEngine, type ActCommand, type ActionTarget, type Vec2 } from '../../../engine';
import { createCreature, createWilly, willy } from '../../../rulesets/willy';
import { ARENAS, CLASS_IDS } from './setup';

/**
 * Exercises every non-passive action of every Willy class through the real pipeline
 * (listActions -> previewAction -> the `act` command), at character level 9 so every
 * ability has unlocked. Not every ability can be triggered from a generic scene (some
 * need a prior setup condition, like "En el aire" before a dunk), so this is a best-effort
 * exerciser: it tries a handful of plausible targets per action and records which ones it
 * managed to validate. It hard-fails only on a thrown exception, or on `act` rejecting a
 * command whose own `previewAction` had just said was valid (engine/ruleset disagreeing
 * with itself) or on resources leaving their [0, max] bounds — never on "couldn't find a
 * target for this one", which just means the harness's scene doesn't suit that ability.
 */

const engine = createEngine(willy, 'willy-qa-actions');

function scene(classId: string) {
  const map = ARENAS.plain!;
  const actor = createWilly({ id: 'actor', controllerId: 'player:1', factionId: 'concursantes', position: { x: 2, y: 2 }, spriteId: 'w', classId, level: 9 });
  const ally = createWilly({ id: 'ally', controllerId: 'player:1', factionId: 'concursantes', position: { x: 2, y: 3 }, spriteId: 'w', classId, level: 1 });
  const nearRat = createCreature({ id: 'near', name: 'Rata', controllerId: 'ai', factionId: 'monstruos', position: { x: 3, y: 2 }, spriteId: 'rata', vida: 20, def: 10, ataque: 2, dano: '1d4', movimiento: 5 });
  const farRat = createCreature({ id: 'far', name: 'Rata', controllerId: 'ai', factionId: 'monstruos', position: { x: 5, y: 2 }, spriteId: 'rata', vida: 20, def: 10, ataque: 2, dano: '1d4', movimiento: 5 });
  let state = engine.newGame({ seed: 7, map, entities: [actor, ally, nearRat, farRat] });
  const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['actor', 'ally', 'near', 'far'] } as never);
  if (!started.ok) throw new Error(`setup: startCombat failed (${started.error.code})`);
  state = started.state;
  // Make sure it is the actor's turn, skipping anyone else's.
  for (let guard = 0; guard < 10 && state.turn.activeEntityId !== 'actor'; guard++) {
    const r = engine.apply(state, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: state.turn.activeEntityId! } as never);
    if (!r.ok) throw new Error(`setup: endTurn failed (${r.error.code})`);
    state = r.state;
  }
  return state;
}

/** A handful of plausible targets to try for an action, cheapest/most relevant first. */
function candidateTargets(kind: 'self' | 'creature' | 'tile', range: number, filter: 'hostile' | 'ally' | 'any' | undefined): ActionTarget[] {
  if (kind === 'self') return [{}];
  if (kind === 'creature') {
    const hostiles = [{ entityId: 'near' }, { entityId: 'far' }];
    const allies = [{ entityId: 'ally' }, { entityId: 'actor' }];
    if (filter === 'hostile') return hostiles;
    if (filter === 'ally') return allies;
    return [...hostiles, ...allies];
  }
  // Tile-kind: a few tiles at increasing distance from the actor (2,2), capped by range.
  const offsets: Vec2[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 0 }];
  return offsets
    .map((o) => ({ x: 2 + o.x * Math.min(range, 3), y: 2 + o.y * Math.min(range, 3) }))
    .filter((p) => p.x >= 0 && p.y >= 0)
    .map((tile) => ({ tile }));
}

describe('Willy action coverage (every class, every non-passive action)', () => {
  const exercised: Record<string, string[]> = {};
  const skipped: Record<string, string[]> = {};

  for (const classId of CLASS_IDS) {
    it(`every action of "${classId}" either validates cleanly or is honestly reported unreachable here`, () => {
      const base = scene(classId);
      const actions = willy.listActions(base, 'actor');
      expect(actions.length, `${classId}: listActions returned nothing for its own actor`).toBeGreaterThan(0);
      exercised[classId] = [];
      skipped[classId] = [];

      for (const action of actions) {
        const candidates = candidateTargets(action.target.kind, action.target.range, action.target.filter);
        let done = false;
        for (const target of candidates) {
          // Give the actor a clean slate each try: full resources, actor's turn.
          let state = base;
          state = {
            ...state,
            entities: {
              ...state.entities,
              actor: { ...state.entities.actor!, resources: Object.fromEntries(Object.entries(state.entities.actor!.resources).map(([k, r]) => [k, { ...r, current: r.max }])) },
            },
          };
          const preview = willy.previewAction(state, 'actor', action.id, target);
          if (!preview.valid) continue;

          const cmd: ActCommand = { type: 'act', issuer: 'player:1', entityId: 'actor', actionId: action.id, target };
          let result: ReturnType<typeof engine.apply>;
          expect(() => (result = engine.apply(state, cmd)), `${classId}/${action.id} with target ${JSON.stringify(target)} threw`).not.toThrow();
          expect(
            result!.ok,
            result!.ok ? '' : `${classId}/${action.id}: previewAction said valid but act() rejected it: ${JSON.stringify((result! as { error: unknown }).error)}`,
          ).toBe(true);
          if (result!.ok) {
            for (const e of Object.values(result!.state.entities)) {
              for (const [resource, pool] of Object.entries(e.resources)) {
                expect(pool.current, `${classId}/${action.id}: ${e.id}.${resource} out of bounds after the action`).toBeGreaterThanOrEqual(0);
                expect(pool.current, `${classId}/${action.id}: ${e.id}.${resource} out of bounds after the action`).toBeLessThanOrEqual(pool.max);
              }
            }
          }
          exercised[classId]!.push(action.id);
          done = true;
          break;
        }
        if (!done) skipped[classId]!.push(action.id);
      }
    });
  }

  it('summary: reports which abilities this harness could not exercise (informational, not a failure)', () => {
    const totalSkipped = Object.values(skipped).reduce((n, l) => n + l.length, 0);
    const totalExercised = Object.values(exercised).reduce((n, l) => n + l.length, 0);
    // eslint-disable-next-line no-console
    console.log(`Willy action coverage: ${totalExercised} exercised, ${totalSkipped} unreachable from this generic scene.`, skipped);
    expect(totalExercised).toBeGreaterThan(0);
  });
});
