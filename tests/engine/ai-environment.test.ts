import { describe, expect, it } from 'vitest';
import { type Entity, type GameState, SYSTEM_ISSUER, createEngine, nextAiCommand, withTraps } from '../../engine';
import { createCharacter, createMonster, createProp, dnd5e } from '../../rulesets/dnd5e';
import { createCreature, createWilly, willy } from '../../rulesets/willy';
import { asciiMap } from '../fixtures/helpers';

/**
 * The generic AI uses the environment when the ruleset's previews say it pays: it breaks a
 * barrel next to a pack of foes (collateral), shoves foes into traps and pits, and keeps away
 * from barrels itself (dangerAt). Checked under both rulesets.
 */

function start(engine: ReturnType<typeof createEngine>, entities: Entity[], rows: string[], first: string): GameState {
  const s = engine.newGame({ seed: 5, map: asciiMap(rows), entities });
  const fighters = entities.filter((e) => !e.tags.includes('object')).map((e) => e.id);
  const r = engine.apply(s, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: fighters } as never);
  if (!r.ok) throw new Error(r.error.code);
  const order = [first, ...r.state.turn.order.filter((id) => id !== first)];
  return { ...r.state, turn: { ...r.state.turn, order, activeEntityId: first, movementUsed: 0 } };
}

describe('AI and the environment: dnd5e', () => {
  const engine = createEngine(dnd5e, 'ai-env');
  const ABILITIES = { str: 16, dex: 16, con: 14, int: 10, wis: 12, cha: 8 };
  const archer = (x: number, y: number) =>
    createCharacter({ id: 'archer', name: 'archer', controllerId: 'player:1', factionId: 'party', position: { x, y }, spriteId: 'hero', classId: 'rogue', raceId: 'human', level: 3, abilities: { ...ABILITIES } });
  const thug = (id: string, x: number, y: number) => createMonster({ id, monsterId: 'thug', controllerId: 'ai', factionId: 'sinpaga', position: { x, y }, spriteId: 'thug' });

  it('shoots the oil barrel when it would burn several foes', () => {
    const barrel = createProp({ id: 'barrel', kind: 'barrel_oil', position: { x: 6, y: 1 } });
    const s = start(engine, [archer(0, 1), thug('t1', 5, 1), thug('t2', 7, 1), thug('t3', 6, 2), barrel], ['........', '........', '........'], 'archer');
    const ranged = dnd5e.listActions(s, 'archer').find((a) => a.id.startsWith('attack:') && a.tags.includes('ranged'))!;
    const p = dnd5e.previewAction(s, 'archer', ranged.id, { entityId: 'barrel' });
    expect(p.collateral?.length).toBe(3);
    const cmd = nextAiCommand(dnd5e, s, 'archer') as { type: string; target?: { entityId?: string } };
    expect(cmd).toMatchObject({ type: 'act', target: { entityId: 'barrel' } });
  });

  it('a shove onto an armed trap is worth its damage', () => {
    const s0 = start(engine, [archer(0, 0), thug('t1', 1, 0)], ['....'], 'archer');
    const plain = dnd5e.previewAction(s0, 'archer', 'basic:shove', { entityId: 't1' }).expectedDamage ?? 0;
    const s = withTraps(s0, [{ id: 'spikes', tiles: [{ x: 2, y: 0 }], hidden: false, armed: true, params: { damage: '2d6' } }]);
    expect(dnd5e.previewAction(s, 'archer', 'basic:shove', { entityId: 't1' }).expectedDamage ?? 0).toBeGreaterThan(plain + 2);
  });

  it('reports the danger of standing next to an oil barrel', () => {
    const barrel = createProp({ id: 'barrel', kind: 'barrel_oil', position: { x: 2, y: 0 } });
    const s = start(engine, [archer(0, 0), thug('t1', 5, 0), barrel], ['......'], 'archer');
    expect(dnd5e.dangerAt!(s, 'archer', { x: 1, y: 0 })).toBeGreaterThan(0);
    expect(dnd5e.dangerAt!(s, 'archer', { x: 5, y: 0 })).toBe(0);
  });
});

describe('AI and the environment: Willy', () => {
  const engine = createEngine(willy, 'ai-env-willy');
  const rat = (id: string, x: number, y: number) =>
    createCreature({ id, name: 'Rata', controllerId: 'ai', factionId: 'monstruos', position: { x, y }, spriteId: 'rata-portuaria', vida: 12, def: 10, ataque: 2, dano: '1d4', movimiento: 5 });
  const gas = (x: number, y: number): Entity => ({
    id: 'gas',
    name: 'Barril de gas',
    controllerId: 'none',
    factionId: 'escenario',
    position: { x, y },
    spriteId: 'barril-explosivo',
    stats: { fue: 99, agi: 0, man: 0, agu: 99, car: 0, sue: 0, nivel: 1, armadura: 0 },
    resources: { vida: { current: 6, max: 6 } },
    conditions: [],
    tags: ['object', 'obstacle', 'explosivo', 'redondo'],
  });

  it('throws the ball at the gas barrel in the middle of the rats', () => {
    const w = createWilly({ id: 'w', controllerId: 'player:1', factionId: 'concursantes', position: { x: 0, y: 1 }, spriteId: 'willy', classId: 'jugador-de-basket' });
    const s = start(engine, [w, rat('r1', 5, 1), rat('r2', 4, 0), rat('r3', 4, 2), gas(4, 1)], ['......', '......', '......'], 'w');
    const p = willy.previewAction(s, 'w', 'hab:pase-picado', { entityId: 'gas' });
    expect(p.collateral?.length).toBe(3);
    const cmd = nextAiCommand(willy, s, 'w') as { type: string; target?: { entityId?: string } };
    expect(cmd).toMatchObject({ type: 'act', target: { entityId: 'gas' } });
  });

  it('a shove onto an armed trap is worth its damage', () => {
    const w = createWilly({ id: 'w', controllerId: 'player:1', factionId: 'concursantes', position: { x: 0, y: 0 }, spriteId: 'willy', classId: 'butanero' });
    const s0 = start(engine, [w, rat('r1', 1, 0)], ['....'], 'w');
    const plain = willy.previewAction(s0, 'w', 'basic:empujar', { entityId: 'r1' }).expectedDamage ?? 0;
    const s = withTraps(s0, [{ id: 'anzuelo', tiles: [{ x: 2, y: 0 }], hidden: false, armed: true, params: { dano: '2d6' } }]);
    expect(willy.previewAction(s, 'w', 'basic:empujar', { entityId: 'r1' }).expectedDamage ?? 0).toBeGreaterThan(plain + 2);
  });

  it('reports the danger of standing next to a gas barrel', () => {
    const w = createWilly({ id: 'w', controllerId: 'player:1', factionId: 'concursantes', position: { x: 0, y: 0 }, spriteId: 'willy', classId: 'butanero' });
    const s = start(engine, [w, rat('r1', 5, 0), gas(2, 0)], ['......'], 'w');
    expect(willy.dangerAt!(s, 'w', { x: 1, y: 0 })).toBeGreaterThan(0);
    expect(willy.dangerAt!(s, 'w', { x: 4, y: 0 })).toBe(0);
  });
});
