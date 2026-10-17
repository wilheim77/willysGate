import { type StartCombatCommand, startCombat } from './combat';
import { type BaseCommand, type CommandHandler, type CommandResult, type GameEvent, SYSTEM_ISSUER, fail, requireControlled } from './command-types';
import { type Effect, applyEffects } from './effects';
import { gridDistance } from './grid';
import { itemCount } from './inventory';
import { RngCursor } from './rng';
import type { CheckResult, Ruleset } from './ruleset';
import type { FlagValue, GameState, JsonValue } from './state';

/**
 * Branching conversations as data (content/<game>/dialogues/*.json). The engine walks the
 * tree, checks conditions, rolls checks through the ruleset and applies outcomes; it never
 * knows what a "Persuasion DC 14" means. Interactables (chests, levers, doors) are dialogues
 * too: a node of narration with choices.
 */
export interface DialogueTree {
  id: string;
  start: string;
  nodes: Record<string, DialogueNode>;
}

export interface DialogueNode {
  /** Entity id speaking, or omitted for narration. */
  speaker?: string;
  text: string;
  /** Applied when the conversation reaches this node. */
  effects?: DialogueEffect[];
  choices?: DialogueChoice[];
  /** With no choices: continue here (a "Continuar" button), or end when omitted. */
  next?: string;
}

export interface DialogueChoice {
  text: string;
  /** Only offered when true. */
  when?: DialogueWhen;
  /** Shown greyed out with this hint instead of hidden when `when` fails (e.g. "[Elfo]"). */
  lockedHint?: string;
  /** Roll before branching. The actor is whoever speaks for the party unless given. */
  check?: { check: string; dc: number; actor?: string; situational?: string[]; success: string; failure: string };
  effects?: DialogueEffect[];
  /** Next node; omitted ends the conversation. */
  next?: string;
  /** Disappears once picked (questions you can ask only once). */
  once?: boolean;
}

export type DialogueWhen =
  | { flag: string; is?: FlagValue }
  | { notFlag: string }
  | { item: string; owner?: string; atLeast?: number }
  | { rule: string; actor?: string; params?: Record<string, JsonValue> }
  | { all: DialogueWhen[] }
  | { any: DialogueWhen[] }
  | { not: DialogueWhen };

export type DialogueEffect =
  | Effect
  /** Start a fight with everyone of these factions on the map. */
  | { type: 'startCombat'; factions: string[] };

export interface DialogueEvent extends GameEvent {
  type: 'dialogueStarted' | 'dialogueNode' | 'dialogueChoice' | 'dialogueEnded';
  treeId: string;
  nodeId?: string;
  index?: number;
  actorId?: string;
  partnerId?: string;
}

/** A visible roll in conversation ("[Persuasión] CD 14"). */
export interface DialogueCheckEvent extends GameEvent {
  type: 'dialogueCheck';
  actorId: string;
  result: CheckResult;
}

/** Content the engine looks up by id while running commands. */
export interface EngineContent {
  dialogues: Record<string, DialogueTree>;
}

export const EMPTY_CONTENT: EngineContent = { dialogues: {} };

/** The conversation in progress, if any (state.systems.dialogue). */
export interface DialogueState {
  treeId: string;
  nodeId: string;
  /** Who speaks for the party (rolls the checks). */
  actorId: string;
  /** Who or what we are talking to. */
  partnerId?: string;
  /** "once" choices already taken, as "<treeId>/<nodeId>/<index>". */
  taken: string[];
  lastCheck?: CheckResult;
}

export interface StartDialogueCommand extends BaseCommand {
  type: 'startDialogue';
  treeId: string;
  actorId: string;
  partnerId?: string;
}

export interface ChooseOptionCommand extends BaseCommand {
  type: 'chooseOption';
  /** Index into the node's choices (as listed by `dialogueChoices`, including locked ones). */
  index: number;
}

/** Talk to, or use, an adjacent entity tagged `dialogue:<treeId>`. */
export interface InteractCommand extends BaseCommand {
  type: 'interact';
  entityId: string;
  targetId: string;
}

export function dialogueOf(state: GameState): DialogueState | null {
  return (state.systems.dialogue as unknown as DialogueState | undefined) ?? null;
}

function withDialogue(state: GameState, d: DialogueState | null): GameState {
  const systems = { ...state.systems };
  if (d) systems.dialogue = d as unknown as JsonValue;
  else delete systems.dialogue;
  return { ...state, systems };
}

export function evaluateCondition(ruleset: Ruleset, state: GameState, actorId: string, c: DialogueWhen): boolean {
  if ('all' in c) return c.all.every((x) => evaluateCondition(ruleset, state, actorId, x));
  if ('any' in c) return c.any.some((x) => evaluateCondition(ruleset, state, actorId, x));
  if ('not' in c) return !evaluateCondition(ruleset, state, actorId, c.not);
  if ('notFlag' in c) return !state.flags[c.notFlag];
  if ('flag' in c) return c.is === undefined ? !!state.flags[c.flag] : state.flags[c.flag] === c.is;
  if ('item' in c) return itemCount(state, c.owner ?? 'party', c.item) >= (c.atLeast ?? 1);
  const rule = ruleset.dialogueConditions[c.rule];
  if (!rule) throw new Error(`Unknown dialogue condition "${c.rule}"`);
  const who = c.actor ?? actorId;
  return !!state.entities[who] && rule(state, who, c.params ?? {});
}

/** A choice as the UI shows it. */
export interface ChoiceView {
  index: number;
  text: string;
  available: boolean;
  lockedHint?: string;
  check?: { check: string; dc: number; actorId: string };
}

/** The choices to show at the current node: available ones, plus locked ones that have a hint. */
export function dialogueChoices(ruleset: Ruleset, state: GameState, tree: DialogueTree): ChoiceView[] {
  const d = dialogueOf(state);
  if (!d) return [];
  const node = tree.nodes[d.nodeId];
  return (node?.choices ?? []).flatMap((c, index): ChoiceView[] => {
    if (c.once && d.taken.includes(`${tree.id}/${d.nodeId}/${index}`)) return [];
    const available = !c.when || evaluateCondition(ruleset, state, d.actorId, c.when);
    if (!available && !c.lockedHint) return [];
    return [
      {
        index,
        text: c.text,
        available,
        ...(c.lockedHint && !available ? { lockedHint: c.lockedHint } : {}),
        ...(c.check ? { check: { check: c.check.check, dc: c.check.dc, actorId: c.check.actor ?? d.actorId } } : {}),
      },
    ];
  });
}

/** Moves to a node (or ends the conversation), applying the node's effects. */
function enterNode(
  ruleset: Ruleset,
  content: EngineContent,
  state: GameState,
  d: DialogueState,
  nodeId: string | undefined,
  events: GameEvent[],
  rng: RngCursor,
): CommandResult {
  const tree = content.dialogues[d.treeId]!;
  if (!nodeId) {
    events.push({ type: 'dialogueEnded', treeId: d.treeId } as DialogueEvent);
    return { ok: true, state: withDialogue(state, null), events };
  }
  const node = tree.nodes[nodeId];
  if (!node) return fail('invalid_target', `Dialogue ${d.treeId} has no node "${nodeId}"`);
  let next = withDialogue(state, { ...d, nodeId });
  events.push({ type: 'dialogueNode', treeId: d.treeId, nodeId } as DialogueEvent);
  const applied = applyDialogueEffects(ruleset, next, node.effects ?? [], rng);
  if (!applied.ok) return applied;
  next = applied.state;
  events.push(...applied.events);
  // A fight interrupts the conversation.
  if (next.turn.mode === 'combat' && state.turn.mode !== 'combat') {
    events.push({ type: 'dialogueEnded', treeId: d.treeId } as DialogueEvent);
    next = withDialogue(next, null);
  }
  return { ok: true, state: next, events };
}

function applyDialogueEffects(ruleset: Ruleset, state: GameState, effects: DialogueEffect[], rng: RngCursor): CommandResult {
  const plain = effects.filter((e): e is Effect => e.type !== 'startCombat');
  const applied = applyEffects(ruleset, state, plain);
  let next = applied.state;
  const events: GameEvent[] = [...applied.events];
  for (const e of effects) {
    if (e.type !== 'startCombat') continue;
    const factions = (e as { factions: string[] }).factions;
    const leaderSide = Object.values(next.entities).find((x) => x.controllerId.startsWith('player'))?.factionId;
    const participants = Object.values(next.entities)
      .filter((x) => ruleset.isStanding(x) && (factions.includes(x.factionId) || x.factionId === leaderSide))
      .map((x) => x.id);
    const r = startCombat({ ...next, rng: rng.state }, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants } as StartCombatCommand, { ruleset });
    if (!r.ok) return r;
    next = r.state;
    rng.state = next.rng;
    events.push(...r.events);
  }
  return { ok: true, state: next, events };
}

export const startDialogue: CommandHandler<StartDialogueCommand> = (state, cmd, { ruleset, content = EMPTY_CONTENT }) => {
    if (state.turn.mode === 'combat') return fail('cannot_act', 'No conversations in combat');
    if (dialogueOf(state)) return fail('cannot_act', 'Already in a conversation');
    const tree = content.dialogues[cmd.treeId];
    if (!tree) return fail('invalid_target', `No dialogue "${cmd.treeId}"`);
    if (cmd.issuer !== SYSTEM_ISSUER) {
      const actor = requireControlled(state, cmd.issuer, cmd.actorId);
      if (!actor.ok) return actor;
    }
    const d: DialogueState = { treeId: tree.id, nodeId: tree.start, actorId: cmd.actorId, ...(cmd.partnerId ? { partnerId: cmd.partnerId } : {}), taken: carriedOver(state, tree.id) };
    const rng = new RngCursor(state.rng);
    const events: GameEvent[] = [{ type: 'dialogueStarted', treeId: tree.id, actorId: cmd.actorId, partnerId: cmd.partnerId } as DialogueEvent];
    const r = enterNode(ruleset, content, state, d, tree.start, events, rng);
    return r.ok ? { ...r, state: { ...r.state, rng: rng.state } } : r;
};

/** "once" choices stay taken across visits: they are remembered as flags. */
function carriedOver(state: GameState, treeId: string): string[] {
  return Object.keys(state.flags)
    .filter((f) => f.startsWith(`taken:${treeId}/`))
    .map((f) => f.slice('taken:'.length));
}

export const chooseOption: CommandHandler<ChooseOptionCommand> = (state, cmd, { ruleset, content = EMPTY_CONTENT }) => {
    const d = dialogueOf(state);
    if (!d) return fail('cannot_act', 'No conversation in progress');
    if (cmd.issuer !== SYSTEM_ISSUER && state.entities[d.actorId]?.controllerId !== cmd.issuer) return fail('not_your_entity', 'Not your conversation');
    const tree = content.dialogues[d.treeId]!;
    const node = tree.nodes[d.nodeId]!;
    const rng = new RngCursor(state.rng);
    const events: GameEvent[] = [];

    // A node without choices just continues.
    if (!node.choices || node.choices.length === 0) {
      if (cmd.index !== 0) return fail('invalid_target', 'Only "continue" here');
      const r = enterNode(ruleset, content, state, d, node.next, events, rng);
      return r.ok ? { ...r, state: { ...r.state, rng: rng.state } } : r;
    }

    const view = dialogueChoices(ruleset, state, tree).find((c) => c.index === cmd.index);
    if (!view || !view.available) return fail('invalid_target', 'That choice is not available');
    const choice = node.choices[cmd.index]!;
    events.push({ type: 'dialogueChoice', treeId: d.treeId, nodeId: d.nodeId, index: cmd.index } as DialogueEvent);

    let next = state;
    let taken = d.taken;
    if (choice.once) {
      const key = `${tree.id}/${d.nodeId}/${cmd.index}`;
      taken = [...taken, key];
      next = { ...next, flags: { ...next.flags, [`taken:${key}`]: true } };
    }
    let target = choice.next;
    let lastCheck: CheckResult | undefined;
    if (choice.check) {
      const actorId = choice.check.actor ?? d.actorId;
      if (!next.entities[actorId]) return fail('unknown_entity', `No entity "${actorId}" to roll`);
      lastCheck = ruleset.resolveCheck(next, { actorId, check: choice.check.check, target: choice.check.dc, ...(choice.check.situational ? { situational: choice.check.situational } : {}) }, rng);
      events.push({ type: 'dialogueCheck', actorId, result: lastCheck } as DialogueCheckEvent);
      target = lastCheck.success ? choice.check.success : choice.check.failure;
    }
    const applied = applyDialogueEffects(ruleset, { ...next, rng: rng.state }, choice.effects ?? [], rng);
    if (!applied.ok) return applied;
    next = applied.state;
    events.push(...applied.events);
    const current = { ...d, taken, ...(lastCheck ? { lastCheck } : {}) };
    if (next.turn.mode === 'combat' && state.turn.mode !== 'combat') {
      events.push({ type: 'dialogueEnded', treeId: d.treeId } as DialogueEvent);
      return { ok: true, state: { ...withDialogue(next, null), rng: rng.state }, events };
    }
    const r = enterNode(ruleset, content, next, current, target, events, rng);
    return r.ok ? { ...r, state: { ...r.state, rng: rng.state } } : r;
};

/** Interaction reach: next to it (diagonals count). */
export const INTERACT_RANGE = 1;

export const interact: CommandHandler<InteractCommand> = (state, cmd, ctx) => {
    const actor = requireControlled(state, cmd.issuer, cmd.entityId);
    if (!actor.ok) return actor;
    const target = state.entities[cmd.targetId];
    if (!target) return fail('unknown_entity', `No entity "${cmd.targetId}"`);
    if (gridDistance(actor.entity.position, target.position) > INTERACT_RANGE) return fail('out_of_range', 'Too far to interact');
    const treeId = target.tags.find((t) => t.startsWith('dialogue:'))?.slice('dialogue:'.length);
    if (!treeId) return fail('invalid_target', `${target.id} has nothing to say`);
    return startDialogue(state, { type: 'startDialogue', issuer: cmd.issuer, treeId, actorId: cmd.entityId, partnerId: target.id } as StartDialogueCommand, ctx);
};
