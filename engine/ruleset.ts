import type { CommandHandler } from './commands';
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

  /** Migrations of ruleset-owned data, from version N to N+1. */
  migrations?: Record<number, (state: Record<string, unknown>) => Record<string, unknown>>;
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
  modifiers: { label: string; value: number }[];
  total: number;
  target: number;
  /** e.g. 'CD'. */
  targetLabel: string;
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
    commands: { ...base.commands, ...ext.commands },
  };
}
