export interface TerrainArt {
  tileset: string;
  /** Top-face frame, or several variants picked per tile (stable per position). */
  frame?: number;
  frames?: number[];
  /**
   * Half-block sprite (one elevation level tall) stacked under raised tiles.
   * Without it the renderer draws flat side faces in `side`.
   */
  block?: { tileset: string; frame: number };
  side: string;
}

export type SpriteArt =
  | { kind: 'placeholder'; cloak: string; skin: string; trim: string }
  /**
   * Spell of Mastery layout: 4 columns x 6 rows. Rows 0-2 face south (towards the
   * camera), rows 3-5 north. Row 0: idle, alert, falling, dead. Row 1: walk cycle.
   * Row 2: attack 1-3, cast/point. Drawn facing screen-left; flipped for right.
   */
  | { kind: 'character'; url: string; frameWidth: number; frameHeight: number; feetY: number };

/** Per-game mapping from game ids (terrain, spriteId) to art files. See content/<game>/assets/manifest.json. */
export interface AssetManifest {
  tile: { width: number; height: number; levelHeight: number };
  tilesets: Record<string, { url: string; frameWidth: number; frameHeight: number }>;
  terrain: Record<string, TerrainArt>;
  sprites: Record<string, SpriteArt>;
}

export const tilesetKey = (id: string): string => `tileset:${id}`;
export const spriteKey = (id: string): string => `sprite:${id}`;

/** Resolves a manifest URL against the deploy base path (GitHub Pages serves under /willysGate/<game>/). */
export const assetUrl = (url: string): string => import.meta.env.BASE_URL + url;
