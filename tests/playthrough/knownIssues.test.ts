import { describe, it, expect } from 'vitest';
import { hasLineOfSight } from '../../engine';
import { willy } from '../../rulesets/willy';
import { asciiMap } from '../fixtures/helpers';
import { engine } from './willy/setup';

/**
 * Confirmed gaps reported to the coordinator, kept here as `it.fails` so `npm run check`
 * stays green but flips red (telling us to delete the `.fails`) the moment someone fixes
 * them. Do not "fix" these by editing rulesets/willy here — report only, per the QA brief.
 */

describe('known issue: Willy vapor does not actually block sight (R20 landed, ruleset not updated)', () => {
  // Repro: docs/willy/ENGINE_REQUESTS.md R20 says SurfaceDef.blocksSight exists precisely
  // "para... el vapor de Willy", and engine/los.ts (commit 62e34fd) already respects it.
  // But rulesets/willy/environment.ts's own `vapor` entry never sets `blocksSight: true`:
  //   vapor: { label: 'Vapor', durationRounds: 2, color: '#d8dde0' }   (no blocksSight)
  // so standing in a cloud of steam from the fire+water interaction does not hide you.
  it.fails('a tile of vapor blocks line of sight, same as toyRuleset smoke does', () => {
    let s = engine.newGame({ seed: 1, map: asciiMap(['.....']), entities: [] });
    expect(hasLineOfSight(s, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    s = engine.applyEffects(s, [{ type: 'spawnSurface', tiles: [{ x: 2, y: 0 }], surface: 'vapor' }]).state;
    expect(hasLineOfSight(s, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false); // currently stays `true`: BUG
  });

  it('sanity: the ruleset really is missing the flag (so the test above is the right repro)', () => {
    expect(willy.surfaces!.vapor!.blocksSight).toBeUndefined();
  });
});
