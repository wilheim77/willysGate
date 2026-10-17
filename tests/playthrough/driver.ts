import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SYSTEM_ISSUER,
  dialogueChoices,
  dialogueOf,
  evaluateCondition,
  inZone,
  nextAiCommand,
  zonesOf,
  type BaseCommand,
  type ChooseOptionCommand,
  type DialogueTree,
  type DialogueWhen,
  type Effect,
  type GameState,
  type MapZone,
  type StartDialogueCommand,
  isHostile,
} from '../../engine';
import { dnd5e, levelUpCharacter } from '../../rulesets/dnd5e';
import levelupsJson from '../../content/intereses/levelups.json';
import type { makeEngine } from './setup';

interface LevelRule {
  level: number;
  when: DialogueWhen;
}
const LEVEL_RULES = (levelupsJson as { levels: LevelRule[] }).levels;

/**
 * A DOM-free replica of src/game/controller.ts's `onIdle` (encounters -> scenes ->
 * triggers -> exits, see controller.ts:288-319 and its checkEncounters/checkScenes/
 * checkTriggers/checkExits at lines 344-414), so the harness exercises the SAME decision
 * order the real client does instead of its own ad hoc scan of entity tags. Per review-8
 * §2: the golden path's old approach missed zone conditions (requiresFlag/unlessFlag/
 * speaker) and never ran `encounters` at all.
 *
 * The party is moved (teleported, not pathfound - see actTravel.test.ts for why) onto
 * whichever zone fires, exactly like the client puts the leader there before checking.
 */

export type Engine = ReturnType<typeof makeEngine>;

export interface Trigger {
  id: string;
  when: DialogueWhen;
  dialogue: string;
  partner?: string;
  map?: string;
}

export function loadTriggers(): Trigger[] {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'content', 'intereses', 'triggers.json'), 'utf8')) as { triggers: Trigger[] };
  return raw.triggers;
}

/** Driver-side bookkeeping that isn't part of GameState (the client keeps it in memory too:
 *  controller.ts's `this.triggersShown`, cleared on map change - we don't need to clear it,
 *  since a trigger whose `when` no longer holds just won't fire again anyway). */
export interface DriverCtx {
  triggersShown: Set<string>;
  leaderId: string;
}

export function newDriverCtx(leaderId = 'hero'): DriverCtx {
  return { triggersShown: new Set(), leaderId };
}

function zoneAllowed(state: GameState, z: MapZone): boolean {
  const req = z.properties.requiresFlag;
  const unless = z.properties.unlessFlag;
  if (req && !state.flags[String(req)]) return false;
  if (unless && state.flags[String(unless)]) return false;
  return true;
}

function standAt(state: GameState, entityId: string, p: { x: number; y: number }): GameState {
  return { ...state, entities: { ...state.entities, [entityId]: { ...state.entities[entityId]!, position: p } } };
}

/** Runs AI commands on both sides until the fight ends. Caller already knows combat just
 *  started (mirrors controller.ts's scheduleAi, minus the setTimeout). */
export function resolveCombat(engine: Engine, state: GameState, maxCommands = 600): { state: GameState; rounds: number } {
  let s = state;
  let guard = 0;
  while (s.turn.mode === 'combat' && guard++ < maxCommands) {
    const activeId = s.turn.activeEntityId;
    if (!activeId) break;
    const cmd = nextAiCommand(dnd5e, s, activeId);
    const r = engine.apply(s, cmd);
    if (r.ok) s = r.state;
    else {
      // "A plan the engine refuses must never stall the fight" (controller.ts:328-329).
      const skip = engine.apply(s, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: activeId } as BaseCommand & { entityId: string });
      if (skip.ok) s = skip.state;
      else break;
    }
  }
  if (s.turn.mode === 'combat') throw new Error(`resolveCombat: still fighting after ${maxCommands} AI commands (round ${s.turn.round})`);
  return { state: s, rounds: s.turn.round };
}

/** controller.ts:391-414. */
function checkEncounters(engine: Engine, state: GameState, ctx: DriverCtx): GameState | null {
  const leader = state.entities[ctx.leaderId];
  if (!leader) return null;
  for (const zone of zonesOf(state, 'encounters')) {
    if (!inZone(zone, leader.position) || !zoneAllowed(state, zone)) continue;
    const foes = String(zone.properties.participants ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((id) => state.entities[id] && dnd5e.isStanding(state.entities[id]!) && isHostile(leader, state.entities[id]!));
    if (foes.length === 0) continue;
    const party = Object.values(state.entities)
      .filter((e) => e.factionId === leader.factionId && dnd5e.isStanding(e))
      .map((e) => e.id);
    const flag = (f: unknown): Effect => ({ type: 'setFlag', flag: String(f), value: true });
    const hooks = zone.properties.setFlag || zone.properties.winFlag
      ? { side: leader.factionId, ...(zone.properties.winFlag ? { onVictory: [flag(zone.properties.winFlag)] } : {}), ...(zone.properties.setFlag ? { onEnd: [flag(zone.properties.setFlag)] } : {}) }
      : undefined;
    const started = engine.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: [...party, ...foes], ...(hooks ? { hooks } : {}) } as BaseCommand & {
      participants: string[];
    });
    if (!started.ok) throw new Error(`encounter "${zone.name}": startCombat failed (${started.error.code})`);
    return started.state;
  }
  return null;
}

/** controller.ts:343-359. Stands the leader on the zone first (the client requires the
 *  leader to have walked there; we teleport, same rationale as actTravel.test.ts). */
function checkScenes(state: GameState, engine: Engine, ctx: DriverCtx): GameState | null {
  const leader = state.entities[ctx.leaderId];
  if (!leader || dialogueOf(state)) return null;
  for (const z of zonesOf(state, 'scenes')) {
    if (!zoneAllowed(state, z)) continue;
    const dialogue = String(z.properties.dialogue ?? '');
    if (!dialogue || dialogue.startsWith('TODO') || !engine.content.dialogues[dialogue]) continue;
    const seen = `scene:${z.name}`;
    if (z.properties.once !== false && state.flags[seen]) continue;
    const speaker = z.properties.speaker ? state.entities[String(z.properties.speaker)] : undefined;
    if (z.properties.speaker && (!speaker || !dnd5e.isStanding(speaker))) continue;
    const standing = standAt(state, ctx.leaderId, { x: z.x, y: z.y });
    const cmd: StartDialogueCommand & { markFlag?: string; partnerId?: string } = {
      type: 'startDialogue',
      issuer: SYSTEM_ISSUER,
      treeId: dialogue,
      actorId: leader.id,
      markFlag: seen,
      ...(speaker ? { partnerId: speaker.id } : {}),
    };
    const r = engine.apply(standing, cmd as unknown as BaseCommand);
    if (r.ok) return r.state;
  }
  return null;
}

/** controller.ts:365-381: the story says the party has grown; rebuild everyone below the
 *  level it has earned (class characters only - companions and the leader, not monsters). */
function checkLevels(engine: Engine, state: GameState, ctx: DriverCtx): GameState | null {
  const leader = state.entities[ctx.leaderId];
  if (!leader || dialogueOf(state)) return null;
  const earned = Math.max(0, ...LEVEL_RULES.filter((r) => evaluateCondition(dnd5e, state, leader.id, r.when)).map((r) => r.level));
  if (!earned) return null;
  const behind = Object.values(state.entities).filter((e) => e.controllerId === 'player:1' && e.tags.some((t) => t.startsWith('class:')) && (e.stats.level ?? 1) < earned);
  if (!behind.length) return null;
  const r = engine.apply(state, {
    type: 'script',
    issuer: SYSTEM_ISSUER,
    effects: behind.map((e) => ({ type: 'replaceEntity', entity: levelUpCharacter(e, earned) })),
  } as unknown as BaseCommand);
  return r.ok ? r.state : null;
}

/** controller.ts:361-376: no zone, pure flag condition, offered once per visit while it holds. */
function checkTriggers(state: GameState, engine: Engine, ctx: DriverCtx, triggers: Trigger[]): GameState | null {
  const leader = state.entities[ctx.leaderId];
  if (!leader || dialogueOf(state)) return null;
  for (const t of triggers) {
    if (ctx.triggersShown.has(t.id) || (t.map && t.map !== state.map.id) || !engine.content.dialogues[t.dialogue]) continue;
    if (!evaluateCondition(dnd5e, state, leader.id, t.when)) continue;
    ctx.triggersShown.add(t.id);
    const r = engine.apply(state, {
      type: 'startDialogue',
      issuer: SYSTEM_ISSUER,
      treeId: t.dialogue,
      actorId: leader.id,
      ...(t.partner && state.entities[t.partner] ? { partnerId: t.partner } : {}),
    } as unknown as BaseCommand);
    if (r.ok) return r.state;
  }
  return null;
}

/** controller.ts:378-389, but the exit to use is picked by `pickExit` (the real client just
 *  uses whichever one the leader happens to be standing on; the driver has to choose for
 *  itself which one to walk to - see `routeTo` below for the BFS version). */
function checkExits(state: GameState, engine: Engine, ctx: DriverCtx, exit: MapZone): GameState | null {
  const standing = standAt(state, ctx.leaderId, { x: exit.x, y: exit.y });
  const r = engine.apply(standing, {
    type: 'travel',
    issuer: 'player:1',
    entityId: ctx.leaderId,
    mapId: String(exit.properties.to),
    spawn: String(exit.properties.spawn),
  } as BaseCommand & { entityId: string; mapId: string; spawn: string });
  return r.ok ? r.state : null;
}

/** A choice policy picks the choice index at a dialogue node, or null to let the default
 *  (greedy: progress a not-yet-seen critical flag, else untried, else first) decide. Keyed
 *  by "treeId@nodeId"; forcedChecks keyed the same way forces a check's success/failure by
 *  retrying with perturbed RNG (same pattern as tests/rulesets/willy-helpers.ts's `until`). */
export interface ChoicePolicy {
  choices?: Record<string, number>;
  forcedChecks?: Record<string, 'success' | 'fail'>;
}

/** setFlag targets reachable from `nodeId`, ignoring `when` conditions and dice (both
 *  success and failure branches of a check), up to `maxDepth` hops - a static over-
 *  approximation so the picker can see "this choice's check, if it succeeds, unlocks a
 *  critical flag" even on a run where the dry-run roll happened to fail. Guards against
 *  cycles (the dialogue graph loops back to hubs on purpose). */
function reachableFlags(tree: DialogueTree, nodeId: string | undefined, maxDepth: number, seen = new Set<string>()): Set<string> {
  const out = new Set<string>();
  if (!nodeId || maxDepth < 0 || seen.has(nodeId)) return out;
  seen.add(nodeId);
  const node = tree.nodes[nodeId];
  if (!node) return out;
  for (const e of node.effects ?? []) if (e.type === 'setFlag' && e.value === true) out.add(String(e.flag));
  const nextTargets = Array.isArray(node.next) ? node.next.map((b) => b.next) : node.next ? [node.next] : [];
  for (const t of nextTargets) for (const f of reachableFlags(tree, t, maxDepth - 1, seen)) out.add(f);
  for (const c of node.choices ?? []) {
    for (const e of c.effects ?? []) if (e.type === 'setFlag' && e.value === true) out.add(String(e.flag));
    const targets = c.check ? [c.check.success, c.check.failure] : c.next ? [c.next] : [];
    for (const t of targets) for (const f of reachableFlags(tree, t, maxDepth - 1, seen)) out.add(f);
  }
  return out;
}

/** Whether taking `choice` could plausibly unlock a critical flag we haven't seen yet -
 *  and, if it has a `check`, whether that flag sits specifically behind success (so the
 *  caller knows to force it rather than leave it to the dice). */
function criticalPotential(tree: DialogueTree, choiceNext: string | undefined, checkTargets: { success?: string; failure?: string } | undefined, seenCritical: Set<string>, critical: string[]): { any: boolean; forceSuccess: boolean } {
  if (checkTargets) {
    const onSuccess = [...reachableFlags(tree, checkTargets.success, 4)].some((f) => critical.includes(f) && !seenCritical.has(f));
    const onFailure = [...reachableFlags(tree, checkTargets.failure, 4)].some((f) => critical.includes(f) && !seenCritical.has(f));
    return { any: onSuccess || onFailure, forceSuccess: onSuccess && !onFailure };
  }
  return { any: [...reachableFlags(tree, choiceNext, 4)].some((f) => critical.includes(f) && !seenCritical.has(f)), forceSuccess: false };
}

/** Returns the chosen index, plus whether that choice's check (if any) should be forced
 *  to succeed because a critical flag sits behind success and not behind failure. */
function defaultPick(engine: Engine, state: GameState, tree: DialogueTree, seenCritical: Set<string>, critical: string[], tried: Set<number>): { index: number; forceSuccess: boolean } {
  const d = dialogueOf(state)!;
  const node = tree.nodes[d.nodeId];
  if (!node?.choices?.length) return { index: 0, forceSuccess: false };
  const available = dialogueChoices(dnd5e, state, tree).filter((c) => c.available);
  // A flag already true *right now* (even if driveDialogue's caller hasn't recorded it in
  // seenCritical yet) must not keep scoring as "new progress" - otherwise a node that loops
  // back on itself after setting its flag (pozo_ahorcado's "Mirar dentro" -> back to "pozo")
  // picks the same already-done choice forever instead of ever reaching "Dejarlo.".
  const alreadyTrue = new Set([...seenCritical, ...Object.keys(state.flags).filter((f) => state.flags[f] === true)]);
  let best = available[0]!.index;
  let bestScore = -1;
  let bestForceSuccess = false;
  for (const c of available) {
    const choice = node.choices![c.index]!;
    const r = engine.apply(state, { type: 'chooseOption', issuer: SYSTEM_ISSUER, index: c.index } as ChooseOptionCommand);
    if (!r.ok) continue;
    const realizedCritical = Object.keys(r.state.flags).filter((f) => r.state.flags[f] === true && !alreadyTrue.has(f) && critical.includes(f)).length;
    const potential = criticalPotential(tree, choice.next, choice.check ? { success: choice.check.success, failure: choice.check.failure } : undefined, alreadyTrue, critical);
    // Prefer realized progress first (we already know it worked), then static potential
    // (a check whose success branch unlocks something, even if THIS roll missed), then
    // (once every option here has been tried) whichever one actually ends the
    // conversation, then simply whatever hasn't been tried yet at this node - a menu with
    // nothing to progress would otherwise always re-pick the same first option forever.
    const everythingTried = available.every((x) => tried.has(x.index));
    const endsHere = everythingTried && !dialogueOf(r.state) ? 1 : 0;
    const score = realizedCritical * 1000 + (potential.any ? 100 : 0) + endsHere * 10 + (tried.has(c.index) ? 0 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = c.index;
      bestForceSuccess = potential.any && potential.forceSuccess;
    }
  }
  return { index: best, forceSuccess: bestForceSuccess };
}

/** Drives an already-open dialogue to its end, honouring the policy's scripted choices and
 *  forced check outcomes. Resolves any fight the dialogue starts with the AI. */
export function driveDialogue(engine: Engine, state: GameState, ctx: DriverCtx, policy: ChoicePolicy, seenCritical: Set<string>, critical: string[], maxSteps = 200): GameState {
  let s = state;
  const triedAt = new Map<string, Set<number>>();
  for (let step = 0; dialogueOf(s) && step < maxSteps; step++) {
    const d = dialogueOf(s)!;
    const tree = engine.content.dialogues[d.treeId];
    if (!tree) throw new Error(`dialogue points at unknown tree "${d.treeId}"`);
    const node = tree.nodes[d.nodeId];
    const key = `${d.treeId}@${d.nodeId}`;
    const scripted = policy.choices?.[key];
    const tried = triedAt.get(key) ?? new Set<number>();
    triedAt.set(key, tried);

    let index: number;
    let autoForceSuccess = false;
    if (scripted !== undefined) index = scripted;
    else if (!node?.choices?.length) index = 0;
    else {
      const picked = defaultPick(engine, s, tree, seenCritical, critical, tried);
      index = picked.index;
      autoForceSuccess = picked.forceSuccess;
    }
    tried.add(index);
    // An explicit policy entry wins over the picker's own "this check gates a critical
    // flag" inference; otherwise, force success automatically when it found one.
    const forced = policy.forcedChecks?.[key] ?? (autoForceSuccess ? 'success' : undefined);

    let cmd: ChooseOptionCommand = { type: 'chooseOption', issuer: SYSTEM_ISSUER, index };
    let r = engine.apply(s, cmd);
    if (r.ok && forced) {
      const check = r.events.find((e) => e.type === 'dialogueCheck') as { result: { success: boolean } } | undefined;
      let tries = 0;
      while (check && check.result.success !== (forced === 'success') && tries++ < 200) {
        const perturbed = { ...s, rng: { ...s.rng, a: (s.rng.a + tries * 7919) >>> 0 } };
        r = engine.apply(perturbed, cmd);
        if (!r.ok) break;
        const recheck = r.events.find((e) => e.type === 'dialogueCheck') as { result: { success: boolean } } | undefined;
        if (recheck && recheck.result.success === (forced === 'success')) break;
      }
    }
    if (!r.ok) throw new Error(`${key} + chooseOption(${index}) failed: ${JSON.stringify(r.error)}`);
    s = r.state;
    if (s.turn.mode === 'combat') {
      const resolved = resolveCombat(engine, s);
      s = resolved.state;
    }
  }
  if (dialogueOf(s)) throw new Error(`dialogue "${dialogueOf(s)!.treeId}" did not end within ${maxSteps} steps (possible softlock)`);
  return s;
}

/** One `onIdle` pass, minus `checkExits` (that one needs the caller to have already picked
 *  *which* exit via route planning - see `goldenPathMatrix.test.ts`): encounters -> scenes
 *  -> triggers, same order and same early-return as controller.ts. Returns the new state
 *  if something fired (any dialogue it opened is still open: drive it before calling this
 *  again), else null (truly idle on this map right now). */
export function idleStep(engine: Engine, state: GameState, ctx: DriverCtx, triggers: Trigger[]): GameState | null {
  const encountered = checkEncounters(engine, state, ctx);
  if (encountered) return resolveCombat(engine, encountered).state;
  const scened = checkScenes(state, engine, ctx);
  if (scened) return scened;
  const leveled = checkLevels(engine, state, ctx);
  if (leveled) return leveled;
  return checkTriggers(state, engine, ctx, triggers);
}

/** The player walking up to someone and talking (a separate client action from onIdle -
 *  controller.ts's `approachAndInteract`, triggered by a tap, not automatic). Entities
 *  tagged `dialogue:<id>` that the auto `scenes`/`triggers` checks don't otherwise open. */
export function interactables(state: GameState, ctx: DriverCtx): { entityId: string; treeId: string }[] {
  const leader = state.entities[ctx.leaderId];
  if (!leader) return [];
  return Object.values(state.entities)
    .filter((e) => e.id !== ctx.leaderId && dnd5e.isStanding(e))
    .flatMap((e) => e.tags.filter((t) => t.startsWith('dialogue:')).map((t) => ({ entityId: e.id, treeId: t.slice('dialogue:'.length) })));
}

export function interact(engine: Engine, state: GameState, ctx: DriverCtx, entityId: string): GameState | null {
  const leader = state.entities[ctx.leaderId]!;
  const target = state.entities[entityId]!;
  const standing = standAt(state, ctx.leaderId, { ...target.position });
  const r = engine.apply(standing, { type: 'interact', issuer: leader.controllerId, entityId: ctx.leaderId, targetId: entityId } as BaseCommand & {
    entityId: string;
    targetId: string;
  });
  return r.ok ? r.state : null;
}

export function exitsAllowedFrom(state: GameState): MapZone[] {
  return (zonesOf(state, 'exits') as MapZone[]).filter((z) => zoneAllowed(state, z));
}

export { checkExits };
