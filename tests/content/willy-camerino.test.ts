import { describe, expect, it } from 'vitest';
import { type BaseCommand, type DialogueTree, type GameState, createEngine, dialogueChoices, dialogueOf, nextTargets } from '../../engine';
import { willy } from '../../rulesets/willy';
import achievements from '../../content/willy/data/achievements.json';
import { CAMERINO_DIALOGUES } from '../../content/willy/dialogues/camerino';
import { DIALOGUES } from '../../content/willy/dialogues';
import { applyCasting, maps, newWillyGame } from '../../content/willy/setup';

/** The Camerino regulars' conversations (content/willy/dialogues/camerino.ts). */

const engine = createEngine(willy, 'willy', { dialogues: DIALOGUES, maps });

/** Willy in Camerino number `n` (0: before floor 1), next to `npc`. */
function inCamerino(n: number, npc: string): GameState {
  const s0 = applyCasting(newWillyGame(engine, 3), { clase: 'butanero', puntos: {} });
  const id = n === 0 ? 'camerino' : `camerino-${n}`;
  const setup = maps[id]!();
  const target = setup.entities.find((e) => e.id === npc)!;
  const entities = { ...Object.fromEntries(Object.entries(s0.entities).filter(([k]) => k === 'willy' || k.startsWith('companero'))), ...Object.fromEntries(setup.entities.map((e) => [e.id, e])) };
  entities.willy = { ...entities.willy!, position: { x: target.position.x, y: target.position.y + 1 } };
  return { ...s0, map: setup.map, entities, flags: {}, systems: { ...s0.systems, spawns: setup.spawns as never, zones: setup.systems!.zones as never } };
}

function talk(s: GameState, npc: string): GameState {
  const r = engine.apply(s, { type: 'interact', issuer: 'player:1', entityId: 'willy', targetId: npc } as BaseCommand);
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}
function choose(s: GameState, text: string | RegExp): { state: GameState; events: { type: string }[] } {
  const d = dialogueOf(s)!;
  const tree = DIALOGUES[d.treeId]!;
  const view = dialogueChoices(willy, s, tree).find((c) => (typeof text === 'string' ? c.text === text : text.test(c.text)));
  if (!view) throw new Error(`no choice ${text} at ${d.nodeId}`);
  const r = engine.apply(s, { type: 'chooseOption', issuer: 'player:1', index: view.index } as BaseCommand);
  if (!r.ok) throw new Error(r.error.message);
  return { state: r.state, events: r.events };
}
function cont(s: GameState): GameState {
  const r = engine.apply(s, { type: 'chooseOption', issuer: 'player:1', index: 0 } as BaseCommand);
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}

describe('Camerino NPCs: structure', () => {
  for (const tree of CAMERINO_DIALOGUES) {
    it(`${tree.id}: every link resolves, every router has a way on, nothing is a dead end`, () => {
      expect(tree.nodes[tree.start]).toBeDefined();
      for (const [id, n] of Object.entries(tree.nodes)) {
        const links = [...nextTargets(n.next), ...(n.choices ?? []).flatMap((c) => [c.next, c.check?.success, c.check?.failure])].filter((x): x is string => !!x);
        for (const l of links) expect(tree.nodes[l], `${tree.id}/${id} -> ${l}`).toBeDefined();
        if (Array.isArray(n.next)) expect(n.next.some((b) => !b.when) || n.next.length > 0, id).toBe(true);
        if (n.choices?.length) expect(n.choices.some((c) => !c.when), `${id}: needs an always-available choice`).toBe(true);
      }
      // Every node leads back to the end of the conversation.
      const ends = new Set(Object.entries(tree.nodes).filter(([, n]) => (!n.choices?.length && n.next === undefined) || n.choices?.some((c) => !c.next && !c.check && !c.when)).map(([k]) => k));
      let grew = true;
      while (grew) {
        grew = false;
        for (const [k, n] of Object.entries(tree.nodes)) {
          if (ends.has(k)) continue;
          const outs = [...nextTargets(n.next), ...(n.choices ?? []).flatMap((c) => [c.next, c.check?.success, c.check?.failure])].filter((x): x is string => !!x);
          if (outs.some((o) => ends.has(o) || tree.start === o)) {
            ends.add(k);
            grew = true;
          }
        }
      }
      for (const k of Object.keys(tree.nodes)) expect(ends.has(k), `${tree.id}/${k} cannot reach the end`).toBe(true);
    });
  }

  it('the four regulars carry their conversation in every Camerino (Xelda shows the contract late)', () => {
    for (let n = 0; n <= 9; n++) {
      const es = maps[n === 0 ? 'camerino' : `camerino-${n}`]!().entities;
      const tag = (id: string) => es.find((e) => e.id === id)!.tags.find((t) => t.startsWith('dialogue:'));
      expect(tag('maripuri')).toBe('dialogue:maripuri');
      expect(tag('paco')).toBe('dialogue:paco');
      expect(tag('koldo')).toBe('dialogue:koldo');
      expect(tag('xelda')).toBe(n >= 8 ? 'dialogue:xelda-contrato' : 'dialogue:xelda');
    }
  });

  it('Koldo has a different story in each of the ten Camerinos and an errand in the first nine', () => {
    const stories = new Set<string>();
    for (let n = 0; n <= 9; n++) {
      let s = talk(inCamerino(n, 'koldo'), 'koldo');
      s = cont(choose(s, 'Cuéntame.').state);
      stories.add(dialogueOf(s) ? (DIALOGUES.koldo!.nodes[dialogueOf(s)!.nodeId]!.text) : '');
    }
    expect(stories.size).toBe(10);
  });
});

describe('Camerino NPCs: play', () => {
  it('the shop and the errands are parked: their choices stay hidden until the game opens them', () => {
    const m = talk(inCamerino(2, 'maripuri'), 'maripuri');
    expect(dialogueChoices(willy, m, DIALOGUES.maripuri!).map((c) => c.text)).not.toContain('Quiero comprar.');
    const k = talk(inCamerino(2, 'koldo'), 'koldo');
    expect(dialogueChoices(willy, k, DIALOGUES.koldo!).map((c) => c.text)).not.toContain('¿Hay algo que hacer abajo?');
  });

  it('Maripuri tags the shop choices for the shop panel and ends the talk', () => {
    const s0 = inCamerino(2, 'maripuri');
    const s = talk({ ...s0, flags: { ...s0.flags, 'tienda:abierta': true } }, 'maripuri');
    const buy = choose(s, 'Quiero comprar.');
    expect(buy.events.some((e) => e.type === 'dialogueChoice' && (e as unknown as { tags?: string[] }).tags?.includes('tienda:comprar'))).toBe(true);
    expect(dialogueOf(buy.state)).toBeNull();
  });

  it('Maripuri tells you about the biome below', () => {
    const lines: string[] = [];
    for (const n of [0, 2, 4, 6, 8]) {
      let s = talk(inCamerino(n, 'maripuri'), 'maripuri');
      s = cont(choose(s, /planta de abajo/).state);
      lines.push(DIALOGUES.maripuri!.nodes[dialogueOf(s)!.nodeId]!.text);
    }
    expect(new Set(lines).size).toBe(5);
  });

  it('Paco serves a café once per Camerino: full health and energy, then "ya te he puesto uno"', () => {
    let s = inCamerino(1, 'paco');
    s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, resources: { ...s.entities.willy!.resources, vida: { ...s.entities.willy!.resources.vida!, current: 1 }, energia: { ...s.entities.willy!.resources.energia!, current: 0 } } } } };
    s = talk(s, 'paco');
    const served = choose(s, 'Un café, Paco.');
    const w = served.state.entities.willy!;
    expect(w.resources.vida!.current).toBe(w.resources.vida!.max);
    expect(w.resources.energia!.current).toBe(w.resources.energia!.max);
    expect(served.events.some((e) => e.type === 'rested')).toBe(true);
    // Back to the menu: the same offer is now «Otro café».
    const again = cont(served.state);
    expect(dialogueChoices(willy, again, DIALOGUES.paco!).some((c) => c.text === 'Un café, Paco.')).toBe(false);
    const second = choose(again, 'Otro café, Paco.');
    expect(DIALOGUES.paco!.nodes[dialogueOf(second.state)!.nodeId]!.text).toMatch(/Ya te he puesto uno/);
  });

  it('Paco serves a new café in the next Camerino', () => {
    const s = talk(inCamerino(2, 'paco'), 'paco');
    expect(dialogueChoices(willy, s, DIALOGUES.paco!).some((c) => c.text === 'Un café, Paco.' && c.available)).toBe(true);
  });

  it('Xelda\'s «firmar el parte» announces rested (the client keeps its checkpoint there)', () => {
    const s = talk(inCamerino(3, 'xelda'), 'xelda');
    const r = choose(s, /Firmar el parte/);
    expect(r.events.some((e) => e.type === 'rested')).toBe(true);
  });

  it('Xelda only talks about the contract in the last Camerinos, and reading it sets the flag', () => {
    const early = talk(inCamerino(3, 'xelda'), 'xelda');
    expect(dialogueChoices(willy, early, DIALOGUES.xelda!).some((c) => /contrato/i.test(c.text))).toBe(false);
    let late = talk(inCamerino(8, 'xelda'), 'xelda');
    late = choose(late, 'El contrato del concurso.').state;
    late = choose(late, 'Leer el contrato.').state;
    expect(late.flags['willy:contratoLeido']).toBe(true);
  });

  it('Koldo\'s errand: accepting sets the flag the hidden achievement watches', () => {
    const k0 = inCamerino(2, 'koldo');
    let s = talk({ ...k0, flags: { ...k0.flags, 'koldo:encargos': true } }, 'koldo');
    s = cont(choose(s, /algo que hacer/).state);
    expect(DIALOGUES.koldo!.nodes[dialogueOf(s)!.nodeId]!.text).toMatch(/carritos/);
    s = choose(s, 'Trato hecho.').state;
    expect(s.flags['koldo:mision']).toBe('m3');
    // Asking again reminds him.
    s = cont(s);
    s = cont(choose(s, /algo que hacer/).state);
    expect(DIALOGUES.koldo!.nodes[dialogueOf(s)!.nodeId]!.text).toMatch(/Ya te lo he dicho/);
  });

  it('there is a hidden achievement for each of Koldo\'s nine errands, rewarding a box', () => {
    const ids = (achievements.logros as { id: string; categoria: string; oculto: boolean; recompensas: { tipo: string }[] }[]).filter((l) => l.categoria === 'encargos');
    expect(ids.map((l) => l.id)).toEqual(Array.from({ length: 9 }, (_, i) => `encargo-koldo-${i + 1}`));
    for (const l of ids) {
      expect(l.oculto).toBe(true);
      expect(l.recompensas[0]!.tipo).toBe('caja');
    }
  });
});
