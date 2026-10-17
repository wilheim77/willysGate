/**
 * Shapes for the per-game audio manifest (`content/<game>/assets/audio.json`).
 * This module knows nothing about any ruleset: event names, field names and the
 * values they take (damage types, surface elements...) are all data supplied by
 * the game's manifest, never hard-coded here.
 */

/** One sound: a single file, or several file-variants picked at random each time it plays. */
export type SoundSrc = string | string[];

export interface SfxDef {
  src: SoundSrc;
  /** 0..1, multiplies the sfx-category volume. Defaults to 1. */
  volume?: number;
}

export interface MusicDef {
  src: SoundSrc;
  volume?: number;
  loop?: boolean;
}

/**
 * What to do when an engine event of a given type fires. `sfx` plays a fixed sound (or
 * several, layered, when given as an array — e.g. a dice rattle plus the outcome's own
 * sound); `field` + `map` pick the sfx id by looking up one field of the event (e.g.
 * field "damageType" with map { fire: "hitFire", slashing: "hitSlash" }, or a dotted
 * path like "result.success" for a nested field), falling back to `fallback` when the
 * value isn't in the map. `arrayField` + `itemField` (defaulting to `field`) do the same
 * lookup against every item of an array field instead (e.g. `surfaceChanged.changes[].to`),
 * playing one sfx per distinct match — for events that report several changes at once.
 * `music` switches the music state (crossfades to `music[music]`, or the current map's
 * override — see `maps` below). Any of these can combine, e.g. a sound plus a music
 * switch on the same event. `events[type]` can be one rule or an array of rules (all of
 * which run), for when one event needs more than one independent lookup.
 */
export interface EventRule {
  sfx?: string | string[];
  field?: string;
  map?: Record<string, string | string[]>;
  fallback?: string | string[];
  arrayField?: string;
  itemField?: string;
  music?: string;
}

/**
 * Per-map audio, keyed by `state.map.id` (the id each map is registered under in
 * content/<game>/world.ts or maps.ts, e.g. "camino", "boveda", "camerino").
 */
export interface MapAudioDef {
  /** Looping bed (wind, drips, village murmur...) layered under the music; its own
   * crossfade bus, independent of combat/exploration state. Cleared (fades out) on a
   * map with no `ambience` entry. */
  ambience?: MusicDef;
  /** Overrides `music[state]` while on this map, by music state id (e.g. a boss theme
   * for "combat" in the vault). States not listed here fall back to the global `music`. */
  music?: Record<string, MusicDef>;
}

export interface AudioManifest {
  /** Music tracks by state id (exploration, combat, tension, victory, defeat, title...). */
  music: Record<string, MusicDef>;
  /** One-shot sound effects by id. */
  sfx: Record<string, SfxDef>;
  /** Engine event type -> what to do (play an sfx, switch music, or both); one rule or several. */
  events: Record<string, EventRule | EventRule[]>;
  /** Per-map ambience and music overrides (see `MapAudioDef`). */
  maps?: Record<string, MapAudioDef>;
  /**
   * Picks a one-shot music stinger by a field of the `combatEnded` event (normally
   * `winner`, a factionId or null) — e.g. { field: "winner", map: { party: "victory" },
   * fallback: "defeat" }. Plays once (the picked `music[...]` entry should have
   * `loop: false`), then falls back to the exploration/combat sync automatically.
   */
  outcomeMusic?: { field: string; map: Record<string, string>; fallback?: string };
  /**
   * Picks a looping music track on `combatStarted` by checking an array field of the
   * event (normally `order`, the entity ids fighting) against `map`'s keys — the first
   * key found in the array wins (e.g. a boss entity id turning on its own theme). Falls
   * back to the normal `music.combat` sync when none of the keys are present.
   */
  combatMusicByEntity?: { arrayField: string; map: Record<string, string> };
}

export interface AudioVolumeState {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}
