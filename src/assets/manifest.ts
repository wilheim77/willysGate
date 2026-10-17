export interface TerrainArt {
  tileset: string;
  /** Top-surface variants, picked per tile (stable per position). */
  frames: number[];
  /** Vertical texture shown under raised tiles (cliffs, wall faces). */
  face: number;
  /** Optional lip drawn once at the south edge of raised tiles (only its top rows are opaque). */
  rim?: number;
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
  /** Animated overlays for surfaces (oil, fire, ice...), drawn over the floor. */
  surfaces?: Record<string, { url: string; frames: Rect[]; fps: number; loop: boolean }>;
  /** Hand-made HUD portraits by spriteId; otherwise the HUD crops the sprite's idle frame. */
  portraits?: Record<string, Rect & { url: string }>;
}

export const tilesetKey = (id: string): string => `tileset:${id}`;
export const spriteKey = (id: string): string => `sprite:${id}`;

/** Resolves a manifest URL against the deploy base path (GitHub Pages serves under /willysGate/<game>/). */
export const assetUrl = (url: string): string => import.meta.env.BASE_URL + url;
