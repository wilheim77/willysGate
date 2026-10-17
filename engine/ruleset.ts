import type { CommandHandler, GameEvent } from './commands';
import type { Effect } from './effects';
import type { Vec2 } from './grid';
import type { MovementRules } from './pathfinding';
import type { RngCursor } from './rng';
import type { Entity, GameState, JsonValue } from './state';

/**
 * The contract a rule system (5e, the vampire-hunter game...) implements to plug
 * into the engine. The engine owns space, time, state and commands; the ruleset
 * owns every number that means something.
 *
 * Labels are player-facing text (Spanish).
 */
export interface Ruleset {
  id: string;
  /** Bump when entity stats/resources change shape; add a migration below. */
  version: number;

  stats: Record<string, StatDef>;
  resources: Record<string, ResourceDef>;
  conditions: Record<string, ConditionDef>;

  /** How elevation affects walking. */
  movement: MovementRules;
  /** Movement available this turn in combat (in movement cost units). */
  movementBudget(entity: Entity, state: GameState): number;

  /** Resolves a skill check, saving throw, etc. Consumes dice from `rng`; must not mutate `state`. */
  resolveCheck(state: GameState, request: CheckRequest, rng: RngCursor): CheckResult;
  /** Difficulty an entity imposes on others, e.g. 5e spell save DC (source 'spell'). */
  difficulty(state: GameState, entityId: string, source: string): number;

  /** Ruleset-specific conditions usable in dialogue and triggers, e.g. { type: 'class', is: 'wizard' }. */
  dialogueConditions: Record<string, DialogueCondition>;

  /** Ruleset commands (attack, castSpell, drinkBlood...). Names must not clash with engine commands. */
  commands: Record<string, CommandHandler>;

  // --- Combat (engine owns turns and turn order; the ruleset owns the numbers) ---

  /** Initiative score; higher acts first. Fractions may be used as tie-breakers. */
  rollInitiative(state: GameState, entityId: string, rng: RngCursor): number;
  /** Can take actions on its turn (not dead, unconscious, stunned...). */
  canAct(entity: Entity): boolean;
  /** Still counts for its side: a combat ends when one side has nobody standing. */
  isStanding(entity: Entity): boolean;
  /** Ruleset bookkeeping at the start of an entity's turn (bleeding out, ongoing damage...). */
  onTurnStart?(state: GameState, entityId: string, rng: RngCursor): ActionOutcome;

  /** Actions an entity could take now (attacks, spells, class features). */
  listActions(state: GameState, actorId: string): ActionDef[];
  /**
   * Predicts an action without rolling dice: validity, chance of success, expected
   * damage. The UI shows it ("72 % de acierto") and the AI ranks options with it.
   */
  previewAction(state: GameState, actorId: string, actionId: string, target: ActionTarget): ActionPreview;
  /** Resolves an action. The engine has already checked turn, cost, range and target filter. */
  performAction(state: GameState, actorId: string, actionId: string, target: ActionTarget, rng: RngCursor): ActionOutcome;
  /**
   * Interrupt: `moverId` is leaving `reactorId`'s reach during a move. Return an outcome
   * (e.g. an opportunity attack) or null to let it pass. The engine handles the timing.
   */
  onLeaveReach?(state: GameState, reactorId: string, moverId: string, rng: RngCursor): ActionOutcome | null;

  /** Ruleset bookkeeping when a combat ends (e.g. downed allies get back up). */
  onCombatEnd?(state: GameState, winner: string | null): ActionOutcome;

  /** Plain-language explanations for terms shown in the UI (CA, CD, ventaja...). Keys are `term` ids. */
  glossary: Record<string, GlossaryEntry>;

  /** Migrations of ruleset-owned data, from version N to N+1. */
  migrations?: Record<number, (state: Record<string, unknown>) => Record<string, unknown>>;
}

export interface GlossaryEntry {
  label: string;
  /** One or two sentences for someone who has never played a tabletop RPG. */
  text: string;
}

export interface ActionDef {
  id: string;
  label: string;
  description?: string;
  /** Resources spent, e.g. { action: 1 } or { bonus_action: 1, spell_slot_1: 1 }. */
  cost: Record<string, number>;
  target: {
    kind: 'self' | 'creature' | 'tile';
    /** In tiles, Chebyshev distance. */
    range: number;
    /** For creature targets. */
    filter?: 'hostile' | 'ally' | 'any';
  };
  /** Free-form hints for UI and AI: 'attack', 'melee', 'ranged', 'spell', 'heal', 'buff'... */
  tags: string[];
}

export interface ActionTarget {
  entityId?: string;
  tile?: Vec2;
}

export interface ActionPreview {
  valid: boolean;
  /** Why it can't be done (Spanish, shown to the player). */
  reason?: string;
  /** Probability 0..1 that it succeeds (hits, target fails its save...). */
  chance?: number;
  expectedDamage?: number;
  expectedHealing?: number;
  /** Lines for the tooltip, each optionally linked to a glossary term. */
  breakdown?: { label: string; value?: string; term?: string }[];
  /** Tiles an area effect would cover, for the UI to paint before confirming. */
  affectedTiles?: Vec2[];
}

export interface ActionOutcome {
  effects: Effect[];
  /** Ruleset events for the renderer (attack rolled, hit, crit, spell cast...). */
  events: GameEvent[];
}

export interface StatDef {
  label: string;
}

export interface ResourceDef {
  label: string;
  /** When the resource refills. Applied by the turn and rest systems. */
  refresh: 'turn' | 'shortRest' | 'longRest' | 'never';
  /** Show it as a bar in the UI. */
  visible?: boolean;
  /** Generic meaning the engine, AI and UI can rely on: 'health' is the pool that keeps a creature up. */
  role?: 'health';
}

export interface ConditionDef {
  label: string;
  description?: string;
}

export interface CheckRequest {
  actorId: string;
  /** Ruleset-defined check id, e.g. 'persuasion', 'save:dex'. */
  check: string;
  /** Number to meet or beat. */
  target: number;
  /** Situational tags the ruleset may translate into bonuses, e.g. 'high_ground', 'garran_present'. */
  situational?: string[];
}

/** One group of dice in a check, for on-screen display. */
export interface DiceRoll {
  sides: number;
  rolls: number[];
  /** Values that count toward the total (e.g. the higher die with advantage). */
  kept: number[];
  /** e.g. 'ventaja'. */
  note?: string;
}

/**
 * Generic breakdown the UI can render without knowing the rule system:
 * "[Persuasión] d20 (12) + 3 Carisma = 15 vs CD 14 — ÉXITO".
 */
export interface CheckResult {
  check: string;
  label: string;
  dice: DiceRoll[];
  /** Each modifier may link to a glossary term so the UI can explain it. */
  modifiers: { label: string; value: number; term?: string }[];
  total: number;
  target: number;
  /** e.g. 'CD'. */
  targetLabel: string;
  targetTerm?: string;
  success: boolean;
  /** Optional finer outcome, e.g. 'critical_success'. */
  outcome?: string;
}

export type DialogueCondition = (state: GameState, actorId: string, params: Record<string, JsonValue>) => boolean;

/**
 * Derives a ruleset with extra or overridden definitions, e.g. a game adding its own
 * conditions ('embelesado') or commands on top of dnd5e without forking it.
 */
export function extendRuleset(base: Ruleset, ext: Partial<Omit<Ruleset, 'id' | 'version'>> & { id: string; version?: number }): Ruleset {
  return {
    ...base,
    ...ext,
    version: ext.version ?? base.version,
    stats: { ...base.stats, ...ext.stats },
    resources: { ...base.resources, ...ext.resources },
    conditions: { ...base.conditions, ...ext.conditions },
    dialogueConditions: { ...base.dialogueConditions, ...ext.dialogueConditions },
    glossary: { ...base.glossary, ...ext.glossary },
    commands: { ...base.commands, ...ext.commands },
  };
}
