import { describe, expect, it } from 'vitest';
import {
  SYSTEM_ISSUER,
  blockedTiles,
  dialogueChoices,
  dialogueOf,
  reachableTiles,
  trapsOf,
  type BaseCommand,
  type GameState,
} from '../../engine';
import { dnd5e } from '../../rulesets/dnd5e';
import { buildWorld, makeEngine, PARTY_IDS } from './setup';

/**
 * Random exploration fuzz: move/interact/disarm sequences outside combat, driven by a
 * fully seeded PRNG local to the test (distinct from the game's own RNG) so a failure is
 * reproducible from (worldSeed, fuzzSeed) alone. Checks no exceptions and no stuck states:
 * a dialogue open with no available choice, or the whole party unable to move anywhere.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Heavy run: `QA_DEEP=1 npm run test:qa`. Plain `npm test`/`npm run check` only runs a
// light smoke pass so the regular dev loop stays fast.
const DEEP = process.env.QA_DEEP === '1';
const WORLD_SEEDS = DEEP ? [1, 2, 3, 4, 5] : [1];
const FUZZ_SEEDS = DEEP ? [101, 202, 303] : [101];
const STEPS = DEEP ? 80 : 40;

/** True when the party has nowhere to go: every standing party member's own tile is the
 *  only tile it can reach. (Exploration movement budget is unlimited, so this should
 *  essentially never trip unless something walled someone in.) */
function partyStuck(state: GameState): boolean {
  return PARTY_IDS.every((id) => {
    const e = state.entities[id];
    if (!e || !dnd5e.isStanding(e) || !dnd5e.canAct(e)) return true; // can't act anyway, doesn't count against "stuck"
    const blocked = blockedTiles(dnd5e, state, id);
    const reachable = reachableTiles(state.map, e.position, 1000, { blocked, rules: dnd5e.movement });
    return reachable.size <= 1;
  });
}

describe('exploration fuzz', () => {
  const engine = makeEngine();

  for (const worldSeed of WORLD_SEEDS) {
    for (const fuzzSeed of FUZZ_SEEDS) {
      it(`random move/interact/disarm sequence stays sane (world ${worldSeed}, fuzz ${fuzzSeed})`, () => {
        const rand = mulberry32(fuzzSeed);
        let state = buildWorld(engine, worldSeed);
        const log: string[] = [];
        const repro = () => `world=${worldSeed} fuzz=${fuzzSeed} log=[${log.join(' | ')}]`;

        for (let step = 0; step < STEPS; step++) {
          const d = dialogueOf(state);
          if (d) {
            const tree = engine.content.dialogues[d.treeId];
            expect(tree, `${repro()}: active dialogue points at unknown tree "${d.treeId}"`).toBeDefined();
            const choices = dialogueChoices(dnd5e, state, tree!);
            const available = choices.filter((c) => c.available);
            const node = tree!.nodes[d.nodeId];
            const canContinue = !node?.choices?.length;
            expect(canContinue || available.length > 0, `${repro()}: dialogue open with no available choice (softlock)`).toBe(true);
            const index = canContinue ? 0 : available[Math.floor(rand() * available.length)]!.index;
            const cmd: BaseCommand = { type: 'chooseOption', issuer: SYSTEM_ISSUER, index } as never;
            log.push(`chooseOption(${index})`);
            let result: ReturnType<typeof engine.apply>;
            expect(() => (result = engine.apply(state, cmd)), `${repro()}: chooseOption threw`).not.toThrow();
            expect(result!.ok, result!.ok ? '' : `${repro()}: chooseOption failed: ${JSON.stringify((result! as { error: unknown }).error)}`).toBe(true);
            if (result!.ok) state = result!.state;
            continue;
          }

          if (state.turn.mode === 'combat') break; // a scripted dialogue effect may start a fight; let the soak test cover combat.
          expect(partyStuck(state), `${repro()}: the whole party is stuck (no reachable tile besides its own)`).toBe(false);

          const standingParty = PARTY_IDS.filter((id) => state.entities[id] && dnd5e.isStanding(state.entities[id]!) && dnd5e.canAct(state.entities[id]!));
          if (standingParty.length === 0) break;
          const actorId = standingParty[Math.floor(rand() * standingParty.length)]!;
          const actor = state.entities[actorId]!;

          const roll = rand();
          let cmd: BaseCommand | null = null;
          if (roll < 0.1) {
            // Try to disarm a nearby known, armed trap.
            const trap = trapsOf(state).find((t) => !t.hidden && t.armed && t.disarm);
            if (trap) {
              cmd = { type: 'disarmTrap', issuer: actor.controllerId, entityId: actorId, trapId: trap.id } as never;
              log.push(`disarmTrap(${actorId}, ${trap.id})`);
            }
          } else if (roll < 0.4) {
            // Try to interact with the nearest "dialogue:" tagged entity.
            const targets = Object.values(state.entities).filter((e) => e.id !== actorId && e.tags.some((t) => t.startsWith('dialogue:')));
            const target = targets.sort((a, b) => Math.abs(a.position.x - actor.position.x) + Math.abs(a.position.y - actor.position.y) - (Math.abs(b.position.x - actor.position.x) + Math.abs(b.position.y - actor.position.y)))[0];
            if (target) {
              cmd = { type: 'interact', issuer: actor.controllerId, entityId: actorId, targetId: target.id } as never;
              log.push(`interact(${actorId} -> ${target.id})`);
            }
          }
          if (!cmd) {
            const dx = Math.floor(rand() * 7) - 3;
            const dy = Math.floor(rand() * 7) - 3;
            const to = { x: actor.position.x + dx, y: actor.position.y + dy };
            cmd = { type: 'move', issuer: actor.controllerId, entityId: actorId, to } as never;
            log.push(`move(${actorId} -> ${to.x},${to.y})`);
          }

          let result: ReturnType<typeof engine.apply>;
          expect(() => (result = engine.apply(state, cmd!)), `${repro()}: command threw`).not.toThrow();
          // A rejected command (out of range, no path...) is an expected outcome of random
          // fuzzing, not a bug — only a thrown exception or a stuck state is.
          if (result!.ok) state = result!.state;
        }
      });
    }
  }
});
