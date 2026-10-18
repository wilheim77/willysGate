import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../engine';
import { willy } from '../../../rulesets/willy';
import { applyCasting, maps, newWillyGame } from '../../../content/willy/setup';
import { CLASS_IDS } from './setup';
import { runFullGame } from './fullRunDriver';

/**
 * The Willy equivalent of the Intereses golden path: casting, then the Camerino through
 * every floor's lift/stairs, fights driven by the AI on both sides with no SYSTEM rescues
 * (the engine's own `passTurnIfHelpless` is what keeps a helpless fighter - Willy's own
 * included - from hanging the fight, same rule as Intereses). Built ahead of two branches
 * landing (origin/willy: longer runs, bigger floors, a collapse timer, more enemies;
 * origin/willy-meta: achievements, loot boxes, items/potions, out-of-combat healing), so
 * most of its assertions are `it.todo` until those features exist - see the bottom half of
 * this file, and docs/willy/ENGINE_REQUESTS.md or a message from this QA pass for exactly
 * what shape each one needs to land in.
 *
 * Smoke (plain `npm test`): one class, two floors. Full 9-class x every floor matrix:
 * `QA_DEEP=1 npm run test:qa`.
 */

const engine = createEngine(willy, 'willy-qa-fullrun', { dialogues: {}, maps });

function startRun(seed: number, classId: string): ReturnType<typeof applyCasting> {
  const fresh = newWillyGame(engine, seed);
  return applyCasting(fresh, { clase: classId, puntos: {} });
}

const DEEP = process.env.QA_DEEP === '1';
const CLASSES = DEEP ? CLASS_IDS : [CLASS_IDS[0]!];
const MAX_STEPS = DEEP ? 4000 : 1500;

describe('Willy full run: casting through every floor, no softlock', () => {
  for (const classId of CLASSES) {
    it(
      `"${classId}": the lift/stairs always lead somewhere, every fight ends (${DEEP ? 'full run' : 'first two floors'})`,
      () => {
        const state = startRun(1, classId);
        let result: ReturnType<typeof runFullGame>;
        expect(() => (result = runFullGame(engine, state, 'willy', MAX_STEPS))).not.toThrow();
        // eslint-disable-next-line no-console
        console.log(`${classId}: ${result!.steps} steps, floors cleared ${result!.floorsCleared}, visited [${result!.visitedMaps.join(', ')}]`);
        expect(result!.steps, `"${classId}": did not settle within ${MAX_STEPS} steps - possible softlock`).toBeLessThan(MAX_STEPS);
        // A run that ends because Willy himself went down is a real "game over" (expected,
        // even likely, while there's no out-of-combat healing or potions yet to recover
        // between back-to-back fights - see the `it.todo`s below) - not a softlock, so it's
        // reported rather than asserted against.
        const wentDown = !willy.isStanding(result!.state.entities.willy!);
        if (wentDown) return;
        if (!DEEP) {
          // Smoke only needs to prove the first two floors work; the deep run goes further.
          expect(result!.floorsCleared, `"${classId}": did not clear even one floor`).toBeGreaterThanOrEqual(1);
          return;
        }
        expect(result!.floorsCleared, `"${classId}": should have cleared all 5 floors`).toBe(5);
      },
      DEEP ? 90000 : 20000,
    );
  }
});

/**
 * Assertions for features not yet in main (per the coordinator's brief) - kept as
 * `it.todo` so they show up in the test list and get turned into real tests (delete the
 * `.todo`, fill in the body using the Driver above) the moment each branch lands. See the
 * message sent to the Willy and meta agents for exactly what this harness expects of them
 * (event names, state shape).
 */
describe.todo('collapse timer: the floor always resolves, never leaves the party stuck', () => {
  it.todo('the floor collapses and ejects Willy if the clock runs out mid-floor');
  it.todo('leaving through the stairs before the clock runs out skips the collapse cleanly');
  it.todo('the collapse timer is reflected in GameState (a resource or systems entry), not just a UI countdown');
});

describe.todo('class progression: every class reaches its top ability tier before the final floor', () => {
  for (const classId of CLASS_IDS) it.todo(`"${classId}" unlocks nivelPersonaje 9 by floor 5`);
});

describe.todo('achievements unlock on the expected events', () => {
  it.todo('defeating the first boss unlocks its achievement');
  it.todo('clearing all 5 floors unlocks the season-complete achievement');
  it.todo('an achievement never fires twice for the same run');
});

describe.todo('loot boxes open and grant a usable item', () => {
  it.todo('opening a "caja-bronce"/"caja-plata" grants an item from loot-tables.json');
  it.todo('the granted item is usable (consumable or equip) via a real command, not just added to an inventory list');
});

describe.todo('HP regenerates out of combat', () => {
  it.todo('Willy and companions regain HP over time/steps while not in a fight');
  it.todo('regeneration stops (or is much slower) while a fight is active');
});
