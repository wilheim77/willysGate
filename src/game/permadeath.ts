import type { Engine, GameState } from '../../engine';

/**
 * The one save slot of a permadeath run (GameDefinition.savePolicy → 'permadeath'): written after
 * every command, never loaded or exported by hand, deleted when the run is lost. Each write bumps
 * a counter kept both in the slot and in the browser's profile; a slot behind the profile is an
 * older copy someone put back, which the game may treat as such (no punishment, just no
 * permadeath any more). It is a good-faith check between friends, not anti-cheat.
 */
export class PermadeathSlot {
  private slotKey: string;
  private profileKey: string;

  constructor(private engine: Engine) {
    this.slotKey = `willysgate.${engine.gameId}.hardcore`;
    this.profileKey = `willysgate.${engine.gameId}.perfil`;
  }

  private writes(): number {
    try {
      return Number((JSON.parse(localStorage.getItem(this.profileKey) ?? '{}') as { escrituras?: number }).escrituras ?? 0);
    } catch {
      return 0;
    }
  }

  save(state: GameState): void {
    try {
      const n = this.writes() + 1;
      localStorage.setItem(this.slotKey, JSON.stringify({ escrituras: n, partida: this.engine.serialize(state) }));
      const profile = JSON.parse(localStorage.getItem(this.profileKey) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(this.profileKey, JSON.stringify({ ...profile, escrituras: n }));
    } catch {
      // Storage unavailable: the run still plays, it just can't be resumed.
    }
  }

  /** The saved run, and whether it is an older copy than the profile has seen. */
  load(): { state: GameState; restored: boolean } | null {
    try {
      const raw = localStorage.getItem(this.slotKey);
      if (!raw) return null;
      const slot = JSON.parse(raw) as { escrituras: number; partida: string };
      return { state: this.engine.deserialize(slot.partida), restored: slot.escrituras < this.writes() };
    } catch {
      return null;
    }
  }

  /** The run is over: the slot goes, the profile's counter stays (so a restored copy is spotted). */
  clear(): void {
    try {
      localStorage.removeItem(this.slotKey);
      const profile = JSON.parse(localStorage.getItem(this.profileKey) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(this.profileKey, JSON.stringify({ ...profile, escrituras: this.writes() + 1 }));
    } catch {
      // Nothing to clear.
    }
  }
}
