import type { GameStore, StoreChange } from '../game/store';
import type { GameDefinition } from '../game/definition';
import { AudioManager } from './AudioManager';
import type { AudioManifest } from './types';

const EMPTY_MANIFEST: AudioManifest = { music: {}, sfx: {}, events: {} };

/**
 * Wires a game's audio manifest (`game.audio`, from `content/<game>/assets/audio.json`)
 * to its GameStore: one subscriber that turns engine events into music/sfx, nothing
 * else touched. `engine/` and `rulesets/` stay unaware this exists.
 *
 * Call once from `src/main.ts`, after `store` and `game` exist:
 *   const audio = setupAudio(store, game);
 * Returns the `AudioManager` so the HUD can later add volume/mute controls.
 */
export function setupAudio(store: GameStore, game: GameDefinition): AudioManager {
  const manifest = game.audio ?? EMPTY_MANIFEST;
  const manager = new AudioManager(manifest);
  manager.init();

  const syncMusicToTurnMode = () => {
    const mode = store.state.turn.mode; // 'exploration' | 'combat'
    const key = mode === 'combat' ? 'combat' : 'exploration';
    if (manifest.music[key]) manager.setMusic(key);
  };

  store.subscribe((change: StoreChange) => {
    if (change.kind === 'reset') {
      manager.setMap(store.state.map.id);
      syncMusicToTurnMode();
      return;
    }
    for (const event of change.events) {
      manager.handleEvent(event.type, event as unknown as Record<string, unknown>);
      // mapChanged (engine/world.ts) carries the new map id as `to`; switches the
      // ambience bed and re-resolves the current music state's per-map override.
      if (event.type === 'mapChanged') manager.setMap((event as unknown as { to: string }).to);
    }
    // A combat/exploration switch may also need to happen even if the game's manifest
    // doesn't wire a `music` field onto combatStarted/combatEnded directly.
    if (change.events.some((e) => e.type === 'combatStarted' || e.type === 'combatEnded')) syncMusicToTurnMode();
  });

  manager.setMap(store.state.map.id);
  syncMusicToTurnMode();
  return manager;
}
