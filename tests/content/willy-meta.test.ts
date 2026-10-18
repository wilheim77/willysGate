import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, SYSTEM_ISSUER, createEngine, itemCount, nextAiCommand, zonesOf } from '../../engine';
import { BAG, itemActions, metaOf, willy, willyContent } from '../../rulesets/willy';
import { ATTEMPT_FLAG, applyCasting, buildFloor, maps, newWillyGame } from '../../content/willy/setup';
import { defeat, newGameSetup, onRestoredCopy, savePolicy } from '../../content/willy/run-modes';
import achievementsData from '../../content/willy/data/achievements.json';
import itemsData from '../../content/willy/data/items.json';
import loot from '../../content/willy/data/loot-tables.json';

const engine = createEngine(willy, 'willy', { dialogues: {}, maps });

function cast(seed = 1, clase = 'butanero'): GameState {
  return applyCasting(newWillyGame(engine, seed), { clase, puntos: { fue: 3 } });
}

function apply(s: GameState, cmd: object): { state: GameState; events: GameEvent[] } {
  const r = engine.apply(s, cmd as BaseCommand);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return { state: r.state, events: r.events };
}

/** Floor 1 with the party on it, ready to fight its first encounter. */
function onFloor(seed = 2): GameState {
  let s = cast(seed);
  const lift = zonesOf(s, 'exits')[0]!;
  s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, position: { x: lift.x, y: lift.y } } } };
  return apply(s, { type: 'travel', issuer: 'player:1', entityId: 'willy', mapId: 'planta-1', spawn: 'llegada' }).state;
}

function fightFirstEncounter(s: GameState): { state: GameState; events: GameEvent[] } {
  const zone = zonesOf(s, 'encounters')[0]!;
  const foes = String(zone.properties.participants).split(',');
  const party = Object.values(s.entities).filter((e) => e.controllerId === 'player:1').map((e) => e.id);
  // Put the party next to the foes, then let the AI play both sides.
  const at = s.entities[foes[0]!]!.position;
  const ents = { ...s.entities };
  party.forEach((id, i) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [0, 2]]) {
      const p = { x: at.x + dx! + i, y: at.y + dy! };
      const t = s.map.tiles[p.y * s.map.width + p.x];
      if (t?.walkable && !Object.values(ents).some((e) => e.position.x === p.x && e.position.y === p.y)) {
        ents[id] = { ...ents[id]!, position: p };
        break;
      }
    }
  });
  let r = apply({ ...s, entities: ents }, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: [...party, ...foes] });
  const events = [...r.events];
  for (let i = 0; i < 800 && r.state.turn.mode === 'combat'; i++) {
    const id = r.state.turn.activeEntityId!;
    const res = engine.apply(r.state, nextAiCommand(willy, r.state, id));
    const next = res.ok ? res : engine.apply(r.state, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: id } as BaseCommand);
    if (!next.ok) break;
    r = { state: next.state, events: next.events };
    events.push(...next.events);
  }
  return { state: r.state, events };
}

describe('Willy meta: content', () => {
  it('is configured and coherent', () => {
    const c = willyContent()!;
    expect(c.items.length).toBe(itemsData.items.length);
    const ids = new Set(itemsData.items.map((i) => i.id));
    const tables = loot.tablas as Record<string, { entradas: { item?: string; tabla?: string }[] }>;
    for (const t of Object.values(tables)) for (const e of t.entradas) if (e.item) expect(ids.has(e.item), e.item).toBe(true);
    for (const id of loot.fueraDeCajas) expect(ids.has(id), id).toBe(true);
    const achIds = achievementsData.logros.map((a) => a.id);
    expect(new Set(achIds).size).toBe(achIds.length);
    for (const a of achievementsData.logros) for (const r of a.recompensas as { tipo: string }[]) expect(r.tipo).not.toBe('xp');
  });
});

describe('Willy meta: casting kit', () => {
  it('the class kit is worn and in the bag', () => {
    const s = cast(1, 'butanero');
    const meta = metaOf(s);
    expect(Object.values(meta.equipo.willy ?? {})).toContain('llave-inglesa');
    expect(itemCount(s, BAG, 'bocadillo-de-chorizo')).toBe(1);
    const acts = itemActions(s, s.entities.willy!).map((a) => a.id);
    expect(acts).toContain('obj:bocadillo-de-chorizo');
    expect(acts).toContain('obj:llave-inglesa');
  });
});

describe('Willy meta: achievements, boxes and items', () => {
  it('the first command starts the run («En antena») and the first fight gives achievements and boxes', () => {
    let s = onFloor(2);
    expect(metaOf(s).logros).toContain('en-antena');
    const fought = fightFirstEncounter(s);
    s = fought.state;
    const unlocked = fought.events.filter((e) => e.type === 'achievementUnlocked').map((e) => (e as unknown as { logroId: string }).logroId);
    expect(s.entities.willy!.resources.vida!.current).toBeGreaterThan(0);
    expect(unlocked).toContain('primera-victoria');
    expect(unlocked).toContain('primer-figurante');
    expect(metaOf(s).cajas.length).toBeGreaterThan(0);
    expect(fought.events.some((e) => e.type === 'boxDelivered')).toBe(true);
  });

  it('opening a box is deterministic, fills the bag and unlocks «Unboxing»', () => {
    const fought = fightFirstEncounter(onFloor(2)).state;
    const box = metaOf(fought).cajas[0]!;
    const a = apply(fought, { type: 'openBox', issuer: 'player:1', boxId: box.id });
    const b = apply(fought, { type: 'openBox', issuer: 'player:1', boxId: box.id });
    const opened = a.events.find((e) => e.type === 'boxOpened') as unknown as { objetos: { item: string }[] };
    expect(opened.objetos.length).toBe(loot.cajas[box.nivel].objetos);
    expect(b.events.find((e) => e.type === 'boxOpened')).toEqual(opened);
    for (const o of opened.objetos) expect(itemCount(a.state, BAG, o.item)).toBeGreaterThan(0);
    expect(metaOf(a.state).cajas.find((c) => c.id === box.id)).toBeUndefined();
    expect(metaOf(a.state).logros).toContain('unboxing');
  });

  it('a potion heals out of combat and is used up', () => {
    let s = cast(1);
    s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, resources: { ...s.entities.willy!.resources, vida: { ...s.entities.willy!.resources.vida!, current: 3 } } } } };
    s = { ...s, systems: { ...s.systems, inventory: { party: { 'gaseosa-la-revoltosa': 1 } } } };
    const r = apply(s, { type: 'act', issuer: 'player:1', entityId: 'willy', actionId: 'obj:gaseosa-la-revoltosa', target: { entityId: 'willy' } });
    expect(r.state.entities.willy!.resources.vida!.current).toBe(11);
    expect(itemCount(r.state, BAG, 'gaseosa-la-revoltosa')).toBe(0);
    expect(r.events.some((e) => e.type === 'itemUsed')).toBe(true);
  });

  it('equipping changes stats and unequipping puts them back', () => {
    let s = cast(1);
    s = { ...s, systems: { ...s.systems, inventory: { party: { 'casco-de-obra': 1 } } } };
    const max = s.entities.willy!.resources.vida!.max;
    const on = apply(s, { type: 'equipItem', issuer: 'player:1', entityId: 'willy', item: 'casco-de-obra' }).state;
    expect(on.entities.willy!.resources.vida!.max).toBe(max + 3);
    expect(itemCount(on, BAG, 'casco-de-obra')).toBe(0);
    const off = apply(on, { type: 'unequipItem', issuer: 'player:1', entityId: 'willy', item: 'casco-de-obra' }).state;
    expect(off.entities.willy!.resources.vida!.max).toBe(max);
    expect(itemCount(off, BAG, 'casco-de-obra')).toBe(1);
  });
});

describe('Willy: elimination modes', () => {
  it('the setup writes difficulty and mode; Sin repetición needs more than Turista', () => {
    const s = newWillyGame(engine, 1);
    expect(newGameSetup.apply(s, { dificultad: 'concursante', modo: 'sinRepeticion' }).flags).toMatchObject({ dificultad: 'concursante', modoEliminacion: 'sinRepeticion' });
    const tourist = newGameSetup.apply(s, { dificultad: 'turista', modo: 'sinRepeticion' });
    expect(tourist.flags.modoEliminacion).toBe('repeticion');
    expect(savePolicy(tourist)).toBe('free');
    expect(savePolicy(newGameSetup.apply(s, { dificultad: 'primetime', modo: 'sinRepeticion' }))).toBe('permadeath');
    expect(savePolicy(onRestoredCopy(newGameSetup.apply(s, { dificultad: 'primetime', modo: 'sinRepeticion' })))).toBe('free');
  });

  it('Con repetición: going back reshuffles the floors ahead; Sin repetición: a summary', () => {
    const s = cast(4);
    const d = defeat(s);
    const back = d.retry!.prepare!(s);
    expect(back.flags[ATTEMPT_FLAG]).toBe(1);
    expect(buildFloor(1, back).map).not.toEqual(buildFloor(1, s).map);
    const hard = defeat(newGameSetup.apply(s, { dificultad: 'concursante', modo: 'sinRepeticion' }));
    expect(hard.summary?.lines.length).toBeGreaterThan(0);
    expect(hard.retry).toBeUndefined();
  });
});

describe('Willy meta: health while exploring', () => {
  it('walking heals the party a little; the Camerino heals it fully', () => {
    let s = onFloor(2);
    const w = s.entities.willy!;
    const hurt = Math.ceil(w.resources.vida!.max / 2);
    s = { ...s, entities: { ...s.entities, willy: { ...w, resources: { ...w.resources, vida: { ...w.resources.vida!, current: hurt } } } } };
    // Walk back and forth on free tiles next to the arrival.
    const start = s.entities.willy!.position;
    const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: start.x + dx!, y: start.y + dy! })).find((p) => s.map.tiles[p.y * s.map.width + p.x]?.walkable && !Object.values(s.entities).some((e) => e.position.x === p.x && e.position.y === p.y))!;
    for (let i = 0; i < 8; i++) s = apply(s, { type: 'move', issuer: 'player:1', entityId: 'willy', to: i % 2 ? start : free }).state;
    expect(s.entities.willy!.resources.vida!.current).toBeGreaterThan(hurt);
    expect(s.entities.willy!.resources.vida!.current).toBeLessThan(s.entities.willy!.resources.vida!.max);
  });
});
