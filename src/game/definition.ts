import type { Engine, GameState, Ruleset } from '../../engine';
import type { AssetManifest } from '../assets/manifest';

/** Player-facing UI text for a game (Spanish). Error keys are engine/ruleset error codes. */
export interface UiTexts {
  errors: Record<string, string>;
  terrain: Record<string, string>;
  ui: Record<
    | 'save' | 'load' | 'export' | 'import' | 'new'
    | 'saved' | 'saveFailed' | 'loaded' | 'noSave' | 'exported' | 'imported'
    | 'newGame' | 'confirmNew' | 'height' | 'genericError',
    string
  >;
}

/** Visual identity of a game: CSS custom properties applied to the HUD, plus the UI font. */
export interface Theme {
  /** Keys are CSS custom property names without the leading dashes (bg, panel, iron, text, accent...). */
  colors: Record<string, string>;
  /** Background colour of the game canvas. */
  canvas: string;
  fontFamily: string;
  /**
   * Colour grade applied to the whole map by a camera filter, so packs with
   * different palettes read as one style. Negative saturation desaturates.
   */
  colorGrade?: { saturation: number; brightness: number; tint?: string };
  /** Optional stylesheet URL for the font (Google Fonts). */
  fontUrl?: string;
}

/**
 * Everything the generic client needs to run one game. Each game lives in
 * content/<game>/game.ts and exports one of these; the build picks it via GAME=<id>.
 */
export interface GameDefinition {
  id: string;
  title: string;
  ruleset: Ruleset;
  /**
   * Interchangeable art presets (asset manifests). The default is used unless the
   * URL asks for another with ?arte=<id>, which lets us compare packs on the same map.
   */
  art: { default: string; presets: Record<string, AssetManifest> };
  theme: Theme;
  texts: UiTexts;
  /** Controller id of the local player. */
  playerId: string;
  /** Entity the player controls at the start (party leader). */
  leaderId: string;
  newGame(engine: Engine, seed: number): GameState;
}
