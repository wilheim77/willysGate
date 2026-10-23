import type { BaseCommand, CommandResult, Engine, GameEvent, GameState } from '../../engine';

export type StoreChange = { kind: 'events'; events: GameEvent[] } | { kind: 'reset' };
type Listener = (change: StoreChange, state: GameState) => void;

/** Holds the current GameState. The only way to change it is dispatch() or load(). */
export class GameStore {
  private listeners = new Set<Listener>();

  constructor(
    readonly engine: Engine,
    private current: GameState,
  ) {}

  get state(): GameState {
    return this.current;
  }

  dispatch(command: BaseCommand): CommandResult {
    const result = this.engine.apply(this.current, command);
    if (result.ok) {
      this.current = result.state;
      this.emit({ kind: 'events', events: result.events });
    }
    return result;
  }

  /**
   * Tells listeners about something that happened in the client rather than in the engine (the
   * bag was opened, the game was saved, nobody has touched anything for a minute). The state
   * doesn't change; it's how such moments reach the narrator, audio and tutorial like any event.
   */
  announce(...events: GameEvent[]): void {
    this.emit({ kind: 'events', events });
  }

  /** Replaces the whole state (new game, load, import). */
  load(state: GameState): void {
    this.current = state;
    this.emit({ kind: 'reset' });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: StoreChange): void {
    for (const l of this.listeners) l(change, this.current);
  }
}
