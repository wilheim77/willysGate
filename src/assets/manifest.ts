export interface TerrainArt {
  tileset: string;
  frame: number;
  /** Colour of the block's side faces when the tile is raised. */
  side: string;
}

export type SpriteArt =
  | { kind: 'placeholder'; cloak: string; skin: string; trim: string }
  | { kind: 'spritesheet'; url: string; frameWidth: number; frameHeight: number };

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
