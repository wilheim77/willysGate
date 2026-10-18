export interface TerrainArt {
  tileset: string;
  /** Top-surface variants, picked per tile (stable per position). */
  frames: number[];
  /** Vertical texture shown under raised tiles (cliffs, wall faces). */
  face: number;
  /** Optional lip drawn once at the south edge of raised tiles (only its top rows are opaque). */
  rim?: number;
  /** Face drawn instead of `face` where a walkable tile is one step above walkable ground (stairs). */
  stair?: number;
  /**
   * Soft edges onto lower-priority neighbours at the same height: overlay frames (mostly
   * transparent) for the side of the neighbour that touches this terrain.
   */
  blend?: { priority: number; edges: Partial<Record<'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw', number>> };
}

/** Animated decoration or effect (torches, blood decals, hit sparks), drawn by the client. */
export interface PropArt {
  url: string;
  frames: Rect[];
  fps: number;
  loop: boolean;
  /** 'wall': on a wall face above the tile; 'floor': feet on the tile centre; 'centre': tile centre. */
  anchor: 'wall' | 'floor' | 'centre';
  /** Light colour if this prop is a light source. */
  light?: string;
}

export interface LpcAnimation {
  /** Pixel row where this animation starts in the sheet. */
  y: number;
  frameSize: number;
  frames: number;
  /** 4 = rows for north, west, south, east; 1 = single row (hurt). */
  rows: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How to play one ability/spell's VFX props (`fx_*` ids into this manifest's own `props`),
 * keyed by whatever id the game's events carry (dnd5e's `spellId`, or a game's own ability
 * id). See docs/ART_CATALOG.md "Efectos de conjuros y habilidades" for the Intereses set.
 */
export type SpellFx =
  /** From the caster to the target, rotated to the travel angle; `count` > 1 staggers several (Magic Missile). */
  | { kind: 'projectile'; fx: string; impactFx?: string; tilesPerSec?: number; count?: number; staggerMs?: number }
  /** A beam stretched along the caster-target line for a fixed time, then an impact. */
  | { kind: 'ray'; fx: string; impactFx?: string; durationMs?: number }
  /** Once, at the target (or the caster if there is none) — a touch spell or a single mote. */
  | { kind: 'instant'; fx: string }
  /** One flare per tile of the event's `tiles` (computed by the engine/ruleset), staggered by distance from the caster. */
  | { kind: 'cone'; fx: string; delayPerTileMs?: number }
  /** A bead flies to the target, then the burst plays there (Fireball). */
  | { kind: 'burst'; beadFx: string; fx: string; tilesPerSec?: number }
  /** Centred on the caster (Thunderwave; Turn Undead also flashes `extraFx` on the caster). */
  | { kind: 'ring'; fx: string; extraFx?: string };

export type SpriteArt =
  /** 4-direction character sheet built by scripts/art/build-characters.ts from LPC layers. */
  | { kind: 'lpc'; url: string; animations: Record<string, LpcAnimation> }
  /**
   * 2-direction sprite from a packed atlas (e.g. 0x72): frames per logical animation
   * (idle, move, hit...). Drawn facing `facing`; the renderer flips it for the other side.
   */
  | { kind: 'frames'; url: string; facing: 'left' | 'right'; animations: Record<string, Rect[]>; scale?: number };

/** Per-game mapping from game ids (terrain, spriteId) to art files. See content/<game>/assets/manifest.json. */
export interface AssetManifest {
  tile: { size: number; levelHeight: number };
  /** Colour grade for this art preset (overrides the theme's); see Theme.colorGrade. */
  grade?: { saturation: number; brightness: number; tint?: string };
  tilesets: Record<string, { url: string; frameWidth: number; frameHeight: number }>;
  terrain: Record<string, TerrainArt>;
  sprites: Record<string, SpriteArt>;
  props?: Record<string, PropArt>;
  /**
   * Which prop (into `props`, anchor 'floor') to show in place of a dead creature's sprite,
   * keyed by spriteId, with a 'default' fallback. Missing entirely: the client falls back
   * to a generic code-drawn corpse (lying flat, darkened, blood decal) instead.
   */
  corpses?: Record<string, string>;
  /** Animated overlays for surfaces (oil, fire, ice...), drawn over the floor. */
  surfaces?: Record<string, { url: string; frames: Rect[]; fps: number; loop: boolean }>;
  /** Hand-made HUD portraits by spriteId; otherwise the HUD crops the sprite's idle frame. */
  portraits?: Record<string, Rect & { url: string }>;
  /** VFX per spell/ability id (see `SpellFx`). Missing ids fall back to a generic ring flourish. */
  fx?: Record<string, SpellFx>;
  /**
   * Which engine event triggers the 'cast' animation + `fx` lookup, and which of its fields
   * hold the caster, the ability/spell id, the target and (for area effects) the tiles —
   * defaults to dnd5e's `spellCast` shape (casterId/spellId/target/tiles) when omitted, so
   * existing content needs nothing extra.
   */
  castEvent?: { type: string; casterField: string; idField: string; targetField: string; tilesField?: string };
}

export const tilesetKey = (id: string): string => `tileset:${id}`;
export const spriteKey = (id: string): string => `sprite:${id}`;

/** Resolves a manifest URL against the deploy base path (GitHub Pages serves under /willysGate/<game>/). */
export const assetUrl = (url: string): string => import.meta.env.BASE_URL + url;
