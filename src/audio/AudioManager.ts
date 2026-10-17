import type { AudioManifest, AudioVolumeState, MusicDef } from './types';

const STORAGE_KEY = 'willysgate.audio';
const DEFAULT_VOLUMES: AudioVolumeState = { master: 0.8, music: 0.7, sfx: 1, muted: false };
const MUSIC_CROSSFADE_MS = 700;
const AMBIENCE_CROSSFADE_MS = 1200;
/** How many concurrent <audio> elements an sfx id can use, so rapid-fire hits don't cut each other off. */
const SFX_POOL_SIZE = 4;

function loadVolumes(): AudioVolumeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOLUMES };
    const parsed = JSON.parse(raw) as Partial<AudioVolumeState>;
    return { ...DEFAULT_VOLUMES, ...parsed };
  } catch {
    return { ...DEFAULT_VOLUMES };
  }
}

function saveVolumes(v: AudioVolumeState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // Private mode or storage disabled: settings just won't persist across reloads.
  }
}

function pick(src: string | string[]): string {
  return Array.isArray(src) ? src[Math.floor(Math.random() * src.length)]! : src;
}

/** Resolves a manifest-relative path (e.g. "assets/audio/sfx/hit.ogg") against the app's base URL. */
function resolveUrl(src: string): string {
  if (/^https?:\/\//.test(src)) return src;
  const base = import.meta.env.BASE_URL ?? '/';
  return base.replace(/\/$/, '') + '/' + src.replace(/^\//, '');
}

/** One crossfading loop bus: two <audio> elements, swapped on every switch. */
class CrossfadeBus {
  private a: HTMLAudioElement = new Audio();
  private b: HTMLAudioElement = new Audio();
  private activeIsA = true;
  /** Opaque token identifying what's currently requested, so repeat calls are no-ops. */
  private token: string | null = null;

  constructor(private fadeMs: number) {
    for (const el of [this.a, this.b]) {
      el.loop = true;
      el.volume = 0;
    }
  }

  get activeElement(): HTMLAudioElement {
    return this.activeIsA ? this.a : this.b;
  }

  get currentToken(): string | null {
    return this.token;
  }

  /** Re-applies the volume of whatever is currently playing (e.g. after a volume change). */
  setActiveVolume(v: number): void {
    this.activeElement.volume = v;
  }

  /** Crossfades to `def` (or to silence if null). No-op if `token` is already current. */
  switch(token: string | null, def: MusicDef | undefined, volume: number): void {
    if (token === this.token) return;
    this.token = token;
    const outgoing = this.activeElement;
    const incoming = this.activeIsA ? this.b : this.a;
    this.activeIsA = !this.activeIsA;

    this.fadeTo(outgoing, 0).then(() => outgoing.pause());

    if (!def) return;
    incoming.src = resolveUrl(pick(def.src));
    incoming.loop = def.loop ?? true;
    incoming.currentTime = 0;
    incoming.volume = 0;
    incoming.play().catch(() => {
      // Blocked play(): the track just won't start; nothing else depends on it.
    });
    this.fadeTo(incoming, volume);
  }

  private fadeTo(el: HTMLAudioElement, target: number): Promise<void> {
    const start = el.volume;
    const startTime = performance.now();
    const ms = this.fadeMs;
    return new Promise((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - startTime) / ms);
        el.volume = start + (target - start) * t;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      step();
    });
  }
}

/**
 * Generic audio playback for the client: music state with crossfade (with optional
 * per-map overrides), a separate ambience bed bus per map, pooled one-shot sfx, and
 * master/music/sfx volume + mute persisted in localStorage. Knows nothing about any
 * specific game or ruleset; see `types.ts` and `content/<game>/assets/audio.json` for
 * how a game drives it.
 *
 * Autoplay rules: nothing plays before the first user gesture. Call `init()` once; it
 * arms a one-time listener and plays whatever was requested as soon as it fires.
 */
export class AudioManager {
  private volumes: AudioVolumeState = loadVolumes();
  private unlocked = false;

  private musicState: string | null = null;
  private mapId: string | null = null;
  private music = new CrossfadeBus(MUSIC_CROSSFADE_MS);
  private ambience = new CrossfadeBus(AMBIENCE_CROSSFADE_MS);

  private sfxPools = new Map<string, HTMLAudioElement[]>();

  constructor(private manifest: AudioManifest) {}

  /** Arms the first-gesture unlock. Safe to call multiple times. */
  init(): void {
    if (this.unlocked) return;
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      // Re-run the last requests now that play() is allowed to succeed.
      this.applyMusic();
      this.applyAmbience();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  getVolumes(): AudioVolumeState {
    return { ...this.volumes };
  }

  setMasterVolume(v: number): void {
    this.volumes.master = Math.max(0, Math.min(1, v));
    this.refreshBusVolumes();
    saveVolumes(this.volumes);
  }

  setMusicVolume(v: number): void {
    this.volumes.music = Math.max(0, Math.min(1, v));
    this.refreshBusVolumes();
    saveVolumes(this.volumes);
  }

  setSfxVolume(v: number): void {
    this.volumes.sfx = Math.max(0, Math.min(1, v));
    saveVolumes(this.volumes);
  }

  setMuted(muted: boolean): void {
    this.volumes.muted = muted;
    this.refreshBusVolumes();
    saveVolumes(this.volumes);
  }

  private effectiveMusicVolume(trackVolume = 1): number {
    return this.volumes.muted ? 0 : this.volumes.master * this.volumes.music * trackVolume;
  }

  private effectiveSfxVolume(trackVolume = 1): number {
    return this.volumes.muted ? 0 : this.volumes.master * this.volumes.sfx * trackVolume;
  }

  private refreshBusVolumes(): void {
    this.music.setActiveVolume(this.effectiveMusicVolume(this.currentMusicDef()?.volume ?? 1));
    this.ambience.setActiveVolume(this.effectiveMusicVolume(this.currentAmbienceDef()?.volume ?? 1));
  }

  /** Plays a one-shot sound effect by its manifest id. No-op if unknown or before unlock. */
  playSfx(id: string): void {
    const def = this.manifest.sfx[id];
    if (!def) return;
    if (!this.unlocked) return; // Dropped silently: SFX before the first gesture would throw anyway.
    let pool = this.sfxPools.get(id);
    if (!pool) {
      pool = [];
      this.sfxPools.set(id, pool);
    }
    let el = pool.find((a) => a.paused || a.ended);
    if (!el) {
      if (pool.length >= SFX_POOL_SIZE) el = pool[0]!;
      else {
        el = new Audio();
        pool.push(el);
      }
    }
    el.src = resolveUrl(pick(def.src));
    el.volume = this.effectiveSfxVolume(def.volume ?? 1);
    el.currentTime = 0;
    el.play().catch(() => {
      // Ignored: a stolen/blocked play() is not worth surfacing.
    });
  }

  /** Current map (for ambience and the per-map music override), by `state.map.id`. */
  setMap(mapId: string | null): void {
    if (mapId === this.mapId) return;
    this.mapId = mapId;
    this.applyAmbience();
    this.applyMusic(); // the map may override the currently playing state's track
  }

  /** Switches the music state (exploration/combat/victory/...), honouring the current
   * map's override if the manifest has one. Queues until unlocked if called early. */
  setMusic(state: string | null): void {
    if (state === this.musicState) return;
    this.musicState = state;
    this.applyMusic();
  }

  stopMusic(): void {
    this.setMusic(null);
  }

  private currentMusicDef(): MusicDef | undefined {
    return this.resolveMusicDef(this.musicState);
  }

  private resolveMusicDef(state: string | null): MusicDef | undefined {
    if (!state) return undefined;
    const override = this.mapId ? this.manifest.maps?.[this.mapId]?.music?.[state] : undefined;
    return override ?? this.manifest.music[state];
  }

  private applyMusic(): void {
    if (!this.unlocked) return;
    const def = this.currentMusicDef();
    this.music.switch(`${this.musicState ?? ''}@${this.mapId ?? ''}`, def, this.effectiveMusicVolume(def?.volume ?? 1));
  }

  private currentAmbienceDef(): MusicDef | undefined {
    return this.mapId ? this.manifest.maps?.[this.mapId]?.ambience : undefined;
  }

  private applyAmbience(): void {
    if (!this.unlocked) return;
    const def = this.currentAmbienceDef();
    this.ambience.switch(this.mapId, def, this.effectiveMusicVolume(def?.volume ?? 1));
  }

  /**
   * Looks up `events[eventType]` in the manifest and acts on it: plays one or more sfx
   * (directly, or picked by a field of the event), and/or switches music state. `event`
   * is the raw engine event object; field lookups are plain property reads, so this
   * stays game-agnostic.
   */
  handleEvent(eventType: string, event: Record<string, unknown>): void {
    const rule = this.manifest.events[eventType];
    if (!rule) return;
    let sfxId: string | string[] | undefined = rule.sfx;
    if (!sfxId && rule.field && rule.map) {
      const value = String(event[rule.field] ?? '');
      sfxId = rule.map[value] ?? rule.fallback;
    }
    if (sfxId) for (const id of Array.isArray(sfxId) ? sfxId : [sfxId]) this.playSfx(id);
    if (rule.music) this.setMusic(rule.music);
  }
}
