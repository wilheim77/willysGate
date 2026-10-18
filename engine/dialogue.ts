import { type StartCombatCommand, applyOutcome, startCombat } from './combat';
import { type BaseCommand, type CommandHandler, type CommandResult, type GameEvent, SYSTEM_ISSUER, fail, requireControlled } from './command-types';
import { type Effect, applyEffects } from './effects';
import type { ProgressionContent } from './progression';
import { gridDistance } from './grid';
import { itemCount } from './inventory';
import { RngCursor } from './rng';
import type { CheckResult, Ruleset } from './ruleset';
import { type MapBuilder, changeMap } from './world';
import { type FlagValue, type GameState, type JsonValue, OBJECT_TAG } from './state';

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
  /** Long runs without choices (an epilogue): the client may advance by itself. */
  cinematic?: boolean;
}

export interface DialogueNode {
  /** Entity id speaking, or omitted for narration. */
  speaker?: string;
  text: string;
  /** Applied when the conversation reaches this node. */
  effects?: DialogueEffect[];
  choices?: DialogueChoice[];
  /**
   * With no choices: continue here (a "Continuar" button), or end when omitted. A list picks
   * the first entry whose `when` holds (the last one without `when` is the fallback).
   */
  next?: string | { when?: DialogueWhen; next?: string }[];
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
  /** Stable id for "once" bookkeeping, so reordering choices doesn't break saved games. */
  id?: string;
}

export type DialogueWhen =
  | { flag: string; is?: FlagValue }
  | { notFlag: string }
  | { item: string; owner?: string; atLeast?: number }
  | { rule: string; actor?: string; params?: Record<string, JsonValue> }
  | { all: DialogueWhen[] }
  | { any: DialogueWhen[] }
  | { not: DialogueWhen }
  /** The entity is in the speaker's party (same controller). */
  | { inParty: string };

export type DialogueEffect =
  | Effect
  /** Start a fight with everyone of these factions on the map; optional consequences by outcome. */
  | { type: 'startCombat'; factions: string[]; onVictory?: Effect[]; onDefeat?: Effect[] }
  /** The party leaves for another map (a cart ride, a cave-in, "follow me"). */
  | { type: 'travel'; mapId: string; spawn: string }
  /** The party rests; what that restores is the ruleset's business (Ruleset.onRest). */
  | { type: 'rest'; kind: string };

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
  /** Builders for the game's maps, by id, used the first time the party travels there. */
  maps?: Record<string, MapBuilder>;
  /** Points needed per level for the party's shared progress (engine/progression.ts). */
  progression?: ProgressionContent;
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
  /** A flag set when it opens (scenes that play once). */
  markFlag?: string;
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
  if ('inParty' in c) {
    const who = state.entities[c.inParty];
    const me = state.entities[actorId];
    // Belonging is about who leads them, not whether they're on their feet right now.
    return !!who && !!me && who.controllerId === me.controllerId && !who.conditions.some((c) => c.id === 'dead');
  }
  if ('notFlag' in c) return !state.flags[c.notFlag];
  if ('flag' in c) return c.is === undefined ? !!state.flags[c.flag] : state.flags[c.flag] === c.is;
  if ('item' in c) return itemCount(state, c.owner ?? 'party', c.item) >= (c.atLeast ?? 1);
  const rule = ruleset.dialogueConditions[c.rule];
  if (!rule) throw new Error(`Unknown dialogue condition "${c.rule}"`);
  const who = c.actor ?? actorId;
  return !!state.entities[who] && rule(state, who, c.params ?? {});
}

/** Where a choiceless node continues: a fixed id, or the first branch whose condition holds. */
export function resolveNext(ruleset: Ruleset, state: GameState, actorId: string, next: DialogueNode['next']): string | undefined {
  if (next === undefined || typeof next === 'string') return next;
  return next.find((b) => !b.when || evaluateCondition(ruleset, state, actorId, b.when))?.next;
}

/** Every node id a `next` may lead to (for validation). */
export function nextTargets(next: DialogueNode['next']): string[] {
  if (next === undefined) return [];
  if (typeof next === 'string') return [next];
  return next.flatMap((b) => (b.next ? [b.next] : []));
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
    if (c.once && d.taken.includes(`${tree.id}/${d.nodeId}/${c.id ?? index}`)) return [];
    const roller = c.check ? (c.check.actor ?? d.actorId) : d.actorId;
    const available = (!c.when || evaluateCondition(ruleset, state, d.actorId, c.when)) && !!state.entities[roller];
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
  const tree = content.dialogues[d.treeId];
  if (!nodeId || !tree) {
    events.push({ type: 'dialogueEnded', treeId: d.treeId } as DialogueEvent);
    return { ok: true, state: withDialogue(state, null), events };
  }
  const node = tree.nodes[nodeId];
  if (!node) return fail('invalid_target', `Dialogue ${d.treeId} has no node "${nodeId}"`);
  let next = withDialogue(state, { ...d, nodeId });
  events.push({ type: 'dialogueNode', treeId: d.treeId, nodeId } as DialogueEvent);
  const applied = applyDialogueEffects(ruleset, next, node.effects ?? [], rng, content);
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

function applyDialogueEffects(ruleset: Ruleset, state: GameState, effects: DialogueEffect[], rng: RngCursor, content: EngineContent): CommandResult {
  const plain = effects
    .filter((e): e is Effect => e.type !== 'startCombat' && e.type !== 'travel' && e.type !== 'rest')
    .map((e) => bindPartner(state, e))
    .filter((e): e is Effect => e !== null);
  // Through applyOutcome, so a cave-in or a shove from a dialogue still hurts (falls, surfaces).
  const applied = applyOutcome(ruleset, state, { effects: plain, events: [] }, rng);
  let next = applied.state;
  const events: GameEvent[] = [...applied.events];
  for (const e of effects) {
    if (e.type === 'rest') {
      const d = dialogueOf(next);
      const issuer = d ? next.entities[d.actorId]?.controllerId : undefined;
      const party = Object.values(next.entities).filter((x) => issuer && x.controllerId === issuer).map((x) => x.id);
      if (!ruleset.onRest || party.length === 0) continue;
      const kind = (e as { kind: string }).kind;
      const outcome = ruleset.onRest(next, party, kind, rng);
      const r = applyOutcome(ruleset, next, outcome, rng);
      next = r.state;
      // After the rest's own events: the client checkpoints the game on 'rested'.
      events.push(...r.events, { type: 'rested', kind, party } as GameEvent);
      continue;
    }
    if (e.type === 'travel') {
      const t = e as { mapId: string; spawn: string };
      const d = dialogueOf(next);
      const issuer = d ? next.entities[d.actorId]?.controllerId : undefined;
      const party = Object.values(next.entities).filter((x) => issuer && x.controllerId === issuer).map((x) => x.id);
      // Already there (the scene happens where you stand): nothing to do.
      if (t.mapId === next.map.id) continue;
      const r = changeMap(next, content.maps ?? {}, t.mapId, t.spawn, party);
      if (!r.ok) return r;
      next = r.state;
      events.push(...r.events);
      continue;
    }
    if (e.type !== 'startCombat') continue;
    const factions = (e as { factions: string[] }).factions;
    const leaderSide = Object.values(next.entities).find((x) => x.controllerId.startsWith('player'))?.factionId;
    const participants = Object.values(next.entities)
      .filter((x) => ruleset.isStanding(x) && (factions.includes(x.factionId) || x.factionId === leaderSide))
      .map((x) => x.id);
    const hooks0 = e as { onVictory?: Effect[] };
    const foes = participants.filter((id) => next.entities[id]!.factionId !== leaderSide);
    if (foes.length === 0) {
      // Nobody left to fight (they're dead or gone): it counts as won, never as a dead end.
      const won = applyOutcome(ruleset, next, { effects: hooks0.onVictory ?? [], events: [] }, rng);
      next = won.state;
      events.push(...won.events);
      continue;
    }
    const r = startCombat({ ...next, rng: rng.state }, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants } as StartCombatCommand, { ruleset });
    if (!r.ok) return r;
    next = r.state;
    const hooks = e as { onVictory?: Effect[]; onDefeat?: Effect[] };
    if (leaderSide && (hooks.onVictory || hooks.onDefeat)) {
      next = { ...next, systems: { ...next.systems, combatHooks: { side: leaderSide, ...(hooks.onVictory ? { onVictory: hooks.onVictory } : {}), ...(hooks.onDefeat ? { onDefeat: hooks.onDefeat } : {}) } as unknown as JsonValue } };
    }
    rng.state = next.rng;
    events.push(...r.events);
  }
  return { ok: true, state: next, events };
}

/**
 * Generic scripts (any door, any well) refer to whatever the party is talking to as
 * "$partner": its id, or its tile for setTile.
 */
function bindPartner(state: GameState, effect: Effect): Effect | null {
  const d = dialogueOf(state);
  const partner = d?.partnerId ? state.entities[d.partnerId] : undefined;
  const e = { ...effect } as Record<string, unknown>;
  // Opened without anyone to talk to (a test, a script): the "$partner" parts have nothing to act on.
  if (!partner) return e.entityId === '$partner' || e.position === '$partner' ? null : effect;
  if (e.entityId === '$partner') e.entityId = partner.id;
  if (e.position === '$partner') e.position = { ...partner.position };
  return e as unknown as Effect;
}

/** Scripts (the game itself) open conversations directly; players go through `interact`. */
export const startDialogue: CommandHandler<StartDialogueCommand> = (state, cmd, { ruleset, content = EMPTY_CONTENT }) => {
  if (cmd.issuer !== SYSTEM_ISSUER) return fail('not_your_entity', 'Only the game starts dialogues directly');
  const marked = cmd.markFlag ? { ...state, flags: { ...state.flags, [cmd.markFlag]: true } } : state;
  return openDialogue(ruleset, content, marked, cmd.treeId, cmd.actorId, cmd.partnerId);
};

function openDialogue(ruleset: Ruleset, content: EngineContent, state: GameState, treeId: string, actorId: string, partnerId?: string): CommandResult {
  if (state.turn.mode === 'combat') return fail('cannot_act', 'No conversations in combat');
  if (dialogueOf(state)) return fail('cannot_act', 'Already in a conversation');
  const tree = content.dialogues[treeId];
  if (!tree) return fail('invalid_target', `No dialogue "${treeId}"`);
  if (!state.entities[actorId]) return fail('unknown_entity', `No entity "${actorId}"`);
  const d: DialogueState = { treeId: tree.id, nodeId: tree.start, actorId, ...(partnerId ? { partnerId } : {}), taken: carriedOver(state, tree.id) };
  const rng = new RngCursor(state.rng);
  const events: GameEvent[] = [{ type: 'dialogueStarted', treeId: tree.id, actorId, partnerId } as DialogueEvent];
  const r = enterNode(ruleset, content, state, d, tree.start, events, rng);
  return r.ok ? { ...r, state: { ...r.state, rng: rng.state } } : r;
}

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
    const tree = content.dialogues[d.treeId];
    const node = tree?.nodes[d.nodeId];
    // A save from an older version may point at a conversation that no longer exists.
    if (!tree || !node) return { ok: true, state: withDialogue(state, null), events: [{ type: 'dialogueEnded', treeId: d.treeId } as DialogueEvent] };
    const rng = new RngCursor(state.rng);
    const events: GameEvent[] = [];

    // A node without choices just continues.
    if (!node.choices || node.choices.length === 0) {
      if (cmd.index !== 0) return fail('invalid_target', 'Only "continue" here');
      const r = enterNode(ruleset, content, state, d, resolveNext(ruleset, state, d.actorId, node.next), events, rng);
      return r.ok ? { ...r, state: { ...r.state, rng: rng.state } } : r;
    }

    const view = dialogueChoices(ruleset, state, tree).find((c) => c.index === cmd.index);
    if (!view || !view.available) return fail('invalid_target', 'That choice is not available');
    const choice = node.choices[cmd.index]!;
    events.push({ type: 'dialogueChoice', treeId: d.treeId, nodeId: d.nodeId, index: cmd.index } as DialogueEvent);

    let next = state;
    let taken = d.taken;
    if (choice.once) {
      const key = `${tree.id}/${d.nodeId}/${choice.id ?? cmd.index}`;
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
    const applied = applyDialogueEffects(ruleset, { ...next, rng: rng.state }, choice.effects ?? [], rng, content);
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
    if (!ctx.ruleset.canAct(actor.entity)) return fail('cannot_act', `${cmd.entityId} cannot act`);
    // The dead don't talk; objects (chests, levers) have no pulse to check.
    if (!target.tags.includes(OBJECT_TAG) && !ctx.ruleset.isStanding(target)) return fail('invalid_target', `${target.id} cannot talk`);
    return openDialogue(ctx.ruleset, ctx.content ?? EMPTY_CONTENT, state, treeId, cmd.entityId, target.id);
};

/** Leaves a conversation (the panel's escape hatch, or a script). */
export interface EndDialogueCommand extends BaseCommand {
  type: 'endDialogue';
}

export const endDialogue: CommandHandler<EndDialogueCommand> = (state, cmd) => {
  const d = dialogueOf(state);
  if (!d) return fail('cannot_act', 'No conversation in progress');
  // If the speaker no longer exists (an old save), anyone may close it rather than stay stuck.
  const speaker = state.entities[d.actorId];
  if (cmd.issuer !== SYSTEM_ISSUER && speaker && speaker.controllerId !== cmd.issuer) return fail('not_your_entity', 'Not your conversation');
  return { ok: true, state: withDialogue(state, null), events: [{ type: 'dialogueEnded', treeId: d.treeId } as DialogueEvent] };
};
