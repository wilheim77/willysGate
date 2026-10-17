import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYSTEM_ISSUER, dialogueOf, dialogueChoices, type ChooseOptionCommand, type DialogueTree, type GameState, type StartDialogueCommand } from '../../engine';
import { dnd5e } from '../../rulesets/dnd5e';
import { buildWorld, loadDialogues, makeEngine } from './setup';

/**
 * Exhaustive dialogue walker: runs the REAL engine commands (startDialogue/chooseOption),
 * branching over every available choice at each node, across several seeds (so checks land
 * both ways naturally since dice come from the seeded RNG). Complements
 * tests/content/dialogues.test.ts, which only checks the static graph; this one executes it.
 *
 * Invariants checked per branch:
 *  - no exception, ever;
 *  - every branch ends within MAX_STEPS steps (no softlock / infinite loop);
 *  - once a branch ends, state.systems.dialogue is gone (no residual conversation);
 *  - the whole walk (all branches, all seeds) stays under a sane node budget — if it
 *    doesn't, that is itself worth reporting (either a combinatorial trap or a real loop).
 */

// Heavy run: `QA_DEEP=1 npm run test:qa`. Plain `npm test`/`npm run check` only runs a
// light smoke pass (one seed) so the regular dev loop stays fast.
const DEEP = process.env.QA_DEEP === '1';
const SEEDS = DEEP ? [1, 2, 3, 4, 5, 6, 7, 8] : [1];
const MAX_STEPS_PER_BRANCH = 200;
const MAX_VISITED_PER_TREE_SEED = 4000;

describe('dialogue walker (QA playthrough harness)', () => {
  const engine = makeEngine();
  const trees = loadDialogues();

  for (const tree of Object.values(trees) as DialogueTree[]) {
    for (const seed of SEEDS) {
      it(`${tree.id} walks exhaustively without error (seed ${seed})`, () => {
        const world = buildWorld(engine, seed);
        const startCmd: StartDialogueCommand = { type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId: tree.id, actorId: 'hero' };
        const start = engine.apply(world, startCmd);
        expect(start.ok, start.ok ? '' : `startDialogue(${tree.id}) failed: ${JSON.stringify(start.error)}`).toBe(true);
        if (!start.ok) return;

        type Frame = { state: GameState; steps: number; path: number[] };
        const stack: Frame[] = [{ state: start.state, steps: 0, path: [] }];
        let visited = 0;
        // Conversations loop on purpose (ask, come back to the menu): a state already explored
        // (same node, same flags, same items) adds nothing, so each is walked once.
        const explored = new Set<string>();

        while (stack.length) {
          visited++;
          expect(visited, `seed ${seed}: more than ${MAX_VISITED_PER_TREE_SEED} dialogue states visited — possible loop or explosion`).toBeLessThanOrEqual(
            MAX_VISITED_PER_TREE_SEED,
          );
          const frame = stack.pop()!;
          const repro = () => `tree=${tree.id} seed=${seed} path=[${frame.path.join(',')}]`;
          expect(frame.steps, `${repro()}: did not terminate within ${MAX_STEPS_PER_BRANCH} steps`).toBeLessThan(MAX_STEPS_PER_BRANCH);

          const d = dialogueOf(frame.state);
          if (!d) continue; // Leaf: conversation already ended, nothing left on this branch.
          const key = `${d.nodeId}|${JSON.stringify(frame.state.flags)}|${JSON.stringify(frame.state.systems.inventory ?? {})}|${JSON.stringify(Object.values(frame.state.entities).map((e) => [e.id, e.controllerId, e.factionId]))}`;
          if (explored.has(key)) continue;
          explored.add(key);

          const node = tree.nodes[d.nodeId];
          expect(node, `${repro()}: conversation points at missing node "${d.nodeId}"`).toBeDefined();

          const indices: number[] = node!.choices?.length ? dialogueChoices(dnd5e, frame.state, tree).filter((c) => c.available).map((c) => c.index) : [0];

          for (const index of indices) {
            const chooseCmd: ChooseOptionCommand = { type: 'chooseOption', issuer: SYSTEM_ISSUER, index };
            let result: ReturnType<typeof engine.apply>;
            expect(() => {
              result = engine.apply(frame.state, chooseCmd);
            }, `${repro()} + chooseOption(${index}) threw`).not.toThrow();
            expect(result!.ok, result!.ok ? '' : `${repro()} + chooseOption(${index}) failed: ${JSON.stringify((result! as { error: unknown }).error)}`).toBe(
              true,
            );
            if (!result!.ok) continue;
            stack.push({ state: result!.state, steps: frame.steps + 1, path: [...frame.path, index] });
          }
        }
      });
    }
  }

  // --- Critical story flags (content/intereses/flags.json, written on branch `guion`) ---
  const flagsPath = join(import.meta.dirname, '..', '..', 'content', 'intereses', 'flags.json');
  const hasFlags = existsSync(flagsPath);

  (hasFlags ? it : it.skip)('every critical flag is reachable through at least one dialogue without any check or roll', () => {
    const raw = JSON.parse(readFileSync(flagsPath, 'utf8')) as Record<string, unknown>;
    // Tolerant of a couple of plausible shapes until the writer agent's schema is confirmed:
    // either an array of critical flag names, or a map of flag -> { critical: true, ... }.
    const critical: string[] = Array.isArray(raw)
      ? raw.map(String)
      : Object.entries(raw)
          .filter(([, v]) => typeof v === 'object' && v !== null && (v as Record<string, unknown>).critical === true)
          .map(([k]) => k);
    expect(critical.length, 'flags.json exists but no critical flag could be identified — harness may need updating for its schema').toBeGreaterThan(0);

    // A setFlag effect is "checkless" if it sits on a node entered unconditionally, or on a
    // choice with no `when` and no `check`. We only need existence of *one* such path per flag.
    const checklessSetters = new Set<string>();
    for (const tree of Object.values(trees) as DialogueTree[]) {
      for (const node of Object.values(tree.nodes)) {
        for (const e of node.effects ?? []) if (e.type === 'setFlag') checklessSetters.add(String(e.flag));
        for (const c of node.choices ?? []) {
          if (c.when || c.check) continue;
          for (const e of c.effects ?? []) if (e.type === 'setFlag') checklessSetters.add(String(e.flag));
        }
      }
    }
    for (const flag of critical) {
      expect(checklessSetters.has(flag), `critical flag "${flag}" is only ever set behind a check/condition — a single failed roll must never gate the plot`).toBe(
        true,
      );
    }
  });
});
