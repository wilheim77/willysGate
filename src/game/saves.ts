import type { Engine, GameState } from '../../engine';

/** localStorage can be unavailable (private mode, blocked storage): every call is guarded. */
export class SaveSlots {
  private key: string;

  constructor(private engine: Engine) {
    this.key = `willysgate.${engine.gameId}.slot1`;
  }

  save(state: GameState): boolean {
    try {
      localStorage.setItem(this.key, this.engine.serialize(state));
      return true;
    } catch {
      return false;
    }
  }

  /** Throws SaveError if the stored data is invalid; returns null if there is no save. */
  load(): GameState | null {
    let json: string | null = null;
    try {
      json = localStorage.getItem(this.key);
    } catch {
      return null;
    }
    return json === null ? null : this.engine.deserialize(json);
  }

  exportToFile(state: GameState): void {
    const blob = new Blob([this.engine.serialize(state)], { type: 'application/json' });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.engine.gameId}-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async importFromFile(file: File): Promise<GameState> {
    return this.engine.deserialize(await file.text());
  }
}
