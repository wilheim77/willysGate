import type { Vec2 } from './grid';
import type { GameState } from './state';

/**
 * Light as game state, so rules can depend on it (stealth, darkvision, a vampire
 * ruleset's Light resource...). The engine only answers "how lit is this tile";
 * what darkness means is up to the ruleset. Rendering lives in the client.
 */
export interface LightSource {
  id: string;
  /** Fixed position, or follows an entity (a carried lantern) when `attachedTo` is set. */
  position?: Vec2;
  attachedTo?: string;
  /** Radius in tiles where the light reaches zero. */
  radius: number;
  /** 0..1 at the source. */
  intensity: number;
  /** Visual only: hex colour and flicker amount (0..1) for the renderer. */
  color?: string;
  flicker?: number;
}

export interface LightingState {
  /** 0 = pitch black, 1 = full daylight. */
  ambient: number;
  lights: LightSource[];
}

export const LIGHTING_SYSTEM = 'lighting';

/** Lighting of a state; maps without lighting data are fully lit. */
export function lightingOf(state: GameState): LightingState {
  const raw = state.systems[LIGHTING_SYSTEM] as unknown as LightingState | undefined;
  return raw ?? { ambient: 1, lights: [] };
}

export function withLighting(state: GameState, lighting: LightingState): GameState {
  return { ...state, systems: { ...state.systems, [LIGHTING_SYSTEM]: lighting as never } };
}

/** Current position of a light (its own, or its carrier's). Null if the carrier is gone. */
export function lightPosition(state: GameState, light: LightSource): Vec2 | null {
  if (light.attachedTo) return state.entities[light.attachedTo]?.position ?? null;
  return light.position ?? null;
}

/**
 * Light level 0..1 at a tile: the brightest of ambient and each light's linear
 * falloff. Walls do not block light yet; line of sight will be added with LoS (Phase 3).
 */
export function lightLevelAt(state: GameState, pos: Vec2): number {
  const { ambient, lights } = lightingOf(state);
  let level = ambient;
  for (const light of lights) {
    const p = lightPosition(state, light);
    if (!p) continue;
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d >= light.radius) continue;
    level = Math.max(level, light.intensity * (1 - d / light.radius));
  }
  return Math.min(1, level);
}
