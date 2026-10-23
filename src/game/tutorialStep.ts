import type { DialogueWhen, GameEvent, GameState } from '../../engine';

// Kept apart from src/ui/tutorialToasts.ts (which touches the DOM) so game content can import the
// type without dragging the DOM into the Node-side typecheck of the tests.

/** One step of `content/<game>/tutorial.json`. Fires once per game (persisted per save seed). */
export interface TutorialStep {
  id: string;
  /**
   * `event` (+ optional `match` on its fields) fires on that engine event; `when` fires the
   * first time the condition holds while idle; `onMap` fires the first time the party is on
   * that map id.
   */
  trigger: { event: string; match?: Record<string, unknown> } | { when: DialogueWhen } | { onMap: string };
  /** One paragraph, or several shown one under the other. */
  text: string | string[];
  /** Only after all these steps have been shown (a chain of tips, one per occasion). */
  after?: string[];
  /** An extra test on an event trigger, for what `match` can't say («below half health»); sees the state after the event. */
  check?: (event: GameEvent, state: GameState) => boolean;
  /** Closes by itself after this many seconds. */
  autoCloseSeconds?: number;
}

