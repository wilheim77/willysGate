import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, createEngine, dialogueOf, inventoriesOf, tileAt } from '../../engine';
import { willy } from '../../rulesets/willy';
import { DIALOGUES } from '../../content/willy/dialogues';
import { maps, newWillyGame } from '../../content/willy/setup';
import { announce } from '../../content/willy/announce';

const engine = createEngine(willy, 'willy-chests', { dialogues: DIALOGUES, maps });

describe('Willy: chests on a floor', () => {
  it('tapping a chest opens it: an item into the bag, tokens, the chest goes, and it is announced', () => {
    for (const seed of [2, 5, 9]) {
      let s: GameState = newWillyGame(engine, seed, { start: 'planta-3' });
      const chest = Object.values(s.entities).find((e) => e.tags.includes('cofre'))!;
      expect(chest.tags).toContain('dialogue:cofre');
      const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: chest.position.x + dx!, y: chest.position.y + dy! })).find((p) => tileAt(s.map, p)?.walkable && !Object.values(s.entities).some((e) => e.position.x === p.x && e.position.y === p.y))!;
      s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, position: spot } } };
      const bagBefore = Object.values(inventoriesOf(s).party ?? {}).reduce((a, b) => a + b, 0);
      const chipsBefore = s.entities.willy!.resources.fichas?.current ?? 0;
      const r = engine.apply(s, { type: 'interact', issuer: 'player:1', entityId: 'willy', targetId: chest.id } as BaseCommand);
      if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
      const opened = r.events.find((e) => e.type === 'chestOpened');
      expect(opened, `seed ${seed}`).toBeDefined();
      expect(r.state.entities[chest.id]).toBeUndefined();
      const bagAfter = Object.values(inventoriesOf(r.state).party ?? {}).reduce((a, b) => a + b, 0);
      expect(bagAfter + (r.state.entities.willy!.resources.fichas?.current ?? 0)).toBeGreaterThan(bagBefore + chipsBefore);
      expect(announce(opened!, r.state)?.text).toMatch(/^Caja de botín: /);
      // The little conversation closes like any other.
      let after = r.state;
      for (let i = 0; i < 3 && dialogueOf(after); i++) {
        const c = engine.apply(after, { type: 'chooseOption', issuer: 'player:1', index: 0 } as BaseCommand);
        if (!c.ok) throw new Error(c.error.code);
        after = c.state;
      }
      expect(dialogueOf(after)).toBeFalsy();
    }
  });
});
