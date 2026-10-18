import type { GameEvent } from './command-types';
import { applyEffects } from './effects';
import type { Ruleset } from './ruleset';
import type { Entity, GameState } from './state';

/**
 * Shared party progress: one pool of points the whole party earns together (experience in
 * 5e). Points come from winning fights (the ruleset says what each defeated foe is worth)
 * and from the `gainProgress` effect (a conversation that settles a fight without one).
 * The game's content sets the thresholds; the ruleset rebuilds a character at a new level.
 * The engine only adds points up and compares them to the thresholds.
 */

/** Content side of progression: the points the party needs to reach each level. */
export interface ProgressionContent {
  /** Level -> total points needed, e.g. { 4: 300, 5: 900 }. Levels missing here are never reached by points. */
  thresholds: Record<number, number>;
}

/** state.systems.progress. */
export interface ProgressState {
  points: number;
  /** Ids of one-time awards already paid (gainProgress with an id). */
  awarded?: string[];
}

/** Party members reached a new level. `from` is the lowest level any of them had before. */
export interface LeveledUpEvent extends GameEvent {
  type: 'leveledUp';
  level: number;
  from: number;
  entityIds: string[];
}

export function progressOf(state: GameState): number {
  return (state.systems.progress as unknown as ProgressState | undefined)?.points ?? 0;
}

/** The highest level whose threshold `points` meets, or 0 when none does. */
export function levelForPoints(content: ProgressionContent, points: number): number {
  let best = 0;
  for (const [level, need] of Object.entries(content.thresholds)) if (points >= need && Number(level) > best) best = Number(level);
  return best;
}

/** The next level above `level` that points can reach, and how many points it needs. */
export function nextLevel(content: ProgressionContent, level: number): { level: number; points: number } | null {
  const above = Object.entries(content.thresholds)
    .map(([l, p]) => ({ level: Number(l), points: p }))
    .filter((t) => t.level > level)
    .sort((a, b) => a.level - b.level);
  return above[0] ?? null;
}

/** Who shares the party's progress: everyone a player controls that the ruleset can level. */
function partyMembers(ruleset: Ruleset, state: GameState): Entity[] {
  const p = ruleset.progression;
  if (!p) return [];
  return Object.values(state.entities).filter((e) => e.controllerId.startsWith('player') && p.levelOf(e) !== null);
}

/**
 * Raises every party member below the level the pool has earned. Runs after each command,
 * but waits while a fight or a conversation is going on, so the level-up lands once the
 * dust settles (and a companion who joins later catches up straight away).
 */
export function applyProgression(ruleset: Ruleset, state: GameState, content: ProgressionContent | undefined): { state: GameState; events: GameEvent[] } {
  const p = ruleset.progression;
  if (!p || !content || state.turn.mode === 'combat' || state.systems.dialogue) return { state, events: [] };
  const earned = levelForPoints(content, progressOf(state));
  if (!earned) return { state, events: [] };
  const behind = partyMembers(ruleset, state).filter((e) => (p.levelOf(e) ?? earned) < earned);
  if (!behind.length) return { state, events: [] };
  const from = Math.min(...behind.map((e) => p.levelOf(e)!));
  const r = applyEffects(
    ruleset,
    state,
    behind.map((e) => ({ type: 'replaceEntity' as const, entity: p.levelUp(state, e, earned) })),
  );
  const up: LeveledUpEvent = { type: 'leveledUp', level: earned, from, entityIds: behind.map((e) => e.id) };
  return { state: r.state, events: [...r.events, up] };
}
