import {
  SYSTEM_ISSUER,
  inZone,
  nextAiCommand,
  tileAt,
  zonesOf,
  type BaseCommand,
  type Engine,
  type GameEvent,
  type GameState,
  type MapZone,
  type Vec2,
} from '../../../engine';
import { willy } from '../../../rulesets/willy';

/**
 * A DOM-free full-run driver for "Willy el mazmorrero", built the same way as Intereses'
 * tests/playthrough/driver.ts (replicating src/game/controller.ts's `onIdle`: encounters ->
 * exits, since Willy has no dialogues/triggers/levels yet), so it's ready the moment each
 * piece of the expansion lands (10 floors, XP/level-ups, the show, achievements, loot
 * boxes, the collapse clock, out-of-combat healing - see tests/playthrough/willy/
 * fullRun.test.ts for the matching assertions, `it.todo` until each one does).
 *
 * Every step function returns the events the engine produced along the way, threaded up to
 * `runFullGame`'s result, so a test can inspect the whole run's events (skillLevelUp,
 * audienceChanged, meterChanged...) without re-simulating anything.
 */

interface Step {
  state: GameState;
  events: GameEvent[];
}

function standAt(state: GameState, entityId: string, p: Vec2): GameState {
  return { ...state, entities: { ...state.entities, [entityId]: { ...state.entities[entityId]!, position: p } } };
}

/** The first walkable, unoccupied tile inside `zone`'s bounds (scanning row by row), or the
 *  leader's own current position if the zone has none - never the bare corner-plus-one offset
 *  (reported by the Willy agent: an encounter zone spans its room including its furniture, so
 *  `zone.x+1, zone.y+1` can land Willy on a wall/shelf tile and box him in for good). */
function walkableSpotIn(state: GameState, zone: MapZone, fallback: Vec2): Vec2 {
  for (let y = zone.y; y < zone.y + zone.height; y++) {
    for (let x = zone.x; x < zone.x + zone.width; x++) {
      const p = { x, y };
      if (!tileAt(state.map, p)?.walkable) continue;
      if (Object.values(state.entities).some((e) => e.position.x === x && e.position.y === y && willy.occupiesTile?.(e))) continue;
      return p;
    }
  }
  return fallback;
}

/** Runs every turn through nextAiCommand, both sides, exactly as a real fight would be
 *  driven (no SYSTEM rescues - the engine's own `passTurnIfHelpless` handles a fighter,
 *  including Willy's own, who goes down mid-turn). Throws if the fight doesn't end. */
export function resolveCombat(engine: Engine, state: GameState, maxCommands = 600): Step {
  let s = state;
  const events: GameEvent[] = [];
  let guard = 0;
  while (s.turn.mode === 'combat' && guard++ < maxCommands) {
    const activeId = s.turn.activeEntityId;
    if (!activeId) throw new Error('in combat with no active entity');
    if (!s.entities[activeId]) {
      // Defensive: this used to be reachable when a room collapse despawned the entity whose
      // turn had just started (turn.activeEntityId left dangling) - fixed upstream in
      // engine/commands.ts (passTurnIfHelpless now re-runs after a ruleset's afterCommand
      // too). Kept as a named guard so a regression surfaces clearly instead of a cryptic
      // "Cannot read properties of undefined (reading 'controllerId')" inside nextAiCommand.
      throw new Error(`DESPAWNED_ACTIVE_ENTITY: turn.activeEntityId "${activeId}" is not in state.entities (order=${JSON.stringify(s.turn.order)}) - likely despawned by a room collapse mid-turn`);
    }
    const cmd = nextAiCommand(willy, s, activeId);
    const r = engine.apply(s, cmd);
    if (!r.ok) throw new Error(`AI command rejected for ${activeId}: ${JSON.stringify(r.error)}`);
    s = r.state;
    events.push(...r.events);
  }
  if (s.turn.mode === 'combat') throw new Error(`fight did not end within ${maxCommands} commands (round ${s.turn.round})`);
  return { state: s, events };
}

/** Stands the leader in an "encounters" zone with standing foes and fights it, if any
 *  remain on the current map. Returns null once every encounter here is resolved. */
export function resolveNextEncounter(engine: Engine, state: GameState, leaderId: string): Step | null {
  const leader = state.entities[leaderId];
  if (!leader) return null;
  for (const zone of zonesOf(state, 'encounters')) {
    const foes = String(zone.properties.participants ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => state.entities[id] && willy.isStanding(state.entities[id]!));
    if (foes.length === 0) continue;
    const standing = inZone(zone, leader.position) ? state : standAt(state, leaderId, walkableSpotIn(state, zone, leader.position));
    const party = Object.values(standing.entities)
      .filter((e) => e.factionId === leader.factionId && willy.isStanding(e))
      .map((e) => e.id);
    if (party.length === 0) return null; // the leader's side has no one left standing - nothing to fight with.
    const started = engine.apply(standing, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: [...party, ...foes] } as BaseCommand & {
      participants: string[];
    });
    if (!started.ok) throw new Error(`encounter "${zone.name}": startCombat failed (${JSON.stringify(started.error)})`);
    return resolveCombat(engine, started.state);
  }
  return null;
}

/** The one exit on the current map (the lift down, or the stairs to the next floor). */
export function theExit(state: GameState): MapZone | undefined {
  return zonesOf(state, 'exits')[0];
}

export function takeExit(engine: Engine, state: GameState, leaderId: string, exit: MapZone): Step {
  const standing = standAt(state, leaderId, { x: exit.x, y: exit.y });
  const r = engine.apply(standing, { type: 'travel', issuer: 'player:1', entityId: leaderId, mapId: String(exit.properties.to), spawn: String(exit.properties.spawn) } as BaseCommand & {
    entityId: string;
    mapId: string;
    spawn: string;
  });
  if (!r.ok) throw new Error(`travel via "${exit.name}" failed: ${JSON.stringify(r.error)}`);
  return { state: r.state, events: r.events };
}

export interface RunResult {
  state: GameState;
  floorsCleared: number;
  visitedMaps: string[];
  steps: number;
  /** Every event the engine produced over the whole run, in order (combat, travel, show...). */
  events: GameEvent[];
}

/** Drives Willy from wherever `state` starts (the Camerino, fresh) to the last floor's own
 *  exit (or until nothing more can be done): resolve every encounter on the current map,
 *  then take its one exit. No chest-opening, achievements or clock yet - see
 *  fullRun.test.ts's `it.todo`s for those.
 *
 *  `maxFloorsCleared` stops the run once that many "planta-*" floors have been left (right
 *  after taking that floor's exit, before touching the next one) - a smoke run's step budget
 *  alone isn't a reliable stand-in for "the first two floors": a build that clears floors
 *  fast and survives just keeps going to MAX_STEPS or death, not after two floors. */
export function runFullGame(engine: Engine, state: GameState, leaderId = 'willy', maxSteps = 4000, maxFloorsCleared = Infinity): RunResult {
  let s = state;
  const visited: string[] = [s.map.id];
  const events: GameEvent[] = [];
  let floorsCleared = 0;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    if (willy.isStanding(s.entities[leaderId]!) === false) break; // Willy himself is out: the run ends here, not a bug to assert against (see fullRun.test.ts).
    if (floorsCleared >= maxFloorsCleared) break;
    const fought = resolveNextEncounter(engine, s, leaderId);
    if (fought) {
      s = fought.state;
      events.push(...fought.events);
      continue;
    }
    const exit = theExit(s);
    if (!exit) break; // nowhere left to go - the last floor's own done state, or a dead end.
    const fromFloor = s.map.id;
    const traveled = takeExit(engine, s, leaderId, exit);
    s = traveled.state;
    events.push(...traveled.events);
    if (fromFloor.startsWith('planta-')) floorsCleared++;
    visited.push(s.map.id);
  }
  return { state: s, floorsCleared, visitedMaps: visited, steps, events };
}
