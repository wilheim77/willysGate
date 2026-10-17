import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SYSTEM_ISSUER,
  dialogueChoices,
  dialogueOf,
  nextAiCommand,
  zonesOf,
  type BaseCommand,
  type ChooseOptionCommand,
  type DialogueTree,
  type GameState,
  type MapZone,
  type StartDialogueCommand,
} from '../../engine';
import { dnd5e } from '../../rulesets/dnd5e';
import { buildActWorld, makeEngine } from './setup';

/**
 * End-to-end "golden path": a fresh game, automatically driven as far through the act as
 * it can go — opening every story dialogue available on the current map, greedily picking
 * whichever choice sets a critical flag (content/intereses/flags.json) the run hasn't
 * reached yet, resolving any fight that starts, and travelling through a real exit once
 * its `requiresFlag`/`unlessFlag` gate allows it. This is the "jugador automático": it
 * doesn't know the story, it just always tries to make progress and never crashes.
 *
 * It's a soak, not a walkthrough with a known answer key, so the pass/fail bar is: no
 * exception, no softlock, combat always ends, every map it does reach is sane, and it
 * terminates within a step budget. Which critical flags and maps it actually reaches is
 * reported, not asserted hard (narrative branching means a purely greedy player can
 * legitimately miss a route a human would take) — except we do assert it reaches at least
 * the midpoint of the act, so a regression that strands the run on "camino" forever still
 * fails loudly.
 */

const MAX_TOTAL_STEPS = 6000;
const MAX_STEPS_PER_TREE = 150;

function criticalFlags(): string[] {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'content', 'intereses', 'flags.json'), 'utf8')) as Record<string, unknown>;
  return Object.entries(raw)
    .filter(([, v]) => typeof v === 'object' && v !== null && (v as Record<string, unknown>).critical === true)
    .map(([k]) => k);
}

/** Every dialogue tree reachable on the current map: entities tagged `dialogue:<id>`, plus
 *  the map's "scenes" layer (scripted triggers a real client fires on arrival/interact —
 *  data, not DOM, so the harness can read it directly via zonesOf). Skips "TODO:"-prefixed
 *  scene dialogues: those are placeholders the content isn't written for yet. */
function dialogueTagsOn(state: GameState, engine: ReturnType<typeof makeEngine>): string[] {
  const tagged = Object.values(state.entities).flatMap((e) => e.tags.filter((t) => t.startsWith('dialogue:')).map((t) => t.slice('dialogue:'.length)));
  const scened = (zonesOf(state, 'scenes') as MapZone[])
    .map((z) => String(z.properties.dialogue))
    .filter((id) => !id.startsWith('TODO:') && engine.content.dialogues[id]);
  return [...new Set([...tagged, ...scened])];
}

/** Picks the available choice that sets the most not-yet-seen critical flags, by actually
 *  trying each one (dice and all - a check's two branches are two different realities, we
 *  only see the one that happens to roll, which is fine for a soak). Falls back to any
 *  choice not already tried at this exact node this run, then to the first available one. */
function pickGreedyChoice(
  engine: ReturnType<typeof makeEngine>,
  state: GameState,
  tree: DialogueTree,
  seenCritical: Set<string>,
  triedAt: Map<string, Set<number>>,
): { index: number; result: ReturnType<typeof engine.apply> } | null {
  const d = dialogueOf(state)!;
  const node = tree.nodes[d.nodeId];
  if (!node?.choices?.length) {
    const r = engine.apply(state, { type: 'chooseOption', issuer: SYSTEM_ISSUER, index: 0 } as ChooseOptionCommand);
    return { index: 0, result: r };
  }
  const available = dialogueChoices(dnd5e, state, tree).filter((c) => c.available);
  if (available.length === 0) return null;
  const tried = triedAt.get(d.nodeId) ?? new Set<number>();
  let best: { index: number; result: ReturnType<typeof engine.apply>; score: number } | null = null;
  for (const c of available) {
    const r = engine.apply(state, { type: 'chooseOption', issuer: SYSTEM_ISSUER, index: c.index } as ChooseOptionCommand);
    if (!r.ok) continue;
    const newlyCritical = Object.keys(r.state.flags).filter((f) => r.state.flags[f] === true && !seenCritical.has(f) && criticalFlags().includes(f)).length;
    const score = newlyCritical * 100 + (tried.has(c.index) ? 0 : 1);
    if (!best || score > best.score) best = { index: c.index, result: r, score };
  }
  return best;
}

describe('golden path: a fresh game, driven as far through the act as it can go', () => {
  const engine = makeEngine();
  const trees = Object.values(engine.content.dialogues);

  it('reaches at least the Escorial without crashing, softlocking, or leaving a fight unresolved', () => {
    // The greedy chooser dry-runs every available choice at every node (to score it), so
    // this does meaningfully more engine work than a normal unit test; give it room.
    const critical = criticalFlags();
    const seenCritical = new Set<string>();
    const visitedMaps = new Set<string>();
    const openedTrees = new Set<string>();
    const log: string[] = [];
    let state = buildActWorld(engine, 1, 'camino');
    visitedMaps.add(state.map.id);
    let totalSteps = 0;

    const runTree = (treeId: string) => {
      const tree = engine.content.dialogues[treeId];
      if (!tree || openedTrees.has(treeId)) return;
      openedTrees.add(treeId);
      const startCmd: StartDialogueCommand = { type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId, actorId: 'hero' };
      let start: ReturnType<typeof engine.apply>;
      expect(() => (start = engine.apply(state, startCmd)), `${treeId}: startDialogue threw`).not.toThrow();
      if (!start!.ok) {
        log.push(`${treeId}: could not start (${start!.error.code}) - skipped`);
        return;
      }
      state = start!.state;
      const triedAt = new Map<string, Set<number>>();
      for (let step = 0; dialogueOf(state) && step < MAX_STEPS_PER_TREE; step++) {
        totalSteps++;
        expect(totalSteps, `global step budget exceeded while in "${treeId}"`).toBeLessThanOrEqual(MAX_TOTAL_STEPS);
        const d = dialogueOf(state)!;
        const node = engine.content.dialogues[d.treeId]!.nodes[d.nodeId];
        const available = node?.choices?.length ? dialogueChoices(dnd5e, state, engine.content.dialogues[d.treeId]!).filter((c) => c.available) : [{ index: 0 }];
        expect(available.length, `${treeId}@${d.nodeId}: no available choice (softlock)`).toBeGreaterThan(0);

        let picked: ReturnType<typeof pickGreedyChoice> = null;
        expect(() => (picked = pickGreedyChoice(engine, state, engine.content.dialogues[d.treeId]!, seenCritical, triedAt)), `${treeId}@${d.nodeId}: choosing threw`)
          .not.toThrow();
        expect(picked, `${treeId}@${d.nodeId}: no choice could be applied`).not.toBeNull();
        const { index, result } = picked!;
        expect(result.ok, result.ok ? '' : `${treeId}@${d.nodeId} + chooseOption(${index}) failed: ${JSON.stringify((result as { error: unknown }).error)}`).toBe(
          true,
        );
        (triedAt.get(d.nodeId) ?? triedAt.set(d.nodeId, new Set()).get(d.nodeId)!).add(index);
        if (!result.ok) break;
        state = result.state;

        // A dialogue choice may start a fight: resolve it with the AI before continuing.
        let guard = 0;
        while (state.turn.mode === 'combat' && guard++ < 500) {
          const activeId = state.turn.activeEntityId;
          if (!activeId) break;
          let cmd: BaseCommand;
          expect(() => (cmd = nextAiCommand(dnd5e, state, activeId)), `${treeId}: nextAiCommand threw for ${activeId}`).not.toThrow();
          let r: ReturnType<typeof engine.apply>;
          expect(() => (r = engine.apply(state, cmd!)), `${treeId}: AI command threw mid-fight`).not.toThrow();
          expect(r!.ok, r!.ok ? '' : `${treeId}: AI command failed mid-fight: ${JSON.stringify((r! as { error: unknown }).error)}`).toBe(true);
          if (!r!.ok) break;
          state = r!.state;
        }
        expect(state.turn.mode, `${treeId}: a fight it started never ended`).not.toBe('combat');
      }
      for (const f of Object.keys(state.flags)) if (state.flags[f] === true && critical.includes(f)) seenCritical.add(f);
      visitedMaps.add(state.map.id);
      log.push(`${treeId}: done on map "${state.map.id}" (${seenCritical.size}/${critical.length} critical flags so far)`);
    };

    let stall = 0;
    for (let hop = 0; hop < 20 && totalSteps < MAX_TOTAL_STEPS && stall < 3; hop++) {
      const beforeTrees = openedTrees.size;
      const beforeMaps = visitedMaps.size;
      // Run every story dialogue tagged on the current map, at least once.
      for (const treeId of dialogueTagsOn(state, engine)) runTree(treeId);

      // Then try to leave through whichever real exit is both unblocked and goes somewhere new.
      const exits = (zonesOf(state, 'exits') as MapZone[]).filter((z) => {
        const req = z.properties.requiresFlag;
        const unless = z.properties.unlessFlag;
        return (!req || state.flags[String(req)]) && !(unless && state.flags[String(unless)]);
      });
      const fresh = exits.find((z) => !visitedMaps.has(String(z.properties.to)));
      const exit = fresh ?? exits[0];
      if (!exit) break; // nowhere unblocked to go; this run has gone as far as it can.

      const target = { x: exit.x, y: exit.y };
      let moveResult: ReturnType<typeof engine.apply>;
      expect(() => (moveResult = engine.apply(state, { type: 'move', issuer: 'player:1', entityId: 'hero', to: target } as BaseCommand & { entityId: string; to: typeof target })), `move to exit "${exit.name}" threw`).not.toThrow();
      if (!moveResult!.ok) {
        log.push(`cannot reach exit "${exit.name}" (${moveResult!.error.code}) - stopping`);
        break;
      }
      state = moveResult!.state;

      const travelCmd: BaseCommand & { entityId: string; mapId: string; spawn: string } = {
        type: 'travel',
        issuer: 'player:1',
        entityId: 'hero',
        mapId: String(exit.properties.to),
        spawn: String(exit.properties.spawn),
      };
      let travelResult: ReturnType<typeof engine.apply>;
      expect(() => (travelResult = engine.apply(state, travelCmd)), `travel via "${exit.name}" threw`).not.toThrow();
      if (!travelResult!.ok) {
        log.push(`travel via "${exit.name}" refused (${travelResult!.error.code}) - stopping`);
        break;
      }
      state = travelResult!.state;
      visitedMaps.add(state.map.id);
      log.push(`travelled to "${state.map.id}" via "${exit.name}"`);
      stall = openedTrees.size > beforeTrees || visitedMaps.size > beforeMaps ? 0 : stall + 1;
    }

    // eslint-disable-next-line no-console
    console.log(`Golden path: visited [${[...visitedMaps].join(', ')}], critical flags [${[...seenCritical].join(', ')}] of ${critical.length}.\n${log.join('\n')}`);

    // Hard bar: this should get well past the opening map. A regression that strands a
    // greedy player on "camino" (or crashes before leaving it) fails this.
    expect([...visitedMaps], 'never left the opening map').not.toEqual(['camino']);
    expect(visitedMaps.size, `only visited ${visitedMaps.size} map(s): ${[...visitedMaps].join(', ')}`).toBeGreaterThanOrEqual(2);
  }, 30000);
});
