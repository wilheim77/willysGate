import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, SYSTEM_ISSUER, nextAiCommand } from '../../engine';
import { createCreature, willy } from '../../rulesets/willy';
import { MONSTER_ABILITIES } from '../../rulesets/willy/monsters';
import { W, engine, game } from './willy-helpers';

/**
 * The enemy AI actually uses each special ability: in a small arena (Willy and a mate a few
 * tiles away, a hurt ally of the monster nearby), within its first turn it picks `mon:<id>`.
 */

const monster = (id: string, abilities: string[], x: number, y: number): Entity => {
  const e = createCreature({ id, name: id, controllerId: 'ai', factionId: 'monstruos', position: { x, y }, spriteId: 'x', vida: 30, def: 10, ataque: 4, dano: '1d4', movimiento: 4, tags: abilities.map((a) => `habilidad:${a}`) });
  return { ...e, resources: { ...e.resources, energia: { current: 9, max: 9 } } };
};

function arena(abilityId: string, seed: number): GameState {
  const hurt = createCreature({ id: 'amigo', name: 'amigo', controllerId: 'ai', factionId: 'monstruos', position: { x: 0, y: 3 }, spriteId: 'x', vida: 30, def: 10, ataque: 2, dano: '1d4', movimiento: 4 });
  let s = game([monster('m', [abilityId], 1, 1), W('w', 'butanero', 4, 1), W('w2', 'mimo', 4, 2), { ...hurt, resources: { ...hurt.resources, vida: { current: 8, max: 30 } } }], ['........', '........', '........', '........', '........']);
  s = { ...s, rng: { ...s.rng, a: (s.rng.a + seed * 977) >>> 0 } };
  const st = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['m', 'w', 'w2', 'amigo'] } as BaseCommand);
  if (!st.ok) throw new Error(st.error.message);
  return { ...st.state, turn: { ...st.state.turn, activeEntityId: 'm', activeIndex: st.state.turn.order.indexOf('m') } };
}

/** The actions the monster takes in its turn (up to a few commands). */
function turnOf(s: GameState): string[] {
  const used: string[] = [];
  let cur = s;
  for (let i = 0; i < 5; i++) {
    const cmd = nextAiCommand(willy, cur, 'm') as BaseCommand & { actionId?: string };
    if (cmd.type === 'endTurn') break;
    if (cmd.type === 'act') used.push(cmd.actionId!);
    const r = engine.apply(cur, cmd);
    if (!r.ok) break;
    cur = r.state;
    if (cur.turn.activeEntityId !== 'm') break;
  }
  return used;
}

describe('Willy: the enemy AI uses its abilities', () => {
  for (const id of Object.keys(MONSTER_ABILITIES)) {
    it(`${id}`, () => {
      const turns = [1, 2, 3].map((seed) => turnOf(arena(id, seed)));
      expect(turns.some((t) => t.includes(`mon:${id}`)), `${id}: ${JSON.stringify(turns)}`).toBe(true);
    });
  }

  it('a healer heals a hurt friend rather than just hitting', () => {
    expect(turnOf(arena('lodo-curativo', 1))).toContain('mon:lodo-curativo');
  });
});
