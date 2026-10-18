import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, type GameState, OBJECT_TAG, SYSTEM_ISSUER, createEngine, dialogueOf } from '../../engine';
import { willy } from '../../rulesets/willy';
import { createWilly } from '../../rulesets/willy';
import { eventViews, matchPattern, sponsorData, sponsorsOf } from '../../rulesets/willy/show';
import { traitsAfterCommand } from '../../rulesets/willy/traits';
import '../../content/willy/show';
import { DIALOGUES } from '../../content/willy/dialogues';
import { generateRival, rivalEntity } from '../../content/willy/gen/rivals';

/**
 * Coordinator follow-up: the rival encounter must give sponsors (Mamá Clementina) something to
 * react to, and the Influencer's "Necesita likes" needs a trigger that can actually happen.
 */

const engine = createEngine(willy, 'willy-test', { dialogues: DIALOGUES });

function freshGame(partner: Entity): GameState {
  const player = createWilly({ id: 'willy', controllerId: 'player:1', factionId: 'concursantes', position: { x: 1, y: 1 }, spriteId: 'willy', classId: 'butanero' });
  const s = engine.newGame({ seed: 1, map: { id: 'm', width: 5, height: 5, tiles: Array.from({ length: 25 }, () => ({ terrain: 'suelo', height: 0, walkable: true })) }, entities: [player, { ...partner, position: { x: 1, y: 2 } }] });
  return { ...s, systems: { ...s.systems, rivals: [{ id: partner.id, planta: 1, ranura: 0, plantas: [1] }] as unknown as never } };
}

describe('rival encounter reaches sponsors (Mamá Clementina) through npcHelped and "amable"', () => {
  it('letting a rival go raises Clementina\'s affinity', () => {
    const p = generateRival(9, 1, 0);
    const rival = rivalEntity(p, 1, { x: 1, y: 2 });
    let s = freshGame({ ...rival, tags: [...rival.tags, 'dialogue:rivalEncuentro'] });
    const started = engine.apply(s, { type: 'interact', issuer: 'player:1', entityId: 'willy', targetId: rival.id } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    const before = sponsorsOf(started.state)?.porId.clementina?.afinidad ?? 0;
    const r = engine.apply(started.state, { type: 'chooseOption', issuer: 'player:1', index: 2 } as BaseCommand);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.events.some((e) => e.type === 'npcHelped')).toBe(true);
    expect(r.events.some((e) => e.type === 'dialogueChoice' && (e as unknown as { tags?: string[] }).tags?.includes('amable'))).toBe(true);
    const after = sponsorsOf(r.state)?.porId.clementina?.afinidad ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it('eventViews renders a dialogueChoice\'s own tags as "etiquetas", what sponsors.json matches on', () => {
    const views = eventViews([{ type: 'dialogueChoice', treeId: 'rivalEncuentro', nodeId: 'inicio', index: 2, tags: ['amable'] } as never], {
      entities: {},
    } as unknown as GameState);
    const v = views.find((x) => x.evento === 'dialogueChoice')!;
    expect(v).toMatchObject({ etiquetas: ['amable'] });
    const clementina = sponsorData('clementina')!;
    expect(clementina.gusta.some((g) => matchPattern(v, g.patron))).toBe(true);
  });

  it('visiting the Camerino matches Clementina\'s new "safeZoneEntered" taste', () => {
    const clementina = sponsorData('clementina')!;
    const view = { evento: 'safeZoneEntered', zona: 'camerino', planta: 2 };
    expect(clementina.gusta.some((g) => matchPattern(view, g.patron))).toBe(true);
  });
});

describe('Influencer "Necesita likes": triggers on a stalled audience, not an impossible floor minimum', () => {
  const influencer = (): Entity => ({
    ...createWilly({ id: 'willy', controllerId: 'player:1', factionId: 'concursantes', position: { x: 0, y: 0 }, spriteId: 'willy', classId: 'influencer' }),
  });

  it('applies "mareado" when the audience loses to boredom or monotony', () => {
    const state = { entities: { willy: influencer() } } as unknown as GameState;
    const out = traitsAfterCommand(willy, state, [{ type: 'audienceChanged', causa: 'aburrimiento' } as never], { state: {} } as never);
    expect(out.effects).toEqual([{ type: 'applyCondition', entityId: 'willy', condition: 'mareado', remainingTurns: 2 }]);
  });

  it('does nothing for an unrelated audienceChanged, or for a class other than Influencer', () => {
    const state = { entities: { willy: influencer() } } as unknown as GameState;
    const out = traitsAfterCommand(willy, state, [{ type: 'audienceChanged', causa: 'eliminar' } as never], { state: {} } as never);
    expect(out.effects).toEqual([]);
    const other = { entities: { willy: createWilly({ id: 'willy', controllerId: 'player:1', factionId: 'concursantes', position: { x: 0, y: 0 }, spriteId: 'willy', classId: 'butanero' }) } } as unknown as GameState;
    const out2 = traitsAfterCommand(willy, other, [{ type: 'audienceChanged', causa: 'aburrimiento' } as never], { state: {} } as never);
    expect(out2.effects).toEqual([]);
  });

  it('never fires for "the audience below the floor minimum", because design made that impossible', () => {
    // Nothing to trigger on: there is no audienceChanged causa for "below the floor minimum" at
    // all (docs/willy/DESIGN.md §12 — the audience never drops under it). Only a real,
    // already-firing causa (aburrimiento/monotonia) can apply the condition.
    const state = { entities: { willy: influencer() } } as unknown as GameState;
    const out = traitsAfterCommand(willy, state, [], { state: {} } as never);
    expect(out.effects).toEqual([]);
  });
});
