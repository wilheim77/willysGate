import { type BaseCommand, type Engine, type Entity, type GameState, type JsonValue, type MapZone, type Vec2, SYSTEM_ISSUER, applyEffects, createEngine, nextAiCommand, withLighting, withZones, zonesOf } from '../../../engine';
import { CLASSES, createCompanion, createWilly, explorationHealing, skillLevel, willy } from '../../../rulesets/willy';
import { FLOOR_COUNT, floorSpec, generateFloor } from '../gen/floor';
// The show (audience, sponsors and the presenter's Share) runs in the sim as in the game.
import { SHOW } from '../show';
import { freshAudience } from '../../../rulesets/willy/show';

/**
 * Balance simulator: Willy and his companion go through a generated floor, room by room in
 * the order of the room graph, with the AI playing both sides. Health carries over between
 * fights (only what the rules give back between them comes back). Used by the balance
 * regression test and to fill the table in docs/willy/BALANCE.md.
 *
 * The AI plays Willy worse than a person (it never retreats, rarely sets up combos), so these
 * numbers are a floor, not the experience of a good player.
 */

/** Willy's expected level on each floor (floors.json → pisos[].nivelEsperado: the level he enters with). */
export const EXPECTED_LEVEL: Record<number, number> = Object.fromEntries(Array.from({ length: FLOOR_COUNT }, (_, i) => [i + 1, floorSpec(i + 1).nivelEsperado]));

export interface FloorRun {
  floor: number;
  seed: number;
  classId: string;
  /** Willy got through every fight of the floor, boss included. */
  cleared: boolean;
  /** Reached the boss, and beat it. */
  reachedBoss: boolean;
  bossWon: boolean;
  /** Times the companion was knocked out (it stays down for the rest of the floor). */
  companionDowns: number;
  fights: number;
  /** A fight hit the command limit without ending (AI stalemate). */
  stalled: boolean;
  /** Willy's health left at the end, as a share of the maximum. */
  hpLeft: number;
  /** Per fight: the foes, and Willy's health before and after. */
  log: { foes: string[]; before: number; after: number; boss: boolean; room: number; rounds: number; stats: FightStats }[];
  /** Audience when the floor ends. */
  audiencia: number;
  /** The presenter's Share when his fight ends (floor 10), and how often it kept him at 1 health. */
  share?: number;
  enAntena?: number;
}

const MAX_COMMANDS = 1500;

/** What a fight looked like, for tuning the curve (tests/content/willy-fight-probe.test.ts). */
export interface FightStats {
  /** Max health at the start: the party's (Willy + companion) and the foes'. */
  partyHp: number;
  foeHp: number;
  /** Damage taken by the party and by the foes. */
  partyDamage: number;
  foeDamage: number;
  /** Foe turns, attacks rolled against the party, and hits. */
  foeTurns: number;
  foeAttacks: number;
  foeHits: number;
  /** Damage of the foes' hits against the party, as a share of the target's max health, summed. */
  hitShare: number;
  /** Willy's attack rolls and hits; party turns. */
  willyAttacks: number;
  willyHits: number;
  partyTurns: number;
}

// Out-of-combat regen (rulesets/willy/regen.ts): on by default, matching a real run; the
// balance regression test and tuning probes can turn it off to see the harder floor.
export const simOptions: { regen: boolean; dificultad?: string } = { regen: true };

/** Willy (and his companion) heal a little walking to the fight, as they would in a real run. */
function walkTo(state: GameState, to: Vec2 | undefined): GameState {
  const w = state.entities.willy;
  if (!simOptions.regen || !w || !to) return state;
  const steps = Math.max(Math.abs(w.position.x - to.x), Math.abs(w.position.y - to.y));
  return applyEffects(willy, state, explorationHealing(state, steps)).state;
}

let sharedEngine: Engine | undefined;
function engine(): Engine {
  return (sharedEngine ??= createEngine(willy, 'willy-sim', { dialogues: {} }));
}

/** Points per level go to the class's two best attributes (what a player would mostly do). */
function willyAt(classId: string, lvl: number, at: Vec2): Entity {
  const cls = CLASSES[classId]!;
  const best = Object.entries(cls.atributos as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([a]) => a);
  const points: Record<string, number> = {};
  const total = 3 + 2 * (lvl - 1);
  for (let i = 0; i < total; i++) {
    const a = best[i % 2] ?? 'fue';
    points[a] = (points[a] ?? 0) + 1;
  }
  return createWilly({ id: 'willy', controllerId: 'player:1', factionId: 'concursantes', position: at, spriteId: `willy-${classId}`, classId, level: lvl, points });
}

function free(state: GameState, p: Vec2, extra: Set<string>): boolean {
  const t = state.map.tiles[p.y * state.map.width + p.x];
  if (!t?.walkable || extra.has(`${p.x},${p.y}`)) return false;
  return !Object.values(state.entities).some((e) => e.position.x === p.x && e.position.y === p.y && willy.occupiesTile!(e));
}

/** Where the party walks in: the free tile of the room furthest from the enemies. */
function entryTiles(state: GameState, zone: MapZone, foes: Entity[], party: Entity[]): Vec2[] {
  const taken = new Set<string>();
  const out: Vec2[] = [];
  const score = (p: Vec2) => Math.min(...foes.map((f) => Math.max(Math.abs(f.position.x - p.x), Math.abs(f.position.y - p.y))));
  const tiles: Vec2[] = [];
  for (let y = zone.y; y < zone.y + zone.height; y++) for (let x = zone.x; x < zone.x + zone.width; x++) tiles.push({ x, y });
  const sorted = tiles.filter((p) => !party.some((m) => m.position.x === p.x && m.position.y === p.y)).sort((a, b) => score(b) - score(a) || a.y - b.y || a.x - b.x);
  for (const p of sorted) {
    if (out.length === party.length) break;
    if (!free(state, p, taken)) continue;
    if (out.length && Math.max(Math.abs(out[0]!.x - p.x), Math.abs(out[0]!.y - p.y)) > 1) continue;
    out.push(p);
    taken.add(`${p.x},${p.y}`);
  }
  return out;
}

function standingIds(state: GameState, ids: string[]): string[] {
  return ids.filter((id) => state.entities[id] && willy.isStanding(state.entities[id]!));
}

/** One fight to the end. Returns the state after it and whether it ended normally. */
function fight(state: GameState, party: string[], foes: string[]): { state: GameState; stalled: boolean; enAntena: number; rounds: number; stats: FightStats } {
  const e = engine();
  const started = e.apply(state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: [...party, ...foes] } as BaseCommand);
  const maxHp = (ids: string[], st: GameState) => ids.reduce((sum, id) => sum + (st.entities[id]?.resources.vida?.max ?? 0), 0);
  const stats: FightStats = { partyHp: maxHp(party, state), foeHp: maxHp(foes, state), partyDamage: 0, foeDamage: 0, foeTurns: 0, foeAttacks: 0, foeHits: 0, hitShare: 0, willyAttacks: 0, willyHits: 0, partyTurns: 0 };
  if (!started.ok) return { state, stalled: false, enAntena: 0, rounds: 0, stats };
  let s = started.state;
  let enAntena = 0;
  let rounds = 1;
  const inParty = (id: string) => s.entities[id]?.controllerId.startsWith('player') ?? false;
  for (let i = 0; i < MAX_COMMANDS && s.turn.mode === 'combat'; i++) {
    const id = s.turn.activeEntityId!;
    const r = e.apply(s, nextAiCommand(willy, s, id));
    if (r.ok) {
      s = r.state;
      enAntena += r.events.filter((ev) => ev.type === 'enAntena').length;
      let lastFoeHitOn: string | undefined;
      for (const ev of r.events) {
        const f = ev as unknown as Record<string, unknown>;
        if (ev.type === 'turnStarted') {
          rounds = Math.max(rounds, Number(f.round ?? 0));
          if (inParty(String(f.entityId))) stats.partyTurns++;
          else stats.foeTurns++;
        }
        if (ev.type === 'attackRolled') {
          const fromParty = inParty(String(f.attackerId));
          if (!fromParty && inParty(String(f.targetId))) {
            stats.foeAttacks++;
            if (f.hit) {
              stats.foeHits++;
              lastFoeHitOn = String(f.targetId);
            }
          }
          if (f.attackerId === 'willy' && !inParty(String(f.targetId))) {
            stats.willyAttacks++;
            if (f.hit) stats.willyHits++;
          }
        }
        if (ev.type === 'damageDealt') {
          const target = String(f.targetId);
          const amount = Number(f.amount ?? 0);
          if (inParty(target)) {
            stats.partyDamage += amount;
            if (lastFoeHitOn === target) {
              stats.hitShare += amount / Math.max(1, s.entities[target]?.resources.vida?.max ?? 1);
              lastFoeHitOn = undefined;
            }
          } else if (foes.includes(target)) stats.foeDamage += amount;
        }
      }
    } else {
      const skip = e.apply(s, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: id } as BaseCommand);
      if (!skip.ok) break;
      s = skip.state;
    }
  }
  return { state: s, stalled: s.turn.mode === 'combat', enAntena, rounds, stats };
}

const audienceOf = (s: GameState) => (s.systems.audiencia as unknown as { valor?: number } | undefined)?.valor ?? SHOW.audience.inicial;

/** Starts the floor's show at `audiencia` viewers (a season's typical value there). */
function withAudience(state: GameState, audiencia: number | undefined): GameState {
  if (audiencia === undefined) return state;
  return { ...state, systems: { ...state.systems, audiencia: { ...freshAudience(), valor: audiencia, pico: audiencia } as unknown as JsonValue } };
}

/** `audiencia`: viewers on arrival (default: the show's starting value, raised to the floor's minimum by the rules). */
export function simulateFloor(seed: number, floor: number, classId: string, audiencia?: number): FloorRun {
  const built = generateFloor(seed, floor).setup;
  const lvl = EXPECTED_LEVEL[floor] ?? 1;
  const arrival = built.spawns.llegada!;
  const w = willyAt(classId, lvl, arrival);
  let state = engine().newGame({ seed, map: built.map, entities: [w, ...built.entities] });
  const systems = built.systems ?? {};
  state = { ...state, systems: { ...state.systems, ...systems, spawns: built.spawns as unknown as JsonValue } };
  if (systems.lighting) state = withLighting(state, systems.lighting as never);
  if (systems.zones) state = withZones(state, systems.zones as never);
  const spot = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }].map((d) => ({ x: arrival.x + d.x, y: arrival.y + d.y })).find((p) => free(state, p, new Set()))!;
  const mate = createCompanion(classId, w, spot)!;
  state = withAudience({ ...state, entities: { ...state.entities, [mate.id]: mate } }, audiencia);
  if (simOptions.dificultad) state = { ...state, flags: { ...state.flags, dificultad: simOptions.dificultad } };

  const rooms = (systems.planta as unknown as { salas: { role: string; depth: number }[] }).salas;
  const encounters = zonesOf(state, 'encounters').sort((a, b) => {
    const ra = rooms[Number(a.name.split('-')[1])]!;
    const rb = rooms[Number(b.name.split('-')[1])]!;
    return Number(ra.role === 'jefe') - Number(rb.role === 'jefe') || ra.depth - rb.depth;
  });
  const run: FloorRun = { floor, seed, classId, cleared: false, reachedBoss: false, bossWon: false, companionDowns: 0, fights: 0, stalled: false, hpLeft: 0, log: [], audiencia: 0 };
  const partyIds = ['willy', mate.id];
  for (const zone of encounters) {
    const boss = rooms[Number(zone.name.split('-')[1])]!.role === 'jefe';
    const foes = standingIds(state, String(zone.properties.participants).split(','));
    if (!foes.length) continue;
    const party = standingIds(state, partyIds);
    const tiles = entryTiles(state, zone, foes.map((id) => state.entities[id]!), party.map((id) => state.entities[id]!));
    state = walkTo(state, tiles[0]);
    const moved = { ...state.entities };
    party.forEach((id, i) => {
      if (tiles[i]) moved[id] = { ...moved[id]!, position: tiles[i]! };
    });
    state = { ...state, entities: moved };
    if (boss) run.reachedBoss = true;
    const mateUp = party.includes(mate.id);
    const before = state.entities.willy!.resources.vida!.current;
    // Speed: only the room (and a margin) takes part; everyone else waits aside, untouched.
    const near = (p: Vec2) => p.x >= zone.x - 4 && p.x < zone.x + zone.width + 4 && p.y >= zone.y - 4 && p.y < zone.y + zone.height + 4;
    const aside = Object.fromEntries(Object.entries(state.entities).filter(([id, e]) => !party.includes(id) && !foes.includes(id) && !near(e.position)));
    const inRoom = Object.fromEntries(Object.entries(state.entities).filter(([id]) => !aside[id]));
    const result = fight({ ...state, entities: inRoom }, party, foes);
    state = { ...result.state, entities: { ...aside, ...result.state.entities } };
    run.log.push({ foes: foes.map((id) => state.entities[id]!.spriteId), before, after: state.entities.willy!.resources.vida!.current, boss, room: Number(zone.name.split('-')[1]), rounds: result.rounds, stats: result.stats });
    if (foes.includes(SHOW.share.jefeId)) {
      run.share = (state.systems.share as unknown as { valor?: number } | undefined)?.valor;
      run.enAntena = result.enAntena;
    }
    run.fights++;
    if (mateUp && !willy.isStanding(state.entities[mate.id]!)) run.companionDowns++;
    if (result.stalled) {
      run.stalled = true;
      break;
    }
    if (!willy.isStanding(state.entities.willy!)) break;
    if (boss) run.bossWon = true;
  }
  const wv = state.entities.willy!.resources.vida!;
  run.cleared = willy.isStanding(state.entities.willy!) && !run.stalled && run.bossWon;
  run.hpLeft = wv.current / wv.max;
  run.audiencia = audienceOf(state);
  return run;
}

// --- A whole season ---------------------------------------------------------------------------------

export interface SeasonFloor {
  floor: number;
  /** Retries needed ("Volver a intentarlo" replays the lost fight with other dice). */
  retries: number;
  /** Willy's level when leaving the floor. */
  level: number;
  /** Tier of each active class ability (by use) when leaving the floor. */
  tiers: Record<string, number>;
  /** Uses of each active class ability so far (the by-use tiers count these). */
  uses: Record<string, number>;
  bossWon: boolean;
  /** The boss (or guardian) fell at the first try. */
  bossFirstTry: boolean;
  fights: number;
  /** The fight that took most retries: its foes' sprites. */
  toughest?: string[];
  /** Audience when leaving the floor (carried over to the next, as in the game). */
  audiencia: number;
}

export interface SeasonRun {
  seed: number;
  classId: string;
  /** Got through every floor within the retry budget. */
  finished: boolean;
  floors: SeasonFloor[];
}

/**
 * Willy (from level 1, earning XP) and his companion play every floor in order, carrying
 * experience, ability uses and the companion between floors. The Camerino heals them fully.
 * A lost fight is replayed with different dice, up to `maxRetries` times in the whole season.
 */
export function simulateSeason(seed: number, classId: string, maxRetries = 15, floors = FLOOR_COUNT): SeasonRun {
  const run: SeasonRun = { seed, classId, finished: false, floors: [] };
  let w = willyAt(classId, 1, { x: 0, y: 0 });
  let mate: Entity | undefined;
  let retriesLeft = maxRetries;
  // The show carries over from floor to floor (the Share is per boss fight).
  let show: Record<string, JsonValue> = {};
  const abilities = (CLASSES[classId]!.habilidades as { id: string; pasiva?: boolean }[]).filter((h) => !h.pasiva).map((h) => h.id);
  for (let floor = 1; floor <= floors; floor++) {
    const built = generateFloor(seed, floor).setup;
    const arrival = built.spawns.llegada!;
    // The Camerino: full health and energy, back on their feet.
    const heal = (e: Entity, at: Vec2): Entity => ({
      ...e,
      position: at,
      conditions: e.conditions.filter((c) => c.id !== 'eliminado'),
      resources: Object.fromEntries(Object.entries(e.resources).map(([k, r]) => [k, k === 'vida' || k === 'energia' ? { ...r, current: r.max } : r])),
      tags: e.tags.filter((t) => !t.startsWith('caido-en:')),
    });
    w = heal(w, arrival);
    let state = engine().newGame({ seed: seed * 31 + floor, map: built.map, entities: [w, ...built.entities] });
    const systems = built.systems ?? {};
    state = { ...state, systems: { ...state.systems, ...systems, spawns: built.spawns as unknown as JsonValue } };
    if (systems.lighting) state = withLighting(state, systems.lighting as never);
    if (systems.zones) state = withZones(state, systems.zones as never);
    const spot = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }].map((d) => ({ x: arrival.x + d.x, y: arrival.y + d.y })).find((p) => free(state, p, new Set()))!;
    mate = mate ? heal(mate, spot) : createCompanion(classId, w, spot)!;
    state = { ...state, entities: { ...state.entities, [mate.id]: mate }, systems: { ...state.systems, ...show } };

    const rooms = (systems.planta as unknown as { salas: { role: string; depth: number }[] }).salas;
    const encounters = zonesOf(state, 'encounters').sort((a, b) => {
      const ra = rooms[Number(a.name.split('-')[1])]!;
      const rb = rooms[Number(b.name.split('-')[1])]!;
      return Number(ra.role === 'jefe') - Number(rb.role === 'jefe') || ra.depth - rb.depth;
    });
    const partyIds = ['willy', mate.id];
    let retries = 0;
    let bossWon = false;
    let bossFirstTry = false;
    let fights = 0;
    let worst = 0;
    let toughest: string[] | undefined;
    let failed = false;
    for (const zone of encounters) {
      const boss = rooms[Number(zone.name.split('-')[1])]!.role === 'jefe';
      const foes = standingIds(state, String(zone.properties.participants).split(','));
      if (!foes.length) continue;
      const party = standingIds(state, partyIds);
      const tiles = entryTiles(state, zone, foes.map((id) => state.entities[id]!), party.map((id) => state.entities[id]!));
      state = walkTo(state, tiles[0]);
      const moved = { ...state.entities };
      party.forEach((id, i) => {
        if (tiles[i]) moved[id] = { ...moved[id]!, position: tiles[i]! };
      });
      const before: GameState = { ...state, entities: moved };
      const near = (p: Vec2) => p.x >= zone.x - 4 && p.x < zone.x + zone.width + 4 && p.y >= zone.y - 4 && p.y < zone.y + zone.height + 4;
      const aside = Object.fromEntries(Object.entries(before.entities).filter(([id, e]) => !party.includes(id) && !foes.includes(id) && !near(e.position)));
      const inRoom = Object.fromEntries(Object.entries(before.entities).filter(([id]) => !aside[id]));
      let won = false;
      const retriesBefore = retries;
      for (let attempt = 0; ; attempt++) {
        const dice = { ...before.rng, a: (before.rng.a + attempt * 7919) >>> 0 };
        const result = fight({ ...before, rng: dice, entities: inRoom }, party, foes);
        state = { ...result.state, entities: { ...aside, ...result.state.entities } };
        won = !result.stalled && willy.isStanding(state.entities.willy!);
        if (won || retriesLeft <= 0) break;
        retriesLeft--;
        retries++;
      }
      fights++;
      if (retries - retriesBefore > worst) {
        worst = retries - retriesBefore;
        toughest = foes.map((id) => before.entities[id]?.spriteId ?? id);
      }
      if (!won) {
        failed = true;
        break;
      }
      if (boss) {
        bossWon = true;
        bossFirstTry = retries === retriesBefore;
      }
    }
    w = state.entities.willy!;
    mate = state.entities[mate.id] ?? mate;
    show = Object.fromEntries((['audiencia', 'patrocinadores'] as const).filter((k) => state.systems[k] !== undefined).map((k) => [k, state.systems[k]!]));
    run.floors.push({ floor, retries, level: w.stats.nivel ?? 1, tiers: Object.fromEntries(abilities.map((id) => [id, skillLevel(w, id)])), uses: Object.fromEntries(abilities.map((id) => [id, w.resources[`uso:${id}`]?.current ?? 0])), bossWon, bossFirstTry, fights, ...(toughest ? { toughest } : {}), audiencia: audienceOf(state) });
    if (failed) return run;
  }
  run.finished = true;
  return run;
}

export interface BalanceRow {
  floor: number;
  runs: number;
  cleared: number;
  bossReached: number;
  bossWon: number;
  companionDowns: number;
  stalled: number;
  hpLeft: number;
}

export function summarize(runs: FloorRun[]): BalanceRow[] {
  const floors = [...new Set(runs.map((r) => r.floor))].sort();
  return floors.map((floor) => {
    const rs = runs.filter((r) => r.floor === floor);
    return {
      floor,
      runs: rs.length,
      cleared: rs.filter((r) => r.cleared).length / rs.length,
      bossReached: rs.filter((r) => r.reachedBoss).length / rs.length,
      bossWon: rs.filter((r) => r.bossWon).length / Math.max(1, rs.filter((r) => r.reachedBoss).length),
      companionDowns: rs.reduce((s, r) => s + r.companionDowns, 0) / rs.length,
      stalled: rs.filter((r) => r.stalled).length,
      hpLeft: rs.reduce((s, r) => s + r.hpLeft, 0) / rs.length,
    };
  });
}
