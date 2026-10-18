import {
  SYSTEM_ISSUER,
  inZone,
  nextAiCommand,
  zonesOf,
  type BaseCommand,
  type Engine,
  type GameState,
  type MapZone,
} from '../../../engine';
import { willy } from '../../../rulesets/willy';

/**
 * A DOM-free full-run driver for "Willy el mazmorrero", built the same way as Intereses'
 * tests/playthrough/driver.ts (replicating src/game/controller.ts's `onIdle`: encounters ->
 * exits, since Willy has no dialogues/triggers/levels yet), so it's ready the moment the
 * Willy and meta agents' branches land (longer runs, more floors, a collapse timer,
 * achievements, loot boxes, out-of-combat healing - see tests/playthrough/willy/
 * fullRun.test.ts for the matching assertions, most of them `it.todo` until then).
 */

function standAt(state: GameState, entityId: string, p: { x: number; y: number }): GameState {
  return { ...state, entities: { ...state.entities, [entityId]: { ...state.entities[entityId]!, position: p } } };
}

/** Runs every turn through nextAiCommand, both sides, exactly as a real fight would be
 *  driven (no SYSTEM rescues - the engine's own `passTurnIfHelpless` handles a fighter,
 *  including Willy's own, who goes down mid-turn). Throws if the fight doesn't end. */
export function resolveCombat(engine: Engine, state: GameState, maxCommands = 600): GameState {
  let s = state;
  let guard = 0;
  while (s.turn.mode === 'combat' && guard++ < maxCommands) {
    const activeId = s.turn.activeEntityId;
    if (!activeId) throw new Error('in combat with no active entity');
    const cmd = nextAiCommand(willy, s, activeId);
    const r = engine.apply(s, cmd);
    if (!r.ok) throw new Error(`AI command rejected for ${activeId}: ${JSON.stringify(r.error)}`);
    s = r.state;
  }
  if (s.turn.mode === 'combat') throw new Error(`fight did not end within ${maxCommands} commands (round ${s.turn.round})`);
  return s;
}

/** Stands the leader in an "encounters" zone with standing foes and fights it, if any
 *  remain on the current map. Returns null once every encounter here is resolved. */
export function resolveNextEncounter(engine: Engine, state: GameState, leaderId: string): GameState | null {
  const leader = state.entities[leaderId];
  if (!leader) return null;
  for (const zone of zonesOf(state, 'encounters')) {
    const foes = String(zone.properties.participants ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => state.entities[id] && willy.isStanding(state.entities[id]!));
    if (foes.length === 0) continue;
    const standing = inZone(zone, leader.position) ? state : standAt(state, leaderId, { x: zone.x + 1, y: zone.y + 1 });
    const party = Object.values(standing.entities)
      .filter((e) => e.factionId === leader.factionId && willy.isStanding(e))
      .map((e) => e.id);
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

export function takeExit(engine: Engine, state: GameState, leaderId: string, exit: MapZone): GameState {
  const standing = standAt(state, leaderId, { x: exit.x, y: exit.y });
  const r = engine.apply(standing, { type: 'travel', issuer: 'player:1', entityId: leaderId, mapId: String(exit.properties.to), spawn: String(exit.properties.spawn) } as BaseCommand & {
    entityId: string;
    mapId: string;
    spawn: string;
  });
  if (!r.ok) throw new Error(`travel via "${exit.name}" failed: ${JSON.stringify(r.error)}`);
  return r.state;
}

export interface RunResult {
  state: GameState;
  floorsCleared: number;
  visitedMaps: string[];
  steps: number;
}

/** Drives Willy from wherever `state` starts (the Camerino, fresh) to the last floor's own
 *  exit (or until nothing more can be done): resolve every encounter on the current map,
 *  then take its one exit. No chest-opening, achievements or clock yet - see
 *  fullRun.test.ts's `it.todo`s for those. */
export function runFullGame(engine: Engine, state: GameState, leaderId = 'willy', maxSteps = 4000): RunResult {
  let s = state;
  const visited: string[] = [s.map.id];
  let floorsCleared = 0;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    if (willy.isStanding(s.entities[leaderId]!) === false) break; // Willy himself is out: the run ends here, not a bug to assert against (see fullRun.test.ts).
    const fought = resolveNextEncounter(engine, s, leaderId);
    if (fought) {
      s = fought;
      continue;
    }
    const exit = theExit(s);
    if (!exit) break; // nowhere left to go - the last floor's own done state, or a dead end.
    const fromFloor = s.map.id;
    s = takeExit(engine, s, leaderId, exit);
    if (fromFloor.startsWith('planta-')) floorsCleared++;
    visited.push(s.map.id);
  }
  return { state: s, floorsCleared, visitedMaps: visited, steps };
}
