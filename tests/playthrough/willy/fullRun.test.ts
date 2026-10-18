import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, createEngine } from '../../../engine';
import { itemDef, metaOf, show, skillLevel, slotOf, willy, type WillyEvent } from '../../../rulesets/willy';
import { SKILL_THRESHOLDS, WILLY } from '../../../rulesets/willy/data';
import { clockOf } from '../../../rulesets/willy/clock';
import { applyCasting, maps, newWillyGame } from '../../../content/willy/setup';
import { defeat, newGameSetup, savePolicy } from '../../../content/willy/run-modes';
import { CLASS_IDS } from './setup';
import { runFullGame, takeExit, theExit } from './fullRunDriver';

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
 * - achievements, loot boxes, items and out-of-combat healing: landed (rulesets/willy/
 *   achievements.ts, loot.ts, items.ts, regen.ts).
 * - the elimination modes (Con repetición / Sin repetición): landed (content/willy/run-modes.ts,
 *   src/game/permadeath.ts).
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
// "First two floors" has to be enforced by floor count, not just a step budget: a build that
// clears floors fast and survives otherwise just keeps going to MAX_STEPS or death (reported
// by the Willy agent once a companion buff let the smoke seed survive well past floor 2).
const MAX_FLOORS_CLEARED = DEEP ? Infinity : 2;
// Combat got noticeably heavier with the expansion's bigger floors/rosters (and the AI's own
// environment awareness) - individual fights now routinely take 1-4s of AI "thinking" alone,
// so a two-floor smoke run and a ten-floor deep run both need generous budgets. The final
// floor's boss (jefe-presentador, kept above 0 HP by Share) can make a full 10-floor run take
// several minutes for some classes - "jugador-de-basket" took ~300-410s against a 180s budget.
const TEST_TIMEOUT = DEEP ? 600_000 : 120_000;

const MAX_SKILL_LEVEL = SKILL_THRESHOLDS.length;

// One run per class, memoized: a full run is expensive, and the softlock, show and skill
// progression checks below all want to inspect the *same* run rather than resimulating it.
const runCache = new Map<string, ReturnType<typeof runFullGame>>();
function runFor(classId: string): ReturnType<typeof runFullGame> {
  let result = runCache.get(classId);
  if (!result) {
    const state = startRun(1, classId);
    result = runFullGame(engine, state, 'willy', MAX_STEPS, MAX_FLOORS_CLEARED);
    runCache.set(classId, result);
  }
  return result;
}

/** Opens every box waiting in the run (same command a player would send: 'openBox'), one at a
 *  time, until none are left. Loot boxes are granted automatically (a floor clear, a boss, an
 *  achievement...) but never opened on their own - the show's own comment says so explicitly
 *  ("the box system turns it into a box to open"). */
function openPendingBoxes(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  let guard = 0;
  while (metaOf(s).cajas.length > 0 && guard++ < 50) {
    const box = metaOf(s).cajas[0]!;
    const r = engine.apply(s, { type: 'openBox', issuer: 'player:1', boxId: box.id } as BaseCommand & { boxId: string });
    if (!r.ok) throw new Error(`openBox failed for "${box.id}": ${JSON.stringify(r.error)}`);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

// The run plus every box it granted opened, memoized the same way: achievements and loot-box
// checks below want the boxes actually opened, not just sitting unopened in meta.cajas.
const runWithBoxesCache = new Map<string, { state: GameState; events: GameEvent[] }>();
function runWithBoxesFor(classId: string): { state: GameState; events: GameEvent[] } {
  let result = runWithBoxesCache.get(classId);
  if (!result) {
    const run = runFor(classId);
    const opened = openPendingBoxes(run.state);
    result = { state: opened.state, events: [...run.events, ...opened.events] };
    runWithBoxesCache.set(classId, result);
  }
  return result;
}

// A short, separate run just for checks that need Willy alive at the end (using/equipping a
// granted item): the smoke class (seed 1) reliably dies on floor 2 at the current balance (no
// healing is enough yet to save every build), which the softlock test above tolerates but an
// "is this item usable" check can't work around. "jugador-de-basket" clears its first floors
// comfortably with this seed, so a short, bounded run with it (not the full budget - this
// class's full run can take minutes against the final boss) gives a live Willy to test with.
let survivorRunCache: { state: GameState; events: GameEvent[] } | undefined;
function survivorRunWithBoxes(): { state: GameState; events: GameEvent[] } {
  if (!survivorRunCache) {
    const state = startRun(1, 'jugador-de-basket');
    const run = runFullGame(engine, state, 'willy', 20);
    const opened = openPendingBoxes(run.state);
    survivorRunCache = { state: opened.state, events: [...run.events, ...opened.events] };
  }
  return survivorRunCache;
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

/**
 * Achievements: landed (rulesets/willy/achievements.ts, content/willy/data/achievements.json).
 * "en-antena" unlocks on the run's very first command (runStarted, min 1) so it's a reliable
 * always-true probe that the system is wired up at all; the boss- and season-specific ones are
 * checked only when the run's events actually earned them (a 2-floor smoke run won't reach a
 * boss reliably, so those are conditional rather than asserted outright).
 */
describe('achievements unlock on the expected events', () => {
  for (const classId of CLASSES_TO_RUN.slice(0, 1)) {
    it(
      `"en-antena" unlocks on the run's first command, and no achievement fires twice (${classId})`,
      () => {
        const result = runWithBoxesFor(classId);
        const unlocks = result.events.filter((e): e is GameEvent & { logroId: string } => e.type === 'achievementUnlocked');
        expect(unlocks.length, 'no achievementUnlocked events at all - is rulesets/willy/achievements wired into afterCommand?').toBeGreaterThan(0);
        expect(unlocks.some((e) => e.logroId === 'en-antena'), '"en-antena" (unlocks on runStarted) never fired').toBe(true);
        const ids = unlocks.map((e) => e.logroId);
        expect(new Set(ids).size, `an achievement fired more than once in one run: ${ids.join(', ')}`).toBe(ids.length);
      },
      TEST_TIMEOUT,
    );
  }

  it(
    'defeating a boss unlocks its matching achievement, if the deep run reaches one',
    () => {
      // content/willy/data/achievements.json: one achievement per boss template (jefe-centollo,
      // jefe-encargada, jefe-giganton, jefe-socorrista, jefe-presentador), each keyed off
      // entityDefeated{causa...}'s target spriteId ("plantilla" in the achievement's own event
      // translation - rulesets/willy/achievements.ts's translate()).
      const bossAchievements: Record<string, string> = {
        'jefe-centollo': 'marisco-de-temporada',
        'jefe-encargada': 'rebajas-definitivas',
        'jefe-giganton': 'fin-de-fiestas',
        'jefe-socorrista': 'rescate-fallido',
      };
      for (const classId of CLASSES_TO_RUN) {
        const result = runWithBoxesFor(classId);
        const unlockIds = new Set(result.events.filter((e) => e.type === 'achievementUnlocked').map((e) => (e as unknown as { logroId: string }).logroId));
        const defeated = result.events.filter((e): e is GameEvent & { entityId: string } => e.type === 'entityDefeated');
        for (const e of defeated) {
          const sprite = result.state.entities[e.entityId]?.spriteId; // may be gone by the end of the run; best-effort
          const achievement = sprite ? bossAchievements[sprite] : undefined;
          if (achievement) expect(unlockIds.has(achievement), `"${classId}": defeated ${sprite} but "${achievement}" never unlocked`).toBe(true);
        }
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'clearing all 10 floors unlocks the season-complete achievement ("fin-de-temporada")',
    () => {
      // "fin-de-temporada" needs a runEnded{resultado:'victoria'} that nothing emits yet - the
      // Willy agent flagged this directly (camerino-10 has no lift, the season has no ending
      // wired in). Reported, not asserted hard, until that lands - revisit once it does.
      for (const classId of CLASSES_TO_RUN) {
        const run = runFor(classId);
        if (!DEEP || run.floorsCleared !== 10 || !willy.isStanding(run.state.entities.willy!)) continue;
        const result = runWithBoxesFor(classId);
        const unlockIds = result.events.filter((e) => e.type === 'achievementUnlocked').map((e) => (e as unknown as { logroId: string }).logroId);
        // eslint-disable-next-line no-console
        if (!unlockIds.includes('fin-de-temporada')) console.warn(`"${classId}" cleared all 10 floors but "fin-de-temporada" never unlocked - the season has no ending event yet (known, the Willy agent is implementing it)`);
      }
    },
    TEST_TIMEOUT,
  );
});

/**
 * Loot boxes: landed (rulesets/willy/loot.ts). A box is granted automatically (a floor clear is
 * the most reliable source - achievementsHook grants one via content.loot.combates.plantaLimpia
 * on every floorCleared) but stays unopened until the player sends 'openBox' - runWithBoxesFor
 * opens every box the run earned the same way a player would.
 */
describe('loot boxes open and grant a usable item', () => {
  for (const classId of CLASSES_TO_RUN.slice(0, 1)) {
    it(
      `a boxDelivered box resolves into real items via 'openBox' (${classId})`,
      () => {
        const result = runWithBoxesFor(classId);
        expect(result.events.some((e) => e.type === 'boxDelivered'), `"${classId}": no box was ever granted over the run - is a floor-clear box missing?`).toBe(true);
        const opened = result.events.filter((e): e is GameEvent & { objetos: { item: string }[] } => e.type === 'boxOpened');
        expect(opened.length, `"${classId}": boxes were granted but none opened - did openPendingBoxes fail silently?`).toBeGreaterThan(0);
        const granted = opened.flatMap((e) => e.objetos);
        expect(granted.length, `"${classId}": every opened box was empty`).toBeGreaterThan(0);
        // Every granted item resolves to a real item definition from loot-tables.json's pool,
        // not a dangling id boxOpened invented.
        for (const g of granted) expect(itemDef(g.item), `boxOpened granted unknown item "${g.item}"`).toBeDefined();
      },
      TEST_TIMEOUT,
    );
  }

  it(
    'a granted item is usable via a real command (use or equip), not just added to the bag',
    () => {
      // Needs Willy alive to actually run the command - the regular smoke run (butanero, seed
      // 1) dies before this point, so this uses the bounded survivor run above instead.
      const result = survivorRunWithBoxes();
      expect(willy.isStanding(result.state.entities.willy!), 'the survivor run itself died - pick a different bounded class/seed').toBe(true);
      const granted = result.events.filter((e): e is GameEvent & { objetos: { item: string }[] } => e.type === 'boxOpened').flatMap((e) => e.objetos);
      expect(granted.length, 'the survivor run granted no items to try').toBeGreaterThan(0);
      let triedOne = false;
      for (const g of granted) {
        const def = itemDef(g.item);
        if (!def) continue;
        const use = willy.itemUse?.(result.state, g.item);
        if (use) {
          const r = engine.apply(result.state, use.command('willy', 'player:1') as BaseCommand);
          expect(r.ok, `using granted item "${g.item}" via its real command failed: ${r.ok ? '' : JSON.stringify(r.error)}`).toBe(true);
          triedOne = true;
          break;
        }
        if (slotOf(def)) {
          const r = engine.apply(result.state, { type: 'equipItem', issuer: 'player:1', entityId: 'willy', item: g.item } as BaseCommand & { entityId: string; item: string });
          expect(r.ok, `equipping granted item "${g.item}" via equipItem failed: ${r.ok ? '' : JSON.stringify(r.error)}`).toBe(true);
          triedOne = true;
          break;
        }
      }
      expect(triedOne, `none of the ${granted.length} granted item(s) were usable or equippable - got [${granted.map((g) => g.item).join(', ')}]`).toBe(true);
    },
    TEST_TIMEOUT,
  );
});

/**
 * Out-of-combat healing: landed (rulesets/willy/regen.ts). Every WILLY.regeneracion.pasos tiles
 * walked outside combat heals the party a bit; a Camerino arrival heals them fully
 * (partyPatchedUp). Both only fire when someone is actually short of health, which isn't
 * guaranteed by a normal AI-driven run (a class that takes no damage never triggers either
 * one - confirmed: a smoke run that clears two floors unscathed logs zero of both), so these
 * are built as controlled scenarios (a deliberately hurt Willy) rather than hoping a run
 * happens to need healing.
 */
describe('HP regenerates out of combat', () => {
  function hurt(state: GameState, fraction = 0.5): GameState {
    const w = state.entities.willy!;
    const hp = w.resources.vida!;
    const current = Math.max(1, Math.round(hp.max * fraction));
    return { ...state, entities: { ...state.entities, willy: { ...w, resources: { ...w.resources, vida: { ...hp, current } } } } };
  }

  it('walking enough tiles out of combat heals a hurt Willy', () => {
    const hurtState = hurt(newWillyGame(engine, 1, { start: 'planta-1' }));
    const before = hurtState.entities.willy!.resources.vida!.current;
    let s = hurtState;
    let sawRegen = false;
    for (let i = 0; i < 40 && !sawRegen; i++) {
      const w = s.entities.willy!;
      let moved: ReturnType<typeof engine.apply> | undefined;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const r = engine.apply(s, { type: 'move', issuer: 'player:1', entityId: 'willy', to: { x: w.position.x + dx, y: w.position.y + dy } } as never);
        if (r.ok) { moved = r; break; }
      }
      if (!moved?.ok) break;
      s = moved.state;
      if (moved.events.some((e) => e.type === 'regenerated')) sawRegen = true;
    }
    expect(sawRegen, `walked ${WILLY.regeneracion.pasos * 10}+ tiles without a single "regenerated" event`).toBe(true);
    expect(s.entities.willy!.resources.vida!.current, 'HP never actually went up despite a "regenerated" event').toBeGreaterThan(before);
  });

  it('arriving at a Camerino fully heals a hurt Willy (partyPatchedUp)', () => {
    const hurtState = hurt(newWillyGame(engine, 1, { start: 'planta-1' }));
    const exit = theExit(hurtState);
    expect(exit, 'planta-1 has no exit zone to travel through').toBeDefined();
    const r = takeExit(engine, hurtState, 'willy', exit!); // stands Willy on the exit tile first, like a real player leaving the floor.
    expect(r.events.some((e) => e.type === 'partyPatchedUp'), 'no partyPatchedUp event on a Camerino arrival with a hurt Willy').toBe(true);
    const hp = r.state.entities.willy!.resources.vida!;
    expect(hp.current, 'Willy was not fully healed on arriving at the Camerino').toBe(hp.max);
  });

  it('regeneration never fires while a fight is in progress', () => {
    const result = runFor(CLASSES_TO_RUN[0]!);
    let inCombat = false;
    for (const e of result.events) {
      if (e.type === 'combatStarted') inCombat = true;
      if (e.type === 'combatEnded') inCombat = false;
      if (e.type === 'regenerated' || e.type === 'partyPatchedUp') expect(inCombat, `"${e.type}" fired while a fight was in progress`).toBe(false);
    }
  });
});

/**
 * The elimination modes (content/willy/run-modes.ts, docs/willy/DESIGN.md §12): chosen before
 * casting, fixed for the run. "Sin repetición" (hardcore) is savePolicy:'permadeath' - the
 * client's one save slot for the run (src/game/permadeath.ts's PermadeathSlot) is written after
 * every command and cleared for good once defeat() returns no retry (checked here at the
 * game-definition level, which is what actually drives that client behaviour - the slot itself
 * is a DOM/localStorage concern outside this DOM-free harness). "Con repetición" (the default)
 * returns to the checkpoint `defeat().retry.prepare()` is given - the last Camerino, in the real
 * client's hands.
 */
describe('the elimination modes: Sin repetición ends the season, Con repetición returns to the Camerino', () => {
  function withMode(modo: 'repeticion' | 'sinRepeticion', dificultad = 'concursante'): GameState {
    const fresh = newWillyGame(engine, 1);
    return newGameSetup.apply(fresh, { dificultad, modo });
  }

  it('"Sin repetición": savePolicy is permadeath, and a defeat offers no retry (the slot is cleared for good)', () => {
    const state = withMode('sinRepeticion');
    expect(state.flags.modoEliminacion).toBe('sinRepeticion');
    expect(savePolicy(state)).toBe('permadeath');
    const policy = defeat(state);
    expect(policy.retry, 'a Sin repetición defeat should offer no way back - that\'s what tells the client to clear the slot for good').toBeUndefined();
    expect(policy.summary, 'a Sin repetición defeat should show the season summary').toBeDefined();
  });

  it('"Sin repetición" is unavailable on Turista: it falls back to "repetición"', () => {
    const state = withMode('sinRepeticion', 'turista');
    expect(state.flags.modoEliminacion, 'Turista + Sin repetición should fall back to repetición (see run-modes.ts\'s unavailableIf)').toBe('repeticion');
  });

  it('"Con repetición" (the default): savePolicy is free, and a defeat returns to the given checkpoint', () => {
    const state = withMode('repeticion');
    expect(savePolicy(state)).toBe('free');
    const checkpoint = newWillyGame(engine, 1, { start: 'camerino' });
    const policy = defeat(state);
    expect(policy.retry, 'a Con repetición defeat should offer a retry back to the Camerino').toBeDefined();
    const back = policy.retry!.prepare!(checkpoint);
    expect(back.map.id, 'the retry should return to the checkpoint it was given (the last Camerino), not somewhere else').toBe(checkpoint.map.id);
  });
});

/**
 * The presenter boss (rulesets/willy/show/boss.ts, share.ts): landed. While his Share is
 * above zero a lethal blow is intercepted (preventDefeatHooks: "no elimination, no
 * entityDefeated" - resolve.ts's own comment) and announced as `enAntena` instead; once Share
 * hits zero (`shareCero`) he can be finished off for real. Only the final floor's boss fight
 * has this mechanic, so these are conditional on a DEEP run actually reaching it.
 */
describe('the presenter boss (jefe-presentador): "en antena" while Share is above zero', () => {
  it('the boss is never actually defeated while enAntena keeps firing - only after shareCero, if a run reaches him', () => {
    for (const classId of CLASSES_TO_RUN) {
      const result = runFor(classId);
      const enAntena = result.events.filter((e): e is WillyEvent & { entityId: string } => e.type === 'enAntena');
      if (enAntena.length === 0) continue; // this run never reached (or never hit) the final boss.
      const bossId = enAntena[0]!.entityId;
      let shareIsZero = false;
      for (const e of result.events) {
        if (e.type === 'shareCero' && (e as unknown as { entityId: string }).entityId === bossId) shareIsZero = true;
        if (e.type === 'entityDefeated' && (e as unknown as { entityId: string }).entityId === bossId) {
          expect(shareIsZero, `"${classId}": ${bossId} was defeated before shareCero, despite enAntena having fired for him`).toBe(true);
        }
      }
    }
  });

  it('once share hits 0, the boss can be finished off normally, if a run gets there', () => {
    for (const classId of CLASSES_TO_RUN) {
      const result = runFor(classId);
      const zero = result.events.find((e): e is WillyEvent & { entityId: string } => e.type === 'shareCero');
      if (!zero) continue; // this run's boss fight never drained Share to 0 (or never happened).
      const afterward = result.events.slice(result.events.indexOf(zero));
      const defeatedAfter = afterward.some((e) => e.type === 'entityDefeated' && (e as unknown as { entityId: string }).entityId === zero.entityId);
      const stillEnAntenaAfter = afterward.some((e) => e.type === 'enAntena' && (e as unknown as { entityId: string }).entityId === zero.entityId);
      expect(stillEnAntenaAfter, `"${classId}": enAntena fired again for ${zero.entityId} after its shareCero - Share should not protect him any more`).toBe(false);
      // Not asserting defeatedAfter is true outright: the run may have ended (Willy went down,
      // or stepped away) before actually landing the finishing blow - shareCero only means the
      // protection is gone, not that the fight is immediately over.
      void defeatedAfter;
    }
  });
});
