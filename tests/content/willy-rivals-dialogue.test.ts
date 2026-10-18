import { describe, expect, it } from 'vitest';
import { type BaseCommand, type Entity, SYSTEM_ISSUER, createEngine, dialogueOf, nextTargets, resolveDc, tagValue } from '../../engine';
import { willy } from '../../rulesets/willy';
import { createWilly } from '../../rulesets/willy';
import { DIALOGUES } from '../../content/willy/dialogues';
import legendaries from '../../content/willy/data/rivals.json';
import { generateRival, legendaryById, legendaryEntity, openingLine, rivalEntity, traicionChance } from '../../content/willy/gen/rivals';

/**
 * The rival encounter dialogue (docs/willy/DESIGN.md §17): templated, reused for every
 * procedurally generated or legendary rival. See content/willy/dialogues/rival-encuentro.json.
 */

const TREE = DIALOGUES.rivalEncuentro!;
const engine = createEngine(willy, 'willy-test', { dialogues: DIALOGUES });

function withTag(e: Entity, prefix: string, value: string): Entity {
  return { ...e, tags: [...e.tags.filter((t) => !t.startsWith(`${prefix}:`)), `${prefix}:${value}`] };
}

function freshGame(partner: Entity): ReturnType<typeof engine.newGame> {
  const player = createWilly({ id: 'willy', controllerId: 'player:1', factionId: 'concursantes', position: { x: 1, y: 1 }, spriteId: 'willy', classId: 'butanero' });
  const s = engine.newGame({ seed: 1, map: { id: 'm', width: 5, height: 5, tiles: Array.from({ length: 25 }, () => ({ terrain: 'suelo', height: 0, walkable: true })) }, entities: [player, { ...partner, position: { x: 1, y: 2 } }] });
  // As floor.ts does for every rival room: a record in systems.rivals before Willy ever meets it.
  return { ...s, systems: { ...s.systems, rivals: [{ id: partner.id, planta: 1, ranura: 0, plantas: [1] }] as unknown as never } };
}

describe('rival encounter dialogue: tags', () => {
  it('every generated rival gets non-empty, fully resolved lines and a pact DC', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (let floor = 1; floor <= 10; floor += 3) {
        const p = generateRival(seed, floor, 0);
        const e = rivalEntity(p, floor, { x: 0, y: 0 });
        for (const key of ['dlg-inicio', 'dlg-amenaza', 'dlg-pacto', 'dlg-huida', 'dlg-derrota']) {
          const v = tagValue(e, key);
          expect(v, `${key} for ${p.id}`).toBeTruthy();
          expect(v, `${key} unresolved template`).not.toMatch(/[{}]/);
        }
        expect(Number(tagValue(e, 'pacto'))).toBe(p.pactoDif);
      }
    }
  });

  it('every legendary gets the same dialogue tags', () => {
    for (const l of legendaries.legendarios) {
      const e = legendaryEntity(l, 1, { x: 0, y: 0 });
      for (const key of ['dlg-inicio', 'dlg-amenaza', 'dlg-pacto', 'dlg-huida', 'dlg-derrota']) {
        expect(tagValue(e, key), `${key} for ${l.id}`).toBeTruthy();
      }
      expect(Number(tagValue(e, 'pacto'))).toBeGreaterThan(0);
    }
  });

  it('a rival returning after fleeing opens with a different line than a fresh encounter', () => {
    const p = generateRival(7, 3, 1);
    expect(openingLine(p, 'vueltaHuida')).not.toBe(openingLine(p, 'presentacion'));
    const fresh = rivalEntity(p, 3, { x: 0, y: 0 });
    const back = rivalEntity(p, 3, { x: 0, y: 0 }, 'vueltaHuida');
    expect(tagValue(back, 'dlg-inicio')).not.toBe(tagValue(fresh, 'dlg-inicio'));
  });

  it('only tramposos can betray a pact', () => {
    expect(traicionChance('tramposo')).toBeGreaterThan(0);
    for (const id of ['agresivo', 'codicioso', 'cobarde', 'aliable', 'fanfarron']) expect(traicionChance(id)).toBe(0);
  });
});

describe('rival encounter dialogue: structure', () => {
  it('is reachable and ends cleanly from every node, offering all three designed outcomes', () => {
    const outcomeEffects = (nodeId: string) => (TREE.nodes[nodeId]?.effects ?? []).map((e) => (e as { type: string }).type);
    // Derrotar: a startCombat effect from the first node.
    expect(TREE.nodes.inicio!.choices!.some((c) => (c.effects ?? []).some((e) => (e as { type: string }).type === 'startCombat'))).toBe(true);
    // Pactar: both branches of the check lead somewhere, and success records the pact.
    const pactar = TREE.nodes.inicio!.choices!.find((c) => c.check)!;
    expect(outcomeEffects(pactar.check!.success)).toContain('setSystem');
    expect(TREE.nodes[pactar.check!.failure]).toBeDefined();
    // Dejar ir: reachable straight from the first node, and records huida.
    const dejar = TREE.nodes.inicio!.choices!.find((c) => c.next && !c.check)!;
    expect(outcomeEffects(dejar.next!)).toContain('setSystem');

    // No dead ends: every node reaches an end (a node that stops, or a choice with no check/when).
    const endsHere = (id: string) => {
      const n = TREE.nodes[id]!;
      return !n.choices?.length || n.choices.some((c) => !c.check && !c.when);
    };
    const ends = new Set(Object.keys(TREE.nodes).filter(endsHere));
    let grew = true;
    while (grew) {
      grew = false;
      for (const [id, n] of Object.entries(TREE.nodes)) {
        if (ends.has(id)) continue;
        const outs = [...nextTargets(n.next), ...(n.choices ?? []).flatMap((c) => [c.next, c.check?.success, c.check?.failure])].filter((x): x is string => !!x);
        if (outs.some((o) => ends.has(o))) {
          ends.add(id);
          grew = true;
        }
      }
    }
    expect(ends.size).toBe(Object.keys(TREE.nodes).length);
  });
});

describe('rival encounter dialogue: play', () => {
  it('Derrotar starts a fight against the rival', () => {
    const p = generateRival(2, 1, 0);
    const rival = rivalEntity(p, 1, { x: 1, y: 2 }, 'presentacion');
    let s = freshGame({ ...rival, tags: [...rival.tags, 'dialogue:rivalEncuentro'] });
    const started = engine.apply(s, { type: 'interact', issuer: 'player:1', entityId: 'willy', targetId: rival.id } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    expect(dialogueOf(started.state)?.treeId).toBe('rivalEncuentro');
    expect(dialogueOf(started.state)?.partnerId).toBe(rival.id);
    const fought = engine.apply(started.state, { type: 'chooseOption', issuer: 'player:1', index: 0 } as BaseCommand);
    if (!fought.ok) throw new Error(fought.error.message);
    expect(fought.state.turn.mode).toBe('combat');
    expect(dialogueOf(fought.state)).toBeNull();
  });

  it('Dejar ir lets the rival go and records "huida"', () => {
    const p = generateRival(3, 1, 0);
    const rival = rivalEntity(p, 1, { x: 1, y: 2 }, 'presentacion');
    let s = freshGame({ ...rival, tags: [...rival.tags, 'dialogue:rivalEncuentro'] });
    const started = engine.apply(s, { type: 'interact', issuer: 'player:1', entityId: 'willy', targetId: rival.id } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    const dejarIndex = started.ok ? 2 : 0;
    const r = engine.apply(started.state, { type: 'chooseOption', issuer: 'player:1', index: dejarIndex } as BaseCommand);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.entities[rival.id]).toBeUndefined();
    expect((r.state.systems.rivals as unknown as { id: string; desenlace?: string }[])?.find((x) => x.id === rival.id)?.desenlace).toBe('huida');
    expect(started.events.some((e) => e.type === 'rivalEncountered' && (e as unknown as { evento: string }).evento === 'presentacion')).toBe(true);
    expect(r.events.some((e) => e.type === 'rivalEncountered' && (e as unknown as { evento: string }).evento === 'huida')).toBe(true);
    // One more "Continuar" (the final node has no choices) closes the conversation.
    expect(dialogueOf(r.state)?.nodeId).toBe('huidaOk');
    const closed = engine.apply(r.state, { type: 'chooseOption', issuer: 'player:1', index: 0 } as BaseCommand);
    if (!closed.ok) throw new Error(closed.error.message);
    expect(dialogueOf(closed.state)).toBeNull();
  });

  it('Pactar succeeds against an easy DC: the rival leaves peacefully and Willy gets fichas', () => {
    const p = generateRival(4, 1, 0);
    const easy = withTag(rivalEntity(p, 1, { x: 1, y: 2 }, 'presentacion'), 'pacto', '1');
    let s = freshGame({ ...easy, tags: [...easy.tags, 'dialogue:rivalEncuentro'] });
    const started = engine.apply(s, { type: 'interact', issuer: 'player:1', entityId: 'willy', targetId: easy.id } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    expect(resolveDc(started.state, easy.id, { partnerTag: 'pacto' })).toBe(1);
    const before = started.state.entities.willy!.resources.fichas!.current;
    const r = engine.apply(started.state, { type: 'chooseOption', issuer: 'player:1', index: 1 } as BaseCommand);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.entities[easy.id]).toBeUndefined();
    expect(r.state.entities.willy!.resources.fichas!.current).toBeGreaterThan(before);
    expect(dialogueOf(r.state)?.nodeId).toBe('pactoExito');
  });

  it('Pactar fails against an impossible DC, but Willy can still fight or let the rival go', () => {
    const p = generateRival(5, 1, 0);
    const hard = withTag(rivalEntity(p, 1, { x: 1, y: 2 }, 'presentacion'), 'pacto', '99');
    let s = freshGame({ ...hard, tags: [...hard.tags, 'dialogue:rivalEncuentro'] });
    const started = engine.apply(s, { type: 'interact', issuer: 'player:1', entityId: 'willy', targetId: hard.id } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    const r = engine.apply(started.state, { type: 'chooseOption', issuer: 'player:1', index: 1 } as BaseCommand);
    if (!r.ok) throw new Error(r.error.message);
    expect(dialogueOf(r.state)?.nodeId).toBe('pactoFallo');
    expect(r.state.entities[hard.id]).toBeDefined();
    const fought = engine.apply(r.state, { type: 'chooseOption', issuer: 'player:1', index: 0 } as BaseCommand);
    if (!fought.ok) throw new Error(fought.error.message);
    expect(fought.state.turn.mode).toBe('combat');
  });
});

describe('rival encounter dialogue: legendaries', () => {
  it('legendaryById finds every legendary used by the generator', () => {
    for (const l of legendaries.legendarios) expect(legendaryById(l.id)?.id).toBe(l.id);
  });
});
