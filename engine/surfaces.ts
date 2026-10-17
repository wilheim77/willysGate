import { type Vec2, inBounds, posKey, tileAt } from './grid';
import type { GameState } from './state';

/**
 * Surfaces: a per-tile layer (oil, fire, water, ice...) defined entirely by data.
 * The ruleset declares the surface types and how elements transform them
 * (oil + fire = fire, water + cold = ice); the engine stores them, applies the
 * transformations, ages them each round and tells the ruleset when a creature
 * steps in or starts its turn on one. What a surface *does* to creatures is rules.
 */
export interface SurfaceDef {
  label: string;
  /** Rounds it lasts; omit for surfaces that stay until something changes them. */
  durationRounds?: number;
  /** Extra movement cost to enter a tile with it (rubble, deep water). */
  extraMoveCost?: number;
  /** Surfaces that give light (fire). */
  light?: { radius: number; intensity: number; color?: string };
  /** Visual hint for renderers without art for it. */
  color?: string;
  /** What it turns into when its duration runs out (electrified water → water). */
  expiresInto?: string;
  /** How bad it is to stand in, roughly in health points: the AI avoids ending moves on it. */
  hazard?: number;
  /** Thick enough to hide what's behind it (steam, smoke): blocks line of sight through the tile. */
  blocksSight?: boolean;
}

/** `surface` is the existing surface ('' for a bare tile); `result` null removes it. */
export interface SurfaceReaction {
  surface: string;
  element: string;
  result: string | null;
  /** The change runs through every connected tile of the same surface (fire along a pool of oil). */
  spreads?: boolean;
}

export interface SurfaceInstance {
  type: string;
  turnsLeft?: number;
  light?: SurfaceDef['light'];
  blocksSight?: boolean;
}

export const SURFACES_SYSTEM = 'surfaces';

export function surfacesOf(state: GameState): Record<string, SurfaceInstance> {
  return (state.systems[SURFACES_SYSTEM] as unknown as Record<string, SurfaceInstance> | undefined) ?? {};
}

export function surfaceAt(state: GameState, p: Vec2): SurfaceInstance | undefined {
  return surfacesOf(state)[posKey(p)];
}

export function withSurfaces(state: GameState, surfaces: Record<string, SurfaceInstance>): GameState {
  return { ...state, systems: { ...state.systems, [SURFACES_SYSTEM]: surfaces as never } };
}

export function makeSurface(defs: Record<string, SurfaceDef>, type: string, turns?: number): SurfaceInstance {
  const def = defs[type];
  if (!def) throw new Error(`Unknown surface "${type}"`);
  const s: SurfaceInstance = { type };
  const life = turns ?? def.durationRounds;
  if (life !== undefined) s.turnsLeft = life;
  if (def.light) s.light = def.light;
  if (def.blocksSight) s.blocksSight = true;
  return s;
}

/** Only tiles a surface can lie on: inside the map, not walls or holes. */
export function surfaceable(state: GameState, p: Vec2): boolean {
  const t = tileAt(state.map, p);
  return inBounds(state.map, p) && !!t && t.walkable;
}

/** Ages every timed surface by one round; returns the new layer and what changed. */
export function ageSurfaces(state: GameState, defs: Record<string, SurfaceDef> = {}): { state: GameState; changed: { tile: Vec2; from: string; to: string | null }[] } {
  const next: Record<string, SurfaceInstance> = {};
  const changed: { tile: Vec2; from: string; to: string | null }[] = [];
  for (const [key, s] of Object.entries(surfacesOf(state))) {
    if (s.turnsLeft === undefined) next[key] = s;
    else if (s.turnsLeft > 1) next[key] = { ...s, turnsLeft: s.turnsLeft - 1 };
    else {
      const [x, y] = key.split(',').map(Number) as [number, number];
      const into = defs[s.type]?.expiresInto;
      if (into && defs[into]) next[key] = makeSurface(defs, into);
      changed.push({ tile: { x, y }, from: s.type, to: into ?? null });
    }
  }
  return { state: withSurfaces(state, next), changed };
}
