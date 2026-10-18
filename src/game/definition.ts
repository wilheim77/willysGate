import type { BaseCommand, CreationChoices, CreationSpec, DialogueTree, DialogueWhen, Entity, GameEvent, Engine, GameState, MapBuilder, ProgressionContent, Ruleset } from '../../engine';
import type { AssetManifest } from '../assets/manifest';
import type { AudioManifest } from '../audio/types';
import type { BarksData } from '../ui/barks';
import type { TutorialStep } from '../ui/tutorialToasts';

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

/** A small always-visible counter in the HUD (Willy's audience, a boss's meter...). */
export interface MeterView {
  id: string;
  icon: string;
  /** The number or short text, already formatted («12,4 mil»). */
  value: string;
  /** A second, smaller line («Audiencia local»). */
  label?: string;
  /** 0..1 to draw a bar under the value. */
  fill?: number;
  color?: string;
  /** Tooltip / accessible description. */
  title?: string;
  /** Tapping it opens the game's panel. */
  opensPanel?: boolean;
}

/** Text that floats over an entity on the map when an event plays («+1,2 mil»). */
export interface FloatView {
  entityId?: string;
  text: string;
  color?: string;
}

/** A message bubble that does not pause the game (a sponsor writing in). */
export interface ToastView {
  title: string;
  text: string;
  color?: string;
  /** Short badge drawn instead of a portrait (initials or an emoji). */
  badge?: string;
}

/** One block of the game's panel: a title, an optional bar, lines and buttons that send commands. */
export interface PanelSection {
  title: string;
  subtitle?: string;
  color?: string;
  badge?: string;
  bar?: { fill: number; label: string; color?: string };
  lines?: string[];
  actions?: { label: string; command: BaseCommand; primary?: boolean }[];
}

/**
 * Game-specific HUD pieces built from plain views over the state, so the client stays
 * generic: counters, floating texts, message bubbles and one panel with actions.
 */
export interface HudExtension {
  meters?(state: GameState): MeterView[];
  float?(event: GameEvent, state: GameState): FloatView | null;
  toast?(event: GameEvent, state: GameState): ToastView | null;
  panel?: {
    icon: string;
    title: string;
    sections(state: GameState, issuer: string): PanelSection[];
    /** A number on the panel's button (offers waiting...). */
    badge?(state: GameState): number;
  };
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
  /**
   * Levelling by shared party points (the ruleset's `progression`): the points needed for each
   * level, passed to the engine, and what the party says when it gets there.
   */
  levels?: { progression: ProgressionContent; texts?: Record<string, Record<string, string>> };
  /** The journal: the first objective whose condition holds is shown as the current goal. */
  objectives?: { when?: DialogueWhen; text: string }[];
  /** A narrator's line for an engine event, if any (Willy's Narrador). Cosmetic. */
  narrate?(event: GameEvent, state: GameState): string | null;
  /**
   * A short on-screen announcement for an event (an ability levelling up...), if any.
   * `big` shows it large in the middle of the screen. Cosmetic.
   */
  announce?(event: GameEvent, state: GameState): { text: string; big?: boolean } | null;
  /** A conversation that opens as soon as the protagonist is created. */
  opening?: { dialogue: string; partner?: string };
  /**
   * Narration pages shown after character creation and before `opening`: who you are and why
   * you're here. `{nombre}` is the protagonist's name; `byClass[<class tag>]` adds a page after the first.
   */
  intro?: { title?: string; pages: string[]; byClass?: Record<string, string>; next?: string; start?: string };
  /** Integrated tutorial steps, shown once each as dismissable toasts (content/<game>/tutorial.json). */
  tutorial?: TutorialStep[];
  /** Companion speech bubbles on map arrival, flags, and combat events (content/<game>/barks.json). */
  barks?: BarksData;
  /** Extra HUD pieces (counters, floating texts, message bubbles, a panel). */
  hud?: HudExtension;
  /**
   * What a dead creature leaves behind: 'corpse' (default) lies it flat on the floor —
   * manifest art if the pack has one for its spriteId, a generic darkened fallback
   * otherwise. 'vanish' instead plays a TV-gameshow "¡ELIMINADO!" flash and removes the
   * sprite — Willy's showier tone; Intereses keeps 'corpse'.
   */
  onDeath?: 'corpse' | 'vanish';
  /** `start` picks another starting map (?mapa=<id> in the URL, for testing). */
  newGame(engine: Engine, seed: number, options?: { start?: string }): GameState;
}
