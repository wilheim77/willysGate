import { type BaseCommand, type CommandResult, ENGINE_COMMANDS, applyCommand } from './commands';
import { performCheck } from './checks';
import { type Effect, applyEffects } from './effects';
import type { CheckRequest, Ruleset } from './ruleset';
import { deserializeState, serializeState } from './save';
import { type GameState, type NewGameOptions, createGameState } from './state';

/** The engine bound to one ruleset and one game. This is what the client (or a future server) talks to. */
export interface Engine {
  readonly ruleset: Ruleset;
  readonly gameId: string;
  newGame(options: Omit<NewGameOptions, 'gameId' | 'ruleset'>): GameState;
  apply(state: GameState, command: BaseCommand): CommandResult;
  check(state: GameState, request: CheckRequest): ReturnType<typeof performCheck>;
  applyEffects(state: GameState, effects: Effect[]): ReturnType<typeof applyEffects>;
  serialize(state: GameState): string;
  deserialize(json: string): GameState;
}

export function createEngine(ruleset: Ruleset, gameId: string): Engine {
  for (const name of Object.keys(ruleset.commands)) {
    if (name in ENGINE_COMMANDS) throw new Error(`Ruleset ${ruleset.id} redefines engine command "${name}"`);
  }
  return {
    ruleset,
    gameId,
    newGame: (options) => createGameState({ ...options, gameId, ruleset }),
    apply: (state, command) => applyCommand(ruleset, state, command),
    check: (state, request) => performCheck(ruleset, state, request),
    applyEffects: (state, effects) => applyEffects(ruleset, state, effects),
    serialize: serializeState,
    deserialize: (json) => deserializeState(json, ruleset, gameId),
  };
}
