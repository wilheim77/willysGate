import type { CreationChoices, CreationSpec, DialogueTree, DialogueWhen, Engine, GameState, MapBuilder, Ruleset } from '../../engine';
import type { AssetManifest } from '../assets/manifest';
import type { AudioManifest } from '../audio/types';

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
  /** Combat HUD and map texts (miss, crit, endTurn...). */
  combat?: Record<string, string>;
  /** Character creation screen texts (title, start, recommended...). */
  creation?: Record<string, string>;
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
  /** Protagonist creation: the ruleset's steps, default answers, and how the answers enter the game. */
  creation?: {
    spec: CreationSpec;
    defaults(): CreationChoices;
    apply(engine: Engine, state: GameState, choices: CreationChoices): GameState;
  };
  /** Named characters, so a conversation can show who speaks even when they're not on this map. */
  cast?: Record<string, { name: string; spriteId: string }>;
  /** Title screen key art (relative to the game's public folder). */
  titleImage?: string;
  /** Names and flavour of inventory items, by id (content/<game>/items.json). */
  items?: Record<string, { label: string; text?: string }>;
  /** Conversations and interactable scripts, by id (content/<game>/dialogues/*.json). */
  dialogues?: Record<string, DialogueTree>;
  /** Music states and sfx, and which engine events trigger them (content/<game>/assets/audio.json). */
  audio?: AudioManifest;
  /** The game's maps, by id, built the first time the party travels there. */
  maps?: Record<string, MapBuilder>;
  /** Conversations the game opens by itself, once, when their condition holds (out of combat, idle). */
  triggers?: { id: string; when: DialogueWhen; dialogue: string; partner?: string; map?: string }[];
  /** A conversation that opens as soon as the protagonist is created. */
  opening?: { dialogue: string; partner?: string };
  /** `start` picks another starting map (?mapa=<id> in the URL, for testing). */
  newGame(engine: Engine, seed: number, options?: { start?: string }): GameState;
}
