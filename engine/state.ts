import type { GridMap, Vec2 } from './grid';
import { type RngState, seedRng } from './rng';

/** Bump when GameState's shape changes, and add a migration in save.ts. */
export const SCHEMA_VERSION = 1;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Who issues commands for an entity: 'player:1', 'player:2', 'ai'...
 * Mutable at runtime: companions may leave the party or turn hostile mid-act.
 */
export type ControllerId = string;

export type FlagValue = boolean | number | string;

/** A depletable pool: hit points, spell slots, actions per turn, Thirst, Faith... Defined by the ruleset. */
export interface Resource {
  current: number;
  max: number;
}

export interface AppliedCondition {
  /** Key into the ruleset's condition definitions. */
  id: string;
  sourceId?: string;
  /** Turns left; undefined means until removed. */
  remainingTurns?: number;
}

/**
 * A creature or object on the map. The engine never interprets stat, resource,
 * condition or tag keys: their meaning comes from the ruleset.
 */
export interface Entity {
  id: string;
  name: string;
  controllerId: ControllerId;
  /** Allegiance, e.g. 'party', 'cuadrilla'. Mutable at runtime. */
  factionId: string;
  position: Vec2;
  /** Key into the game's asset manifest. */
  spriteId: string;
  /** Numeric values, e.g. { str: 15, speed: 6 } in 5e. */
  stats: Record<string, number>;
  resources: Record<string, Resource>;
  conditions: AppliedCondition[];
  /** Free-form labels, e.g. 'class:fighter', 'race:elf', 'prof:persuasion'. */
  tags: string[];
}

export interface TurnState {
  mode: 'exploration' | 'combat';
  round: number;
  /** Entity whose turn it is in combat; null in exploration. */
  activeEntityId: string | null;
}

export interface GameState {
  schemaVersion: number;
  /** Which game (content pack) this state belongs to, e.g. 'intereses'. */
  gameId: string;
  rulesetId: string;
  rulesetVersion: number;
  seed: number;
  rng: RngState;
  map: GridMap;
  entities: Record<string, Entity>;
  flags: Record<string, FlagValue>;
  turn: TurnState;
  /** Per-system state for engine systems added over time (surfaces, lighting...). */
  systems: Record<string, JsonValue>;
}

export interface NewGameOptions {
  gameId: string;
  ruleset: { id: string; version: number };
  seed: number;
  map: GridMap;
  entities: Entity[];
}

export function createGameState({ gameId, ruleset, seed, map, entities }: NewGameOptions): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    gameId,
    rulesetId: ruleset.id,
    rulesetVersion: ruleset.version,
    seed: seed >>> 0,
    rng: seedRng(seed),
    map,
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    flags: {},
    turn: { mode: 'exploration', round: 0, activeEntityId: null },
    systems: {},
  };
}

export function entityAt(state: GameState, p: Vec2): Entity | undefined {
  return Object.values(state.entities).find((e) => e.position.x === p.x && e.position.y === p.y);
}

export function stat(entity: Entity, id: string, fallback = 0): number {
  return entity.stats[id] ?? fallback;
}

export function hasTag(entity: Entity, tag: string): boolean {
  return entity.tags.includes(tag);
}

/** Value after a tag prefix, e.g. tagValue(e, 'class') -> 'fighter' for 'class:fighter'. */
export function tagValue(entity: Entity, prefix: string): string | undefined {
  const tag = entity.tags.find((t) => t.startsWith(`${prefix}:`));
  return tag?.slice(prefix.length + 1);
}

export function hasCondition(entity: Entity, id: string): boolean {
  return entity.conditions.some((c) => c.id === id);
}
