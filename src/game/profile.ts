import type { Engine } from '../../engine';

/**
 * The browser's profile for a game (GameDefinition.profile): one JSON object in localStorage,
 * kept across seasons. The game decides what goes in it; this only stores it, guarding every
 * access (private mode, blocked storage: the game still plays, it just forgets). Other parts of
 * the client may keep their own fields in the same object (the permadeath slot's write counter),
 * so writes merge instead of replacing.
 */
export class ProfileStore {
  readonly key: string;

  constructor(engine: Engine) {
    this.key = `willysgate.${engine.gameId}.perfil`;
  }

  read(): Record<string, unknown> {
    try {
      const raw = localStorage.getItem(this.key);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  write(profile: Record<string, unknown>): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({ ...this.read(), ...profile }));
    } catch {
      // Storage unavailable: nothing carries over, nothing breaks.
    }
  }
}
