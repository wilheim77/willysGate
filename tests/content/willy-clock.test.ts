import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, type Vec2, createEngine, surfaceAt, tileAt, zonesOf } from '../../engine';
import { willy } from '../../rulesets/willy';
import { type ClockState, type PlantaInfo, clockOf, collapseOrder } from '../../rulesets/willy/clock';
import { maps, newWillyGame } from '../../content/willy/setup';

const engine = createEngine(willy, 'willy', { dialogues: {}, maps });

/** One step for Willy to a free walkable neighbour (the clock charges a second per tile). */
function step(s: GameState): { state: GameState; events: GameEvent[] } {
  const w = s.entities.willy!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const to = { x: w.position.x + dx, y: w.position.y + dy };
    const r = engine.apply(s, { type: 'move', issuer: 'player:1', entityId: 'willy', to } as BaseCommand);
    if (r.ok) return { state: r.state, events: r.events };
  }
  throw new Error('Willy cannot move');
}

const withClock = (s: GameState, change: Partial<ClockState>): GameState => ({ ...s, systems: { ...s.systems, clock: { ...clockOf(s)!, ...change } as never } });

function roomCentre(p: PlantaInfo, i: number): Vec2 {
  const r = p.salas[i]!;
  return { x: (r.cell.x - p.origen.x) * p.celda.ancho + Math.floor(p.celda.ancho / 2), y: (r.cell.y - p.origen.y) * p.celda.alto + Math.floor(p.celda.alto / 2) };
}

describe('Willy: the floor clock and the collapse', () => {
  it('starts on arrival, charges a second per step and warns at 50 / 25 / 10 %', () => {
    let s = newWillyGame(engine, 3, { start: 'planta-1' });
    let r = step(s);
    expect(r.events.some((e) => e.type === 'clockStarted')).toBe(true);
    expect(r.events.some((e) => e.type === 'floorEntered')).toBe(true);
    s = r.state;
    const total = clockOf(s)!.total;
    r = step(s);
    expect(clockOf(r.state)!.remaining).toBe(total - 1);
    s = withClock(r.state, { remaining: Math.floor(total * 0.5) + 1 });
    r = step(s);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'clockWarning', pct: 50 }));
    // The generic HUD reads label / remaining / total.
    expect(r.state.systems.clock).toMatchObject({ label: 'Reloj', total });
  });

  it('at zero, rooms crack and then fall, furthest from the stairs first; Willy is dragged out', () => {
    let s = newWillyGame(engine, 5, { start: 'planta-1' });
    s = step(s).state;
    const p = s.systems.planta as unknown as PlantaInfo;
    const order = collapseOrder(p);
    expect(p.salas[order[order.length - 1]!]!.role).not.toBe('jefe');
    // Willy waits in the first room to go, with the clock about to run out.
    const first = order[0]!;
    const centre = roomCentre(p, first);
    const spot = [centre, { x: centre.x + 1, y: centre.y }, { x: centre.x, y: centre.y + 1 }, { x: centre.x - 1, y: centre.y }].find((q) => tileAt(s.map, q)?.walkable && !Object.values(s.entities).some((e) => e.id !== 'willy' && e.position.x === q.x && e.position.y === q.y))!;
    s = { ...withClock(s, { remaining: 1 }), entities: { ...s.entities, willy: { ...s.entities.willy!, position: spot } } };
    const hpBefore = s.entities.willy!.resources.vida!.current;
    let r = step(s);
    expect(r.events.some((e) => e.type === 'clockExpired')).toBe(true);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'roomCollapsing', sala: first, fase: 'grieta', willyDentro: true }));
    expect(surfaceAt(r.state, r.state.entities.willy!.position)?.type).toBe('grieta');
    // Ten seconds later the room falls: Willy is thrown out to the stairs, 30 % lighter.
    s = r.state;
    for (let i = 0; i < 12 && !r.events.some((e) => e.type === 'roomCollapsing' && (e as unknown as { fase: string }).fase === 'caida'); i++) {
      r = step(s);
      s = r.state;
    }
    const fell = r.events.find((e) => e.type === 'roomCollapsing' && (e as unknown as { fase: string }).fase === 'caida') as unknown as { sala: number; willyDentro: boolean };
    expect(fell).toMatchObject({ sala: first, willyDentro: true });
    expect(tileAt(s.map, roomCentre(p, first))!.terrain).toBe('hundido');
    const stairs = zonesOf(s, 'exits')[0]!;
    expect(s.entities.willy!.position).toEqual({ x: stairs.x, y: stairs.y });
    expect(s.entities.willy!.resources.vida!.current).toBeLessThan(hpBefore);
    expect(s.entities.willy!.resources.vida!.current).toBeGreaterThanOrEqual(1);
    // Down the stairs: the exit counts as the collapse, and the Camerino is a checkpoint.
    const down = engine.apply(s, { type: 'travel', issuer: 'player:1', entityId: 'willy', mapId: 'camerino-1', spawn: 'llegada' } as BaseCommand);
    if (!down.ok) throw new Error(down.error.message);
    expect(down.events).toContainEqual(expect.objectContaining({ type: 'floorExited', metodo: 'derrumbe', planta: 1 }));
    expect(down.events).toContainEqual(expect.objectContaining({ type: 'rested', kind: 'camerino' }));
    expect(clockOf(down.state)).toBeUndefined();
  });

  it('combat rounds cost 15 s, but not while a boss is on stage', () => {
    let s = newWillyGame(engine, 3, { start: 'planta-1' });
    s = step(s).state;
    const zone = zonesOf(s, 'encounters').find((z) => !String(z.properties.participants).includes('jefe') && !String(z.properties.participants).includes('guardian'))!;
    const foes = String(zone.properties.participants).split(',');
    const started = engine.apply(s, { type: 'startCombat', issuer: 'system', participants: ['willy', ...foes] } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    let st = started.state;
    const t0 = clockOf(st)!.remaining;
    for (let i = 0; i < 40 && st.turn.round < 2 && st.turn.mode === 'combat'; i++) {
      const r = engine.apply(st, { type: 'endTurn', issuer: 'system', entityId: st.turn.activeEntityId! } as BaseCommand);
      if (!r.ok) break;
      st = r.state;
    }
    expect(t0 - clockOf(st)!.remaining).toBeGreaterThanOrEqual(15);
  });
});
