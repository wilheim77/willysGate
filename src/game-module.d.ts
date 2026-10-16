// `@game` is aliased by vite.config.ts to content/<GAME>/game.ts.
declare module '@game' {
  import type { GameDefinition } from './game/definition';
  export const game: GameDefinition;
}
