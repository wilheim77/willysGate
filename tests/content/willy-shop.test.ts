import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, SYSTEM_ISSUER, createEngine, dialogueChoices, dialogueOf, itemCount } from '../../engine';
import { willy } from '../../rulesets/willy';
import { DIALOGUES } from '../../content/willy/dialogues';
import { applyCasting, maps, newWillyGame } from '../../content/willy/setup';

const engine = createEngine(willy, 'willy-shop', { dialogues: DIALOGUES, maps });
const tree = DIALOGUES.maripuri!;

function withChips(s: GameState, n: number): GameState {
  const w = s.entities.willy!;
  return { ...s, entities: { ...s.entities, willy: { ...w, resources: { ...w.resources, fichas: { current: n, max: Math.max(n, w.resources.fichas?.max ?? 0) } } } } };
}

function talk(s: GameState): GameState {
  const r = engine.apply(s, { type: 'startDialogue', issuer: SYSTEM_ISSUER, treeId: 'maripuri', actorId: 'willy', partnerId: 'maripuri' } as BaseCommand);
  if (!r.ok) throw new Error(r.error.code);
  return r.state;
}

function pick(s: GameState, id: string): GameState {
  const node = tree.nodes[dialogueOf(s)!.nodeId]!;
  const index = node.choices!.findIndex((c) => c.id === id);
  expect(index, id).toBeGreaterThanOrEqual(0);
  const r = engine.apply(s, { type: 'chooseOption', issuer: 'player:1', index } as BaseCommand);
  if (!r.ok) throw new Error(`${id}: ${r.error.code}`);
  return r.state;
}

const offered = (s: GameState) => dialogueChoices(willy, s, tree).filter((c) => c.available).map((c) => tree.nodes[dialogueOf(s)!.nodeId]!.choices![c.index]!.id);

describe('Willy: Ultramarinos Maripuri (first version)', () => {
  it('buys a consumable for tokens, once per Camerino, and only what Willy can pay', () => {
    let s = withChips(applyCasting(newWillyGame(engine, 3), { clase: 'butanero', puntos: {} }), 30);
    s = pick(talk(s), 'comprar');
    expect(offered(s)).toContain('comprar-tirita-de-dibujos');
    const before = itemCount(s, 'party', 'tirita-de-dibujos');
    s = pick(s, 'comprar-tirita-de-dibujos');
    expect(s.entities.willy!.resources.fichas!.current).toBe(20);
    expect(itemCount(s, 'party', 'tirita-de-dibujos')).toBe(before + 1);
    // Sold out here; and 20 tokens don't reach the gaseosa (25).
    expect(offered(s)).not.toContain('comprar-tirita-de-dibujos');
    expect(offered(s)).not.toContain('comprar-gaseosa-la-revoltosa');
    expect(offered(s)).toContain('nada');
    s = pick(s, 'nada');
    expect(dialogueOf(s)!.nodeId).toBe('hola');
  });

  it('with no tokens the shelf still shows its prices, says it is out of reach, and lets you leave', () => {
    let s = withChips(applyCasting(newWillyGame(engine, 3), { clase: 'butanero', puntos: {} }), 0);
    s = pick(talk(s), 'comprar');
    const choices = offered(s);
    expect(choices).toContain('nada');
    expect(choices.filter((c) => !!c?.startsWith('nollega-')).length).toBe(5);
    expect(choices.some((c) => !!c?.startsWith('comprar-'))).toBe(false);
    s = pick(s, 'nollega-pincho-de-tortilla');
    expect(offered(s)).toContain('nada');
  });
});
