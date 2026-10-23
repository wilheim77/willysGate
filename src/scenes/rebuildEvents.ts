/**
 * Events whose playback is just "rebuild the whole world from the current state"
 * (MapScene.play): the rebuild reads the store, not the event, so a run of them in a row only
 * needs the last one. A collapsing room emits one `tileChanged` per tile (130+ at once); rebuilding
 * the world for each froze the page for minutes.
 */
const REBUILD_EVENTS = new Set(['controllerChanged', 'entitySpawned', 'entityDespawned', 'entityChanged', 'tileChanged']);

/** True when `event` and the one right after it both just rebuild the world: skip `event`. */
export function isRedundantRebuild(event: { type: string }, next: { type: string } | undefined): boolean {
  return REBUILD_EVENTS.has(event.type) && next !== undefined && REBUILD_EVENTS.has(next.type);
}
