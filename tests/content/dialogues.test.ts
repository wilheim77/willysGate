import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type DialogueNode, type DialogueTree, type DialogueWhen, createEngine, nextTargets } from '../../engine';
import { createCharacter, dnd5e } from '../../rulesets/dnd5e';
import { asciiMap } from '../fixtures/helpers';

/** Every dialogue of every 5e game must be walkable: links resolve, rules and checks exist. */
const contentDir = join(import.meta.dirname, '..', '..', 'content');
const games = ['intereses'];

describe('dialogue content', () => {
  const engine = createEngine(dnd5e, 'test');
  const hero = createCharacter({ id: 'hero', name: 'hero', controllerId: 'player:1', factionId: 'party', position: { x: 0, y: 0 }, spriteId: 'hero', classId: 'fighter', raceId: 'human', level: 3, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
  const state = engine.newGame({ seed: 1, map: asciiMap(['.']), entities: [hero] });
  const rules = (c: DialogueWhen): string[] =>
    'all' in c ? c.all.flatMap(rules) : 'any' in c ? c.any.flatMap(rules) : 'not' in c ? rules(c.not) : 'rule' in c ? [c.rule] : [];

  for (const gameId of games) {
    const dir = join(contentDir, gameId, 'dialogues');
    const items = JSON.parse(readFileSync(join(contentDir, gameId, 'items.json'), 'utf8')) as Record<string, unknown>;
    const itemsIn = (x: unknown): string[] => {
      if (!x || typeof x !== 'object') return [];
      const o = x as Record<string, unknown>;
      const own = typeof o.item === 'string' ? [o.item] : [];
      return [...own, ...Object.values(o).flatMap(itemsIn)];
    };
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const tree = JSON.parse(readFileSync(join(dir, file), 'utf8')) as DialogueTree;
      it(`${gameId}/${file} is consistent`, () => {
        expect(`${tree.id}.json`).toBe(file);
        for (const item of itemsIn(tree.nodes)) expect(items[item], `item "${item}" missing from items.json`).toBeDefined();
        expect(tree.nodes[tree.start]).toBeDefined();
        for (const [id, node] of Object.entries(tree.nodes)) {
          const links = [...nextTargets(node.next), ...(node.choices ?? []).flatMap((c) => [c.next, c.check?.success, c.check?.failure])].filter((x): x is string => !!x);
          for (const l of links) expect(tree.nodes[l], `${id} -> ${l}`).toBeDefined();
          // No softlocks: a node with choices always offers one with no condition and no roll.
          if (node.choices?.length) {
            expect(node.choices.some((c) => !c.when && !c.check && !c.once), `${id}: needs an always-available, repeatable choice without a check`).toBe(true);
          }
          for (const c of node.choices ?? []) {
            for (const r of c.when ? rules(c.when) : []) expect(dnd5e.dialogueConditions[r], `${id}: rule ${r}`).toBeDefined();
            if (c.check) expect(() => dnd5e.describeCheck!(state, { actorId: 'hero', check: c.check!.check, target: c.check!.dc }), `${id}: check ${c.check.check}`).not.toThrow();
          }
        }
        // Every node can reach the end of the conversation.
        // Only through choices that are always offered (no `when`), so a closed door can't hide the exit.
        // A conditional next always has a way out when its last branch has no condition.
        const endsHere = (n: DialogueNode) => !n.choices?.length && (n.next === undefined || (Array.isArray(n.next) && n.next.some((b) => !b.next)));
        const ends = new Set(Object.entries(tree.nodes).filter(([, n]) => endsHere(n) || n.choices?.some((c) => !c.next && !c.check && !c.when)).map(([k]) => k));
        let grew = true;
        while (grew) {
          grew = false;
          for (const [k, n] of Object.entries(tree.nodes)) {
            if (ends.has(k)) continue;
            const outs = [...(Array.isArray(n.next) ? n.next.filter((b) => !b.when).flatMap((b) => (b.next ? [b.next] : [])) : nextTargets(n.next)), ...(n.choices ?? []).filter((c) => !c.when).flatMap((c) => [c.next, c.check?.success, c.check?.failure])].filter((x): x is string => !!x);
            if (outs.some((o) => ends.has(o))) {
              ends.add(k);
              grew = true;
            }
          }
        }
        for (const k of Object.keys(tree.nodes)) expect(ends.has(k), `${k} can never reach an end`).toBe(true);
      });
    }
  }
});
