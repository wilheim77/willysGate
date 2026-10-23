import { type ActionOutcome, type Effect, type Entity, type GameEvent, type GameState, type JsonValue, type MapZone, type Ruleset, type RngCursor, type Vec2, OBJECT_TAG, gridDistance, surfaceAt, tagValue, tileAt, zonesOf } from '../../../engine';
import { createCreature } from '../character';
import { parseDice, rollDice } from '../dice';
import { Resolver, type WillyEvent, damageModifierHooks, dealDamage, pushEntity, rollSave, standing } from '../resolve';
import { clone, showConfig } from './config';

/**
 * Phases and weak points of the planta 1-4 bosses (floors.json → plantas[].jefe.fases and
 * debilidad; numbers in content/willy/data/jefes.json). Same pattern as the final boss
 * (boss.ts): one afterCommand hook follows each fight and damage hooks apply the weak points.
 *
 * - Centollo: a shell (+armour) while he stands in water; stranded at low tide (no shell, double
 *   damage from a shove into a wall or pillar); from phase 2, crab reinforcements.
 * - Doña Rebeca: «¡Liquidación total!» turns every belt in her room towards its centre; in her
 *   last phase, a crash into a wall or a shelf stuns her.
 * - Gigantón: spins every few rounds (damage and a shove all around); fire sets his frame alight
 *   (he loses health each round, hits harder); staggering, a shove topples him (double damage,
 *   and he crushes whoever is where he falls).
 * - Socorrista: «rescues» the nearest contestant (pulls them in) and whistles (stuns whoever is
 *   in the water); dives into the pool (almost untouchable in water, trapped if it freezes);
 *   then boils it (steam).
 *
 * state.systems.jefes = { [bossId]: fight }. Events: bossPhase { jefe, fase }, plus
 * bossShell / bossStranded, beltsReversed, bossSpin, frameBurning, bossToppled, bossRescue.
 */

export interface PlantaBossConfig {
  /** Health % where each phase starts (floors.json → fases[].hasta). */
  fases: number[];
  [key: string]: unknown;
}

interface Fight {
  fase: number;
  ronda: number;
  zona: { x: number; y: number; width: number; height: number };
  caparazon?: boolean;
  ardiendo?: boolean;
  dobleHasta?: number;
  giroRonda?: number;
  rescateRonda?: number;
  refuerzos?: number;
}

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const configs = (): Record<string, PlantaBossConfig> => showConfig()?.bosses ?? {};

export function plantaBossFightOf(state: GameState, id: string): Fight | undefined {
  return (state.systems.jefes as unknown as Record<string, Fight> | undefined)?.[id];
}

function phaseFor(fases: number[], pct: number): number {
  let fase = 1;
  fases.forEach((hasta, i) => {
    if (pct <= hasta) fase = i + 1;
  });
  return fase;
}

function zoneOf(state: GameState, boss: Entity): Fight['zona'] {
  const z = zonesOf(state, 'encounters').find((zz: MapZone) => String(zz.properties.participants ?? '').split(',').includes(boss.id));
  if (z) return { x: z.x, y: z.y, width: z.width, height: z.height };
  return { x: boss.position.x - 4, y: boss.position.y - 4, width: 9, height: 9 };
}

const inZone = (z: Fight['zona'], p: Vec2) => p.x >= z.x && p.x < z.x + z.width && p.y >= z.y && p.y < z.y + z.height;

function contestants(state: GameState, boss: Entity): Entity[] {
  return Object.values(state.entities).filter((e) => standing(e) && !e.tags.includes(OBJECT_TAG) && e.factionId !== boss.factionId && e.factionId !== 'escenario');
}

function freeNear(state: GameState, at: Vec2, max = 3): Vec2[] {
  const taken = new Set(Object.values(state.entities).filter((e) => standing(e) || e.tags.includes(OBJECT_TAG)).map((e) => `${e.position.x},${e.position.y}`));
  const out: Vec2[] = [];
  for (let d = 1; d <= max; d++) {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const p = { x: at.x + dx, y: at.y + dy };
      if (tileAt(state.map, p)?.walkable && !taken.has(`${p.x},${p.y}`)) out.push(p);
    }
  }
  return out;
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

// --- Per boss ---------------------------------------------------------------------------------

/** Every command: water under him or not. */
function centolloTick(r: Resolver, boss: Entity, f: Fight, d: Data): void {
  const wet = surfaceAt(r.state, boss.position)?.type === 'agua';
  if (wet && !f.caparazon) {
    f.caparazon = true;
    r.apply({ type: 'modifyStat', entityId: boss.id, stat: 'armadura', delta: d.caparazon });
    r.emit({ type: 'bossShell', entityId: boss.id } as unknown as WillyEvent);
  } else if (!wet && f.caparazon) {
    f.caparazon = false;
    r.apply({ type: 'modifyStat', entityId: boss.id, stat: 'armadura', delta: -d.caparazon });
    r.emit({ type: 'bossStranded', entityId: boss.id } as unknown as WillyEvent);
  }
}

function centolloRound(r: Resolver, boss: Entity, f: Fight, d: Data, round: number): void {
  const ref = d.refuerzos;
  if (f.fase < ref.desdeFase || round % ref.cadaRondas !== 0) return;
  const spots = freeNear(r.state, boss.position);
  for (let i = 0; i < ref.cantidad && spots[i]; i++) {
    f.refuerzos = (f.refuerzos ?? 0) + 1;
    const c = ref.criatura;
    const entity = createCreature({ id: `${boss.id}-refuerzo-${f.refuerzos}`, name: c.nombre, controllerId: boss.controllerId, factionId: boss.factionId, position: spots[i]!, spriteId: c.sprite, vida: c.vida, def: c.def, ataque: c.ataque, dano: c.dano, movimiento: c.movimiento, tags: [`invocado-por:${boss.id}`, ...(c.xp ? [`xp:${c.xp}`] : [])] });
    r.apply({ type: 'spawnEntity', entity, ownerId: boss.id });
  }
}

/** «¡Liquidación total!»: every belt of her room points at its centre. */
function rebecaPhase(r: Resolver, boss: Entity, f: Fight, d: Data): void {
  if (f.fase !== d.liquidacionDesdeFase) return;
  const cx = f.zona.x + (f.zona.width - 1) / 2;
  const cy = f.zona.y + (f.zona.height - 1) / 2;
  const zones = (r.state.systems.zones as unknown as MapZone[] | undefined) ?? [];
  let changed = 0;
  const next = zones.map((z) => {
    if (z.layer !== 'cintas' || !inZone(f.zona, { x: z.x, y: z.y })) return z;
    const dx = sign(Math.round(cx - z.x));
    const dy = dx ? 0 : sign(Math.round(cy - z.y));
    if (!dx && !dy) return z;
    changed++;
    return { ...z, properties: { ...z.properties, dx, dy } };
  });
  if (changed) r.apply({ type: 'setSystem', system: 'zones', value: next as unknown as JsonValue });
  r.emit({ type: 'beltsReversed', entityId: boss.id, cintas: changed } as unknown as WillyEvent);
}

function rebecaEvents(r: Resolver, boss: Entity, f: Fight, d: Data, events: GameEvent[]): void {
  if (f.fase < d.embestidaDesdeFase) return;
  const crashed = events.some((e) => e.type === 'collided' && (e as unknown as { entityId: string }).entityId === boss.id);
  if (crashed && standing(r.entity(boss.id))) {
    r.apply({ type: 'applyCondition', entityId: boss.id, condition: 'aturdido', remainingTurns: d.aturdidaRondas });
    r.emit({ type: 'bossShelfFell', entityId: boss.id } as unknown as WillyEvent);
  }
}

function gigantonEvents(r: Resolver, boss: Entity, f: Fight, d: Data, events: GameEvent[], round: number): void {
  // The spin, at the start of his turn every few rounds.
  const turn = events.some((e) => e.type === 'turnStarted' && (e as unknown as { entityId: string }).entityId === boss.id);
  if (turn && round % d.giro.cadaRondas === 0 && f.giroRonda !== round) {
    f.giroRonda = round;
    const dmg = parseDice(tagValue(boss, 'arma') ?? '1d6');
    const near = Object.values(r.state.entities).filter((e) => e.id !== boss.id && standing(e) && !e.tags.includes(OBJECT_TAG) && gridDistance(e.position, boss.position) <= d.giro.radio);
    r.emit({ type: 'bossSpin', entityId: boss.id, afectados: near.map((e) => e.id) } as unknown as WillyEvent);
    for (const e of near) {
      dealDamage(r, e.id, rollDice(r.rng, dmg), 'golpe', boss.id, 'golpe');
      if (r.state.entities[e.id] && standing(r.entity(e.id))) pushEntity(r, e.id, boss.position, d.giro.empuje, boss.id);
    }
  }
  // Fire on the frame.
  if (f.fase >= d.ardiendo.desdeFase && !f.ardiendo) {
    const burnt = events.some((e) => {
      const x = e as unknown as { type: string; targetId?: string; element?: string; entityId?: string; condition?: string };
      return (x.type === 'damageDealt' && x.targetId === boss.id && x.element === 'fuego') || (x.type === 'conditionApplied' && x.entityId === boss.id && x.condition === 'ardiendo');
    }) || r.entity(boss.id).conditions.some((c) => c.id === 'ardiendo');
    if (burnt) {
      f.ardiendo = true;
      r.emit({ type: 'frameBurning', entityId: boss.id } as unknown as WillyEvent);
    }
  }
  // Staggering: a shove topples him, he falls where he was pushed and crushes what is there.
  if (f.fase >= d.tumbado.desdeFase) {
    for (const e of events) {
      const x = e as unknown as { type: string; entityId?: string; from?: Vec2; to?: Vec2 };
      if (x.type !== 'entityPushed' || x.entityId !== boss.id || !x.from || !x.to) continue;
      if (!standing(r.entity(boss.id)) || r.entity(boss.id).conditions.some((c) => c.id === 'tumbado')) break;
      r.apply({ type: 'applyCondition', entityId: boss.id, condition: 'tumbado', remainingTurns: 1 });
      f.dobleHasta = round + d.tumbado.dobleRondas;
      const dir = { x: sign(x.to.x - x.from.x), y: sign(x.to.y - x.from.y) };
      const fallsOn = { x: x.to.x + dir.x, y: x.to.y + dir.y };
      const crushed = Object.values(r.state.entities).filter((o) => o.id !== boss.id && standing(o) && !o.tags.includes(OBJECT_TAG) && o.position.x === fallsOn.x && o.position.y === fallsOn.y);
      r.emit({ type: 'bossToppled', entityId: boss.id, aplastados: crushed.map((o) => o.id) } as unknown as WillyEvent);
      for (const o of crushed) dealDamage(r, o.id, rollDice(r.rng, parseDice(d.tumbado.aplastar)), 'golpe', boss.id, 'decorado');
      break;
    }
  }
}

function gigantonRound(r: Resolver, boss: Entity, f: Fight, d: Data): void {
  if (f.ardiendo && standing(r.entity(boss.id))) dealDamage(r, boss.id, d.ardiendo.perdidaPorRonda, 'fisico', undefined, 'ardiendo');
}

function socorristaEvents(r: Resolver, boss: Entity, f: Fight, d: Data, events: GameEvent[], round: number): void {
  const turn = events.some((e) => e.type === 'turnStarted' && (e as unknown as { entityId: string }).entityId === boss.id);
  if (turn && round % d.rescate.cadaRondas === 0 && f.rescateRonda !== round) {
    f.rescateRonda = round;
    const target = contestants(r.state, boss).sort((a, b) => gridDistance(a.position, boss.position) - gridDistance(b.position, boss.position))[0];
    if (target) {
      // Pulled towards her: a push from the far side.
      const away = { x: target.position.x + sign(target.position.x - boss.position.x), y: target.position.y + sign(target.position.y - boss.position.y) };
      const steps = Math.min(d.rescate.distancia, Math.max(0, gridDistance(target.position, boss.position) - 1));
      r.emit({ type: 'bossRescue', entityId: boss.id, targetId: target.id } as unknown as WillyEvent);
      if (steps > 0) pushEntity(r, target.id, away, steps, boss.id);
    }
    // The whistle: whoever is in the water is stunned unless they hold on.
    for (const e of contestants(r.state, boss)) {
      if (surfaceAt(r.state, e.position)?.type !== 'agua') continue;
      if (!rollSave(r, e.id, 'agu', d.rescate.dif)) r.apply({ type: 'applyCondition', entityId: e.id, condition: 'aturdido', remainingTurns: 1 });
    }
  }
  // Frozen in her pool.
  if (f.fase >= d.piscinaDesdeFase && surfaceAt(r.state, r.entity(boss.id).position)?.type === 'hielo' && !r.entity(boss.id).conditions.some((c) => c.id === 'congelado')) {
    r.apply({ type: 'applyCondition', entityId: boss.id, condition: 'congelado', remainingTurns: d.congeladaRondas });
    r.emit({ type: 'bossFrozen', entityId: boss.id } as unknown as WillyEvent);
  }
}

function socorristaPhase(r: Resolver, boss: Entity, f: Fight, d: Data): void {
  if (f.fase === d.piscinaDesdeFase) {
    // Into the pool: the nearest water in her room, or the pool fills around her.
    const pool: Vec2[] = [];
    for (let y = f.zona.y; y < f.zona.y + f.zona.height; y++) for (let x = f.zona.x; x < f.zona.x + f.zona.width; x++) if (surfaceAt(r.state, { x, y })?.type === 'agua') pool.push({ x, y });
    const taken = new Set(Object.values(r.state.entities).filter((e) => e.id !== boss.id && standing(e)).map((e) => `${e.position.x},${e.position.y}`));
    const spot = pool.filter((p) => !taken.has(`${p.x},${p.y}`)).sort((a, b) => gridDistance(a, boss.position) - gridDistance(b, boss.position))[0];
    if (spot) r.apply({ type: 'setPosition', entityId: boss.id, position: spot });
    else {
      const around: Vec2[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const p = { x: boss.position.x + dx, y: boss.position.y + dy };
        if (tileAt(r.state.map, p)?.walkable) around.push(p);
      }
      r.apply({ type: 'spawnSurface', tiles: around, surface: 'agua' } as Effect);
    }
    r.emit({ type: 'bossDived', entityId: boss.id } as unknown as WillyEvent);
  }
}

function socorristaRound(r: Resolver, boss: Entity, f: Fight, d: Data): void {
  if (f.fase < d.vaporDesdeFase) return;
  // The pool boils: steam over the water of her room and around her.
  const tiles: Vec2[] = [];
  const b = r.entity(boss.id);
  for (let y = f.zona.y; y < f.zona.y + f.zona.height; y++) for (let x = f.zona.x; x < f.zona.x + f.zona.width; x++) {
    const p = { x, y };
    if (surfaceAt(r.state, p)?.type === 'agua' && gridDistance(p, b.position) <= 2) tiles.push(p);
  }
  if (tiles.length) r.apply({ type: 'spawnSurface', tiles, surface: 'vapor', turns: d.vaporRondas } as Effect);
}

// --- The hook ---------------------------------------------------------------------------------

export function bossesAfterCommand(ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  const all = configs();
  const ids = Object.keys(all);
  if (!ids.length) return { effects: [], events: [] };
  const fights = (state.systems.jefes as unknown as Record<string, Fight> | undefined) ?? {};
  const present = ids.filter((id) => state.entities[id]);
  if (!present.length && !Object.keys(fights).length) return { effects: [], events: [] };
  const r = new Resolver(ruleset, state, rng);
  const next: Record<string, Fight> = clone(fights);
  let touched = false;

  for (const id of ids) {
    const boss = r.state.entities[id];
    const inFight = boss && standing(boss) && r.state.turn.mode === 'combat' && r.state.turn.order.includes(id);
    if (!inFight) {
      if (next[id]) {
        // The shell goes with the fight.
        if (next[id]!.caparazon && boss) r.apply({ type: 'modifyStat', entityId: id, stat: 'armadura', delta: -(all[id] as Data).caparazon });
        delete next[id];
        touched = true;
      }
      continue;
    }
    const d = all[id] as Data;
    const round = r.state.turn.round;
    const f = next[id] ?? { fase: 1, ronda: round, zona: zoneOf(r.state, boss) };
    if (!next[id]) r.emit({ type: 'bossPhase', jefe: id, fase: 1 } as unknown as WillyEvent);
    next[id] = f;
    touched = true;

    const hp = r.entity(id).resources.vida!;
    const target = phaseFor(d.fases, (100 * hp.current) / hp.max);
    while (target > f.fase) {
      f.fase += 1;
      r.emit({ type: 'bossPhase', jefe: id, fase: f.fase } as unknown as WillyEvent);
      if (id === 'jefe-encargada') rebecaPhase(r, boss, f, d);
      if (id === 'jefe-socorrista') socorristaPhase(r, r.entity(id), f, d);
    }
    if (id === 'jefe-centollo') centolloTick(r, r.entity(id), f, d);
    if (id === 'jefe-encargada') rebecaEvents(r, r.entity(id), f, d, events);
    if (id === 'jefe-giganton') gigantonEvents(r, r.entity(id), f, d, events, round);
    if (id === 'jefe-socorrista') socorristaEvents(r, r.entity(id), f, d, events, round);

    while (f.ronda < round) {
      f.ronda += 1;
      if (!r.state.entities[id] || !standing(r.entity(id))) break;
      if (id === 'jefe-centollo') centolloRound(r, r.entity(id), f, d, f.ronda);
      if (id === 'jefe-giganton') gigantonRound(r, r.entity(id), f, d);
      if (id === 'jefe-socorrista') socorristaRound(r, r.entity(id), f, d);
    }
  }
  if (touched) r.apply({ type: 'setSystem', system: 'jefes', value: next as unknown as JsonValue });
  return r.outcome();
}

// Weak points and strengths, on the damage they take or deal.
damageModifierHooks.push((r, targetId, amount, element, sourceId) => {
  const all = configs();
  const fights = (r.state.systems.jefes as unknown as Record<string, Fight> | undefined) ?? {};
  let a = amount;
  // Gigantón with his frame alight hits harder.
  const g = sourceId === 'jefe-giganton' ? fights['jefe-giganton'] : undefined;
  if (g?.ardiendo) a += rollDice(r.rng, parseDice((all['jefe-giganton'] as Data).ardiendo.danoExtra));
  const f = fights[targetId];
  if (!f) return a;
  const d = all[targetId] as Data | undefined;
  if (!d) return a;
  const last = r.events[r.events.length - 1] as unknown as { type?: string; entityId?: string } | undefined;
  if (targetId === 'jefe-centollo' && !f.caparazon && last?.type === 'collided' && last.entityId === targetId) a *= d.choqueVarado;
  if (targetId === 'jefe-giganton' && f.dobleHasta !== undefined && f.dobleHasta >= r.state.turn.round) a *= 2;
  if (targetId === 'jefe-socorrista' && f.fase >= d.piscinaDesdeFase && surfaceAt(r.state, r.entity(targetId).position)?.type === 'agua' && element !== 'rayo') a *= d.enElAgua;
  return a;
});
