import type { GridMap, Vec2 } from './grid';
import { type RngState, seedRng } from './rng';

/** Bump when GameState's shape changes, and add a migration in save.ts. */
export const SCHEMA_VERSION = 1;

/**
 * Who issues commands for an entity: 'player:1', 'player:2', 'ai'...
 * Mutable at runtime: companions may leave the party or turn hostile mid-act.
 */
export type ControllerId = string;

export type FlagValue = boolean | number | string;

export interface Entity {
  id: string;
  name: string;
  controllerId: ControllerId;
  /** Allegiance, e.g. 'party', 'cuadrilla', 'abadia'. Also mutable at runtime. */
  factionId: string;
  position: Vec2;
  /** Movement per turn in tiles (5e speed / 5 ft). */
  speed: number;
  /** Key into the asset manifest; the core never interprets it. */
  spriteId: string;
}

export interface TurnState {
  mode: 'exploration' | 'combat';
  round: number;
  /** Entity whose turn it is in combat; null in exploration. */
  activeEntityId: string | null;
}

export interface GameState {
  schemaVersion: number;
  seed: number;
  rng: RngState;
  map: GridMap;
  entities: Record<string, Entity>;
  flags: Record<string, FlagValue>;
  turn: TurnState;
}

export interface NewGameOptions {
  seed: number;
  map: GridMap;
  entities: Entity[];
}

export function createGameState({ seed, map, entities }: NewGameOptions): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: seed >>> 0,
    rng: seedRng(seed),
    map,
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    flags: {},
    turn: { mode: 'exploration', round: 0, activeEntityId: null },
  };
}

export function entityAt(state: GameState, p: Vec2): Entity | undefined {
  return Object.values(state.entities).find((e) => e.position.x === p.x && e.position.y === p.y);
}
