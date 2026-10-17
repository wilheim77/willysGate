import type { Vec2 } from './grid';
import { hasLineOfSight } from './los';
import { surfacesOf } from './surfaces';
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
  /** Visual only: which prop the renderer draws for it (e.g. 'torch_wall', 'brazier'). */
  prop?: string;
}

export interface LightingState {
  /** 0 = pitch black, 1 = full daylight. */
  ambient: number;
  lights: LightSource[];
}

export const LIGHTING_SYSTEM = 'lighting';

/** Lighting of a state; maps without lighting data are fully lit. Burning surfaces add their own light. */
export function lightingOf(state: GameState): LightingState {
  const raw = (state.systems[LIGHTING_SYSTEM] as unknown as LightingState | undefined) ?? { ambient: 1, lights: [] };
  const fromSurfaces: LightSource[] = Object.entries(surfacesOf(state))
    .filter(([, s]) => s.light)
    .map(([key, s]) => {
      const [x, y] = key.split(',').map(Number) as [number, number];
      return { id: `surface:${key}`, position: { x, y }, radius: s.light!.radius, intensity: s.light!.intensity, flicker: 0.25, ...(s.light!.color ? { color: s.light!.color } : {}) };
    });
  return fromSurfaces.length ? { ...raw, lights: [...raw.lights, ...fromSurfaces] } : raw;
}

/** Stored lighting only (without surface lights), for editing. */
export function storedLighting(state: GameState): LightingState {
  return (state.systems[LIGHTING_SYSTEM] as unknown as LightingState | undefined) ?? { ambient: 1, lights: [] };
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
 * falloff. Walls block light (line of sight from the source).
 */
export function lightLevelAt(state: GameState, pos: Vec2): number {
  const { ambient, lights } = lightingOf(state);
  let level = ambient;
  for (const light of lights) {
    const p = lightPosition(state, light);
    if (!p) continue;
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d >= light.radius) continue;
    if (!hasLineOfSight(state, p, pos)) continue;
    level = Math.max(level, light.intensity * (1 - d / light.radius));
  }
  return Math.min(1, level);
}
