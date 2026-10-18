import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../engine';
import { show, skillLevel, willy, type WillyEvent } from '../../../rulesets/willy';
import { SKILL_THRESHOLDS } from '../../../rulesets/willy/data';
import { clockOf } from '../../../rulesets/willy/clock';
import { applyCasting, maps, newWillyGame } from '../../../content/willy/setup';
import { CLASS_IDS } from './setup';
import { runFullGame } from './fullRunDriver';

/**
 * The Willy equivalent of the Intereses golden path: casting, then the Camerino through
 * every floor's lift/stairs, fights driven by the AI on both sides with no SYSTEM rescues
 * (the engine's own `passTurnIfHelpless` is what keeps a helpless fighter - Willy's own
 * included - from hanging the fight, same rule as Intereses).
 *
 * The expansion landed in pieces; this file turns assertions on as each piece shows up (see
 * the `describe.todo` blocks at the bottom for what hasn't yet):
 * - 10 floors, XP and character level-ups: landed (rulesets/willy/xp.ts, engine/progression.ts).
 * - the show (audience, sponsors, the presenter's Share): landed (rulesets/willy/show/*).
 * - the collapse clock: landed (rulesets/willy/clock.ts).
 * - achievements, loot boxes and out-of-combat healing: not yet (see the `it.todo`s below) -
 *   watch origin/willy-meta.
 *
 * Two real bugs this harness found and reported were since fixed upstream (kept here as a
 * changelog, not a warning - no more guarding needed):
 * - a stray teleport in resolveNextEncounter (zone.x+1, zone.y+1 instead of a real walkable
 *   tile) could box Willy into a wall/shelf tile and hang a run forever; fixed below by
 *   scanning the zone for a walkable, unoccupied tile instead.
 * - a room collapse (rulesets/willy/clock.ts) despawning the entity a turn had just advanced
 *   to left `turn.activeEntityId` dangling, crashing the next AI decision; fixed upstream in
 *   engine/commands.ts (passTurnIfHelpless now re-runs after a ruleset's afterCommand too).
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
const CLASSES_TO_RUN = DEEP ? CLASS_IDS : [CLASS_IDS[0]!];
const MAX_STEPS = DEEP ? 4000 : 1500;
// Combat got noticeably heavier with the expansion's bigger floors/rosters (and the AI's own
// environment awareness) - individual fights now routinely take 1-4s of AI "thinking" alone,
// so a two-floor smoke run and a ten-floor deep run both need generous budgets. The smoke
// budget in particular needs real headroom: run inside the full `npm test` suite (dozens of
// files competing for CPU across workers) it took ~90s vs. ~35s standalone. The final floor's
// boss (jefe-presentador, kept above 0 HP by Share) can make a full 10-floor run take several
// minutes for some classes - "jugador-de-basket" took ~410s against a 180s budget.
const TEST_TIMEOUT = DEEP ? 600_000 : 120_000;

const MAX_SKILL_LEVEL = SKILL_THRESHOLDS.length;

// One run per class, memoized: a full run is expensive, and the softlock, show and skill
// progression checks below all want to inspect the *same* run rather than resimulating it.
const runCache = new Map<string, ReturnType<typeof runFullGame>>();
function runFor(classId: string): ReturnType<typeof runFullGame> {
  let result = runCache.get(classId);
  if (!result) {
    const state = startRun(1, classId);
    result = runFullGame(engine, state, 'willy', MAX_STEPS);
    runCache.set(classId, result);
  }
  return result;
}

describe('Willy full run: casting through every floor, no softlock', () => {
  for (const classId of CLASSES_TO_RUN) {
    it(
      `"${classId}": the lift/stairs always lead somewhere, every fight ends (${DEEP ? 'full run' : 'first two floors'})`,
      () => {
        const result = runFor(classId);
        // eslint-disable-next-line no-console
        console.log(`${classId}: ${result.steps} steps, floors cleared ${result.floorsCleared}, visited [${result.visitedMaps.join(', ')}]`);
        expect(result.steps, `"${classId}": did not settle within ${MAX_STEPS} steps - possible softlock`).toBeLessThan(MAX_STEPS);
        // A run that ends because Willy himself went down is a real "game over" (expected,
        // even likely, while there's no out-of-combat healing or potions yet to recover
        // between back-to-back fights - see the `it.todo`s below) - not a softlock, so it's
        // reported rather than asserted against.
        const wentDown = !willy.isStanding(result.state.entities.willy!);
        if (wentDown) return;
        if (!DEEP) {
          // Smoke only needs to prove the first two floors work; the deep run goes further.
          expect(result.floorsCleared, `"${classId}": did not clear even one floor`).toBeGreaterThanOrEqual(1);
          return;
        }
        expect(result.floorsCleared, `"${classId}": should have cleared all 10 floors`).toBe(10);
      },
      TEST_TIMEOUT,
    );
  }
});

/**
 * The show: landed (rulesets/willy/show/*, configured by content/willy/show.ts, which
 * setup.ts imports). Audience events fire during a normal run and audiencia.valor never
 * drops below the current planta's floor (content/willy/data/audience.json -> porPlanta).
 */
describe('the show: audience events fire and stay within bounds', () => {
  for (const classId of CLASSES_TO_RUN.slice(0, 1)) {
    it(
      `a run produces audienceChanged events, and the audience never drops below its floor (${classId})`,
      () => {
        const result = runFor(classId);
        const audienceEvents = result.events.filter((e) => e.type === 'audienceChanged') as (WillyEvent & { delta: number; espectadores: number; causa: string })[];
        expect(audienceEvents.length, 'no audienceChanged events over the whole run - is content/willy/show wired up?').toBeGreaterThan(0);
        const minimum = show.floorMinimum(result.state);
        const audience = show.audienceOf(result.state);
        expect(audience, 'state.systems.audiencia is missing at the end of the run').toBeDefined();
        expect(audience!.valor, `audience dropped below its planta's floor (${minimum})`).toBeGreaterThanOrEqual(minimum);
        // A kill should be one of the causes seen (audience.json's "eliminar" rule) with a
        // positive swing - the show should react to the fights the run is full of.
        const killBumps = audienceEvents.filter((e) => e.causa === 'eliminar' && e.delta > 0);
        expect(killBumps.length, 'no positive "eliminar" audienceChanged event - a kill should always grow the audience').toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );
  }
});

describe('class progression: skills reach their top use-tier before the final floor', () => {
  for (const classId of CLASSES_TO_RUN) {
    it.runIf(DEEP)(
      `"${classId}" has at least one ability at skill level ${MAX_SKILL_LEVEL} by the last floor`,
      () => {
        const result = runFor(classId);
        if (!willy.isStanding(result.state.entities.willy!)) return; // a run-ending defeat is reported above, not asserted here.
        const maxima = result.events.filter((e): e is WillyEvent & { habilidad: string; nivel: number } => e.type === 'skillLevelUp' && Number((e as { nivel?: number }).nivel) >= MAX_SKILL_LEVEL);
        const willyEntity = result.state.entities.willy!;
        expect(maxima.length, `"${classId}" never reached skill level ${MAX_SKILL_LEVEL} on any ability over the run (events seen: ${result.events.filter((e) => e.type === 'skillLevelUp').length})`).toBeGreaterThan(0);
        expect(skillLevel(willyEntity, maxima[0]!.habilidad), 'skillLevelUp event disagrees with the live skillLevel() reading').toBe(MAX_SKILL_LEVEL);
      },
      TEST_TIMEOUT,
    );
  }
});

/**
 * The collapse clock: landed (rulesets/willy/clock.ts). Its own mechanics (warnings,
 * cracking/falling order, Willy being dragged out, the "derrumbe" exit) already have thorough
 * unit coverage in tests/content/willy-clock.test.ts - this full-run level only checks that a
 * normal AI-driven run actually exercises it and never gets stuck, i.e. every floor the run
 * leaves is left either by a clean exit or by the collapse, never neither.
 */
describe('collapse timer: the floor always resolves, never leaves the party stuck', () => {
  for (const classId of CLASSES_TO_RUN.slice(0, 1)) {
    it(
      `every "planta-*" floor the run leaves is left cleanly or by the collapse, never stuck (${classId})`,
      () => {
        const result = runFor(classId);
        expect(result.events.some((e) => e.type === 'floorEntered'), 'no floorEntered event - is rulesets/willy/clock wired into afterCommand?').toBe(true);
        const exits = result.events.filter((e): e is WillyEvent & { metodo: string; planta: number } => e.type === 'floorExited');
        expect(exits.length, `"${classId}": never left a single floor over the run`).toBeGreaterThan(0);
        // Every floorExited is one of the two sanctioned ways out - never a bare "the floor
        // disappeared and nothing recorded why" (the actual stuck case this test exists for).
        for (const exit of exits) expect(['escalera', 'derrumbe'], `unexpected floorExited.metodo "${exit.metodo}"`).toContain(exit.metodo);
        // The collapse timer is reflected in GameState (a resource/systems entry), not just a
        // UI countdown: state.systems.clock, read via clockOf(), should have shown up at some
        // point - checked on the state right after the first floorEntered, since by the end of
        // the run clockOf() may be undefined again (the Camerino clears it between floors).
        expect(result.events.filter((e) => e.type === 'clockStarted').length, 'clock never started - not reflected in state').toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );
  }

  it('leaving through the stairs before the clock runs out skips the collapse cleanly', () => {
    // Most floors are cleared well inside the clock's budget (the fights above typically take
    // single-digit minutes of in-fiction time against a 15-45 minute floor clock), so a normal
    // run's early floors should show the clean exit: floorExited{metodo:'escalera'} with no
    // clockExpired for that same floor beforehand.
    const result = runFor(CLASSES_TO_RUN[0]!);
    const events = result.events;
    let sawCleanExit = false;
    let expiredSinceLastExit = false;
    for (const e of events) {
      if (e.type === 'clockExpired') expiredSinceLastExit = true;
      if (e.type === 'floorExited') {
        const metodo = (e as unknown as { metodo: string }).metodo;
        if (metodo === 'escalera' && !expiredSinceLastExit) sawCleanExit = true;
        expiredSinceLastExit = false;
      }
    }
    expect(sawCleanExit, 'never saw a floorExited{metodo:"escalera"} without a prior clockExpired - either every floor is timing out, or the clean-exit path is broken').toBe(true);
  });

  it('the collapse timer is reflected in GameState (clockOf), not just a UI countdown', () => {
    const state = newWillyGame(engine, 1, { start: 'planta-1' });
    // The clock starts on the first command's afterCommand hook, not on map entry itself (see
    // tests/content/willy-clock.test.ts) - any legal no-op-ish command triggers it; endTurn on
    // Willy outside combat is rejected, so nudge him with a wait-in-place-equivalent: a move
    // onto his own tile is also rejected, so use the same "move to a free neighbour" the clock's
    // own test file uses.
    const w = state.entities.willy!;
    let moved: ReturnType<typeof engine.apply> | undefined;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const r = engine.apply(state, { type: 'move', issuer: 'player:1', entityId: 'willy', to: { x: w.position.x + dx, y: w.position.y + dy } } as never);
      if (r.ok) { moved = r; break; }
    }
    expect(moved?.ok, 'Willy could not take a single step on a fresh planta-1 to trigger the clock').toBe(true);
    const clock = clockOf((moved as { state: typeof state }).state);
    expect(clock, 'state.systems.clock is empty after a command - not reflected in GameState').toBeDefined();
    expect(clock!.mapa).toBe('planta-1');
    expect(clock!.remaining).toBeGreaterThan(0);
    expect(clock!.total).toBeGreaterThan(0);
  });
});

describe.todo('achievements unlock on the expected events', () => {
  it.todo('defeating the first boss unlocks its achievement (event achievementUnlocked)');
  it.todo('clearing all 10 floors unlocks the season-complete achievement');
  it.todo('an achievement never fires twice for the same run');
});

describe.todo('loot boxes open and grant a usable item', () => {
  it.todo('a boxDelivered box resolves (via the box system) into an item from loot-tables.json');
  it.todo('the granted item is usable (consumable or equip) via a real command, not just added to an inventory list');
});

describe.todo('HP regenerates out of combat', () => {
  it.todo('Willy and companions regain HP over time/steps while not in a fight');
  it.todo('regeneration stops (or is much slower) while a fight is active');
});

describe.todo('the presenter boss (jefe-presentador): "en antena" while Share is above zero', () => {
  it.todo('the boss cannot be reduced below 1 HP while share > 0 (enAntena)');
  it.todo('once share hits 0 (shareCero), the boss can be finished off normally');
});
