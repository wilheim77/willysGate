import { type ActionOutcome, type Effect, type Entity, type GameEvent, type GameState, type JsonValue, type RngCursor, type Ruleset, type Vec2, hasTag, zonesOf } from '../../engine';
import { seasonDecided } from './ending';
import { tutorialUnlocked } from './tutorial';
import { difficultyOf } from './difficulty';
import { standing } from './resolve';

/**
 * «Reloj de planta» (docs/willy/DESIGN.md §4): every floor counts down in seconds of broadcast.
 * Walking costs a second per tile, each combat round 15 s (none while a boss is on stage), and
 * at 50 / 25 / 10 % the Narrador warns. At zero the floor comes down a room at a time, furthest
 * from the stairs first: the room cracks (surface 'grieta'), and 10 s later it falls (terrain
 * 'hundido'). Foes inside are gone (no experience); Willy and his companion are thrown out to the
 * stairs with 30 % less health (never below 1) and knocked down, and leave the floor.
 *
 * It runs after every command (Ruleset.afterCommand, through afterCommandHooks) and keeps its
 * numbers in `systems.clock`: { label, remaining, total } for the generic HUD, plus its own.
 * The floor's data comes from the generator (`systems.planta`). Events (for the Narrador, the
 * achievements and the show): floorEntered, clockStarted, clockWarning, clockExpired,
 * roomCollapsing, floorExited, safeZoneEntered and rested { kind: 'camerino' } (the client's
 * checkpoint).
 */

interface RoomInfo {
  cell: Vec2;
  role: string;
  links: ('N' | 'S' | 'E' | 'W')[];
}

export interface PlantaInfo {
  numero: number;
  nombre: string;
  mapa: string;
  salas: RoomInfo[];
  celda: { ancho: number; alto: number };
  origen: Vec2;
  reloj: { segundos: number; pasoExploracion: number; rondaCombate: number; avisos: number[]; pausaEnJefe: boolean; segundosPorSala: number };
}

export interface ClockState {
  label: string;
  remaining: number;
  total: number;
  /** Not shown (and not ticking) yet: the tutorial hasn't introduced it. */
  hidden?: boolean;
  /** Map the clock belongs to. */
  mapa: string;
  planta: number;
  ultimaRonda: number;
  avisados: number[];
  /** Seconds since it reached zero. */
  pasado: number;
  /** Rooms (indexes into planta.salas) cracked or fallen, in collapse order. */
  agrietadas: number[];
  caidas: number[];
  /** Willy was thrown out by the collapse (the exit counts as 'derrumbe'). */
  expulsado: boolean;
}

const DRAG_OUT = 0.3;

export function clockOf(state: GameState): ClockState | undefined {
  const c = state.systems.clock as unknown as ClockState | null | undefined;
  return c && c.mapa ? c : undefined;
}

function plantaOf(state: GameState): PlantaInfo | undefined {
  const p = state.systems.planta as unknown as PlantaInfo | undefined;
  return p && p.mapa === state.map.id && p.reloj ? p : undefined;
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const visitFlag = (mapa: string) => `willy:visitas:${mapa}`;

/** Rooms in collapse order: furthest from the boss room (where the stairs are) first; the boss room last. */
export function collapseOrder(p: PlantaInfo): number[] {
  const key = (v: Vec2) => `${v.x},${v.y}`;
  const index = new Map(p.salas.map((r, i) => [key(r.cell), i]));
  const start = p.salas.findIndex((r) => r.role === 'jefe');
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  const step: Record<string, Vec2> = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } };
  while (queue.length) {
    const i = queue.shift()!;
    for (const s of p.salas[i]!.links) {
      const j = index.get(key({ x: p.salas[i]!.cell.x + step[s]!.x, y: p.salas[i]!.cell.y + step[s]!.y }));
      if (j === undefined || dist.has(j)) continue;
      dist.set(j, dist.get(i)! + 1);
      queue.push(j);
    }
  }
  return p.salas.map((_, i) => i).filter((i) => i !== start).sort((a, b) => (dist.get(b) ?? 99) - (dist.get(a) ?? 99) || a - b);
}

function roomTiles(p: PlantaInfo, i: number): Vec2[] {
  const r = p.salas[i]!;
  const ox = (r.cell.x - p.origen.x) * p.celda.ancho;
  const oy = (r.cell.y - p.origen.y) * p.celda.alto;
  const out: Vec2[] = [];
  for (let y = 0; y < p.celda.alto; y++) for (let x = 0; x < p.celda.ancho; x++) out.push({ x: ox + x, y: oy + y });
  return out;
}

const inTiles = (tiles: Vec2[], e: Entity) => tiles.some((t) => t.x === e.position.x && t.y === e.position.y);
const isParty = (e: Entity) => e.controllerId.startsWith('player') && !hasTag(e, 'object');

/** Seconds this command cost: the leader's steps out of combat, new rounds in combat. */
function spent(state: GameState, clock: ClockState, events: GameEvent[], p: PlantaInfo): { seconds: number; ronda: number } {
  let seconds = 0;
  let ronda = clock.ultimaRonda;
  for (const e of events) {
    if (e.type === 'combatStarted') ronda = 0;
    if (e.type === 'entityMoved' && state.turn.mode !== 'combat') {
      const mover = state.entities[(e as unknown as { entityId: string }).entityId];
      if (mover && hasTag(mover, 'pc')) seconds += ((e as unknown as { path: Vec2[] }).path?.length ?? 0) * p.reloj.pasoExploracion;
    }
    // Opening a chest or talking to someone: 3 s (the Funcionario's opening hours: 1 s more).
    if (e.type === 'dialogueStarted' && state.turn.mode !== 'combat') {
      const who = state.entities[(e as unknown as { actorId: string }).actorId];
      seconds += 3 + (who && who.tags.includes('clase:funcionario') ? 1 : 0);
    }
    if (e.type === 'turnStarted') {
      const round = Number((e as unknown as { round?: number }).round ?? 0);
      if (round > ronda) {
        const bossOnStage = p.reloj.pausaEnJefe && state.turn.order.some((id) => state.entities[id] && hasTag(state.entities[id]!, 'jefe') && standing(state.entities[id]!));
        if (!bossOnStage) seconds += (round - ronda) * p.reloj.rondaCombate;
        ronda = round;
      }
    }
  }
  return { seconds, ronda };
}

export function clockAfterCommand(_ruleset: Ruleset, state: GameState, events: GameEvent[], _rng: RngCursor): ActionOutcome {
  const effects: Effect[] = [];
  const out: GameEvent[] = [];
  let clock = clockOf(state);
  const set = (c: ClockState | null) => effects.push({ type: 'setSystem', system: 'clock', value: c as unknown as JsonValue });

  // Arriving somewhere, or leaving a floor.
  const changed = events.find((e) => e.type === 'mapChanged') as unknown as { from: string; to: string } | undefined;
  if (changed) {
    if (clock && clock.mapa === changed.from) {
      out.push({ type: 'floorExited', metodo: clock.expulsado ? 'derrumbe' : 'escalera', reloj: mmss(Math.max(0, clock.remaining)), relojRestantePct: Math.round((100 * Math.max(0, clock.remaining)) / clock.total), planta: clock.planta } as GameEvent);
      clock = undefined;
      set(null);
    }
    if (changed.to.startsWith('camerino')) {
      out.push({ type: 'safeZoneEntered', zona: 'camerino', planta: Number(changed.to.split('-')[1] ?? 0) } as GameEvent);
      // The generic client keeps a checkpoint here: «Volver a intentarlo» brings you back to the last Camerino.
      out.push({ type: 'rested', kind: 'camerino' } as GameEvent);
    }
  }
  const p = plantaOf(state);
  if (!p) return { effects, events: out };
  // The final boss is down: the floor stays up for the ending.
  if (seasonDecided(state)) return { effects, events: out };
  if (!clock || clock.mapa !== state.map.id) {
    const visitas = Number(state.flags[visitFlag(p.mapa)] ?? 0) + 1;
    // Turista ×1,5, Prime time ×0,8 (difficulty.ts).
    const segundos = Math.round(p.reloj.segundos * difficultyOf(state).reloj);
    clock = { label: 'Reloj', remaining: segundos, total: segundos, mapa: p.mapa, planta: p.numero, ultimaRonda: 0, avisados: [], pasado: 0, agrietadas: [], caidas: [], expulsado: false };
    effects.push({ type: 'setFlag', flag: visitFlag(p.mapa), value: visitas });
    out.push({ type: 'floorEntered', planta: p.numero, nombrePlanta: p.nombre, visita: visitas } as GameEvent);
    out.push({ type: 'clockStarted', planta: p.numero, nombrePlanta: p.nombre, reloj: mmss(clock.remaining) } as GameEvent);
    set(clock);
    return { effects, events: out };
  }

  // The first floor's clock waits for the tutorial (tutorial.json → sistema.reloj): hidden, not ticking.
  const locked = !tutorialUnlocked(state, 'sistema.reloj');
  if (locked || clock.hidden) {
    if (!!clock.hidden !== locked) set({ ...clock, hidden: locked });
    if (locked) return { effects, events: out };
    clock = { ...clock, hidden: false };
  }
  const cost = spent(state, clock, events, p);
  if (cost.seconds <= 0 && cost.ronda === clock.ultimaRonda) return { effects, events: out };
  const next: ClockState = { ...clock, ultimaRonda: cost.ronda, remaining: clock.remaining - cost.seconds, avisados: [...clock.avisados], agrietadas: [...clock.agrietadas], caidas: [...clock.caidas] };
  for (const pct of p.reloj.avisos) {
    if (!next.avisados.includes(pct) && next.remaining > 0 && (100 * next.remaining) / next.total <= pct) {
      next.avisados.push(pct);
      out.push({ type: 'clockWarning', pct, reloj: mmss(next.remaining), relojPct: pct, planta: p.numero } as GameEvent);
    }
  }
  if (next.remaining <= 0) {
    if (clock.remaining > 0) out.push({ type: 'clockExpired', planta: p.numero } as GameEvent);
    next.pasado = clock.pasado + (clock.remaining > 0 ? -next.remaining : cost.seconds);
    collapse(state, p, next, effects, out);
  }
  set(next);
  return { effects, events: out };
}

/**
 * Brings the floor down as far as the time past zero says: one room cracks every
 * `segundosPorSala`, and a cracked room falls at the next step. The boss room (with the stairs)
 * is last and never falls: the way out always stays.
 */
function collapse(state: GameState, p: PlantaInfo, clock: ClockState, effects: Effect[], out: GameEvent[]): void {
  const order = collapseOrder(p);
  const steps = Math.floor(clock.pasado / p.reloj.segundosPorSala) + 1;
  const stairs = zonesOf(state, 'exits')[0];
  const exitTile = stairs ? { x: stairs.x, y: stairs.y } : undefined;
  for (let k = 0; k < Math.min(steps, order.length + 1); k++) {
    // Step k: room k cracks; room k-1 falls.
    const cracking = order[k];
    if (cracking !== undefined && !clock.agrietadas.includes(cracking)) {
      clock.agrietadas.push(cracking);
      const tiles = roomTiles(p, cracking).filter((t) => state.map.tiles[t.y * state.map.width + t.x]?.walkable);
      effects.push({ type: 'spawnSurface', tiles, surface: 'grieta' });
      const willyDentro = Object.values(state.entities).some((e) => hasTag(e, 'pc') && inTiles(tiles, e));
      out.push({ type: 'roomCollapsing', sala: cracking, willyDentro, fase: 'grieta' } as GameEvent);
    }
    const falling = order[k - 1];
    if (falling !== undefined && !clock.caidas.includes(falling)) {
      clock.caidas.push(falling);
      fall(state, p, falling, clock, exitTile, effects, out);
    }
  }
}

function fall(state: GameState, p: PlantaInfo, room: number, clock: ClockState, exitTile: Vec2 | undefined, effects: Effect[], out: GameEvent[]): void {
  const tiles = roomTiles(p, room);
  const inside = Object.values(state.entities).filter((e) => inTiles(tiles, e) && (standing(e) || hasTag(e, 'object')));
  effects.push({ type: 'clearSurface', tiles }, { type: 'setTiles', tiles, terrain: 'hundido', walkable: false });
  let willyOut = false;
  for (const e of inside) {
    if (isParty(e) && standing(e)) {
      // Dragged out by the crew: 30 % of max health (never below 1), knocked down, at the stairs.
      const vida = e.resources.vida!;
      const loss = Math.min(vida.current - 1, Math.ceil(vida.max * DRAG_OUT));
      if (loss > 0) effects.push({ type: 'modifyResource', entityId: e.id, resource: 'vida', delta: -loss });
      effects.push({ type: 'applyCondition', entityId: e.id, condition: 'tumbado', remainingTurns: 1 });
      if (exitTile) effects.push({ type: 'setPosition', entityId: e.id, position: hasTag(e, 'pc') ? exitTile : nearby(state, exitTile) });
      if (hasTag(e, 'pc')) willyOut = true;
    } else if (!isParty(e)) {
      // Foes and scenery go down with the room: out of the contest, no experience.
      effects.push({ type: 'despawnEntity', entityId: e.id });
    }
  }
  if (willyOut) clock.expulsado = true;
  out.push({ type: 'roomCollapsing', sala: room, willyDentro: willyOut, fase: 'caida', tiles } as GameEvent);
}

function nearby(state: GameState, at: Vec2): Vec2 {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const q = { x: at.x + dx, y: at.y + dy };
    if (state.map.tiles[q.y * state.map.width + q.x]?.walkable && !Object.values(state.entities).some((e) => e.position.x === q.x && e.position.y === q.y)) return q;
  }
  return at;
}
