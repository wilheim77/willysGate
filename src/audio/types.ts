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
 * What to do when an engine event of a given type fires. `sfx` plays a fixed sound;
 * `field` + `map` pick the sfx id by looking up one field of the event (e.g. field
 * "damageType" with map { fire: "hitFire", slashing: "hitSlash" }), falling back to
 * `fallback` when the value isn't in the map. `music` switches the music state
 * (crossfades to `music[music]`). Any of these can combine, e.g. a sound plus a
 * music switch on the same event.
 */
export interface EventRule {
  sfx?: string;
  field?: string;
  map?: Record<string, string>;
  fallback?: string;
  music?: string;
}

export interface AudioManifest {
  /** Music tracks by state id (exploration, combat, tension, victory, defeat, title...). */
  music: Record<string, MusicDef>;
  /** One-shot sound effects by id. */
  sfx: Record<string, SfxDef>;
  /** Engine event type -> what to do (play an sfx, switch music, or both). */
  events: Record<string, EventRule>;
}

export interface AudioVolumeState {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}
