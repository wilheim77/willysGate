import { describe, expect, it } from 'vitest';
import type { Entity, GameState } from '../../engine';
import { createMonster } from '../../rulesets/dnd5e';
import { rollLoot } from '../../rulesets/dnd5e/loot';
import { ITEMS } from '../../rulesets/dnd5e/data';

/**
 * Balance check for the drop tables (rulesets/dnd5e/data/loot.json): over a typical run of
 * the act's golden path (docs/ENCOUNTERS.md's "total de un recorrido típico" - camino,
 * barranco, mineros, callejón, Escorial, D1 (asalto), túnel, andamios, Galería Sellada,
 * jefe), the brief asks for "roughly 1-2 magic items... plus a few potions" - not zero,
 * and not a magic shop.
 *
 * Loot is deterministic per (state.seed, corpse id) - see loot.ts - so this doesn't need to
 * run combat at all: it only has to build the same monster roster the golden path actually
 * kills and roll it under many different seeds.
 */

// One instance per monster the golden path kills on a normal, non-excluded route (see
// docs/ENCOUNTERS.md's table): camino's two fights, barranco (optional but usually taken),
// callejón, Escorial (fought, not talked down), D1 via the Cuadrilla assault, the tunnel
// route into the mine, the scaffolds, the Sealed Gallery ambush, and Brea's boss fight.
const GOLDEN_PATH_ROSTER: [monsterId: string, count: number][] = [
  ['mastiff', 2],
  ['giant_rat', 1], // camino: perros carroñeros
  ['bandit', 3],
  ['thug', 1], // camino: mineros hambrientos
  ['wolf', 4], // barranco (optional side fight)
  ['thug', 2],
  ['bandit', 2], // callejón: cobradores de Lisandro
  ['veteran', 1],
  ['bandit', 4],
  ['thug', 1], // escorial: los Sinpaga
  ['guard', 4],
  ['knight', 1], // abadia D1: asalto con la Cuadrilla
  ['zombie', 3],
  ['giant_rat', 2],
  ['skeleton', 2], // tunel: callados del túnel
  ['zombie', 3],
  ['ghoul', 1], // mina: andamios
  ['zombie', 2],
  ['ghoul', 1], // mina: Galería Sellada (tras D2)
  ['gladiator', 1],
  ['thug', 1],
  ['zombie', 3],
  ['ghoul', 1], // boveda: Brea (jefe)
];

function buildCorpses(): Entity[] {
  const corpses: Entity[] = [];
  let n = 0;
  for (const [monsterId, count] of GOLDEN_PATH_ROSTER) {
    for (let i = 0; i < count; i++) {
      corpses.push(createMonster({ id: `corpse-${n++}`, monsterId, controllerId: 'ai', factionId: 'enemigos', position: { x: 0, y: 0 }, spriteId: 'none' }));
    }
  }
  return corpses;
}

const MAGIC_KINDS = new Set(['weapon', 'armor', 'ring', 'cloak', 'wand', 'scroll']);
const isMagic = (item: string) => MAGIC_KINDS.has(ITEMS[item]?.kind ?? '');
const isPotion = (item: string) => ITEMS[item]?.kind === 'potion';

function runsFor(seeds: number[]): { magic: number; potions: number }[] {
  const corpses = buildCorpses();
  return seeds.map((seed) => {
    const state = { seed } as GameState;
    const { effects } = rollLoot(state, corpses);
    let magic = 0;
    let potions = 0;
    for (const e of effects) {
      if (e.type !== 'giveItem') continue;
      if (isMagic(e.item)) magic += e.count;
      else if (isPotion(e.item)) potions += e.count;
    }
    return { magic, potions };
  });
}

describe('loot balance over the golden path', () => {
  const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
  const runs = runsFor(SEEDS);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it('averages roughly 1-2 magic items per run ("modesto": not zero, not a magic shop)', () => {
    const magicAvg = avg(runs.map((r) => r.magic));
    expect(magicAvg).toBeGreaterThan(0.4);
    expect(magicAvg).toBeLessThan(3);
  });

  it('averages a handful of potions per run, not zero and not dozens', () => {
    const potionAvg = avg(runs.map((r) => r.potions));
    expect(potionAvg).toBeGreaterThan(1);
    expect(potionAvg).toBeLessThan(15);
  });

  it('never gives zero magic items on every single seed (the leaders/boss odds aren\'t zero)', () => {
    expect(runs.some((r) => r.magic > 0)).toBe(true);
  });

  it('beasts (mastiff, giant_rat, wolf) never drop magic gear', () => {
    const beasts = [
      createMonster({ id: 'b1', monsterId: 'mastiff', controllerId: 'ai', factionId: 'enemigos', position: { x: 0, y: 0 }, spriteId: 'none' }),
      createMonster({ id: 'b2', monsterId: 'giant_rat', controllerId: 'ai', factionId: 'enemigos', position: { x: 0, y: 0 }, spriteId: 'none' }),
      createMonster({ id: 'b3', monsterId: 'wolf', controllerId: 'ai', factionId: 'enemigos', position: { x: 0, y: 0 }, spriteId: 'none' }),
    ];
    for (const seed of SEEDS) {
      const { effects } = rollLoot({ seed } as GameState, beasts);
      expect(effects.every((e) => e.type === 'giveItem' && !isMagic(e.item))).toBe(true);
    }
  });

  it('a bandit (a minion, not a spellcaster) never drops a scroll', () => {
    const bandit = createMonster({ id: 'c1', monsterId: 'bandit', controllerId: 'ai', factionId: 'enemigos', position: { x: 0, y: 0 }, spriteId: 'none' });
    for (const seed of SEEDS) {
      const { effects } = rollLoot({ seed } as GameState, [bandit]);
      expect(effects.every((e) => e.type === 'giveItem' && ITEMS[e.item]?.kind !== 'scroll')).toBe(true);
    }
  });

  it('the same corpse id always drops the same loot for the same game seed (deterministic, no hidden Math.random)', () => {
    const corpses = buildCorpses();
    const a = rollLoot({ seed: 42 } as GameState, corpses);
    const b = rollLoot({ seed: 42 } as GameState, corpses);
    expect(a.effects).toEqual(b.effects);
  });

  it('looting again is a no-op (onCombatEnd tags the corpse "looted" so it never re-rolls)', () => {
    // Covered functionally in index.ts's onCombatEnd (the `looted` tag filter); here we just
    // confirm rollLoot itself is pure and doesn't need that guard to behave once per corpse -
    // the guard lives in index.ts because the same corpse can appear in a later fight's
    // state.entities (it doesn't disappear), not because rollLoot would roll twice on its own.
    const one = createMonster({ id: 'd1', monsterId: 'veteran', controllerId: 'ai', factionId: 'enemigos', position: { x: 0, y: 0 }, spriteId: 'none' });
    const first = rollLoot({ seed: 7 } as GameState, [one]);
    const second = rollLoot({ seed: 7 } as GameState, [one]);
    expect(first.effects).toEqual(second.effects);
  });
});
