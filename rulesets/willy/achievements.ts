import { type ActionOutcome, type Effect, type Entity, type GameEvent, type GameState, type JsonValue, type RngCursor, type Ruleset, OBJECT_TAG, gridDistance, hasCondition, hasTag, tileAt } from '../../engine';
import { classOf, skillLevel } from './character';
import { CLASSES } from './data';
import { type AchievementDef, type CombatStats, type Condition, type EventPattern, type Match, type MetaState, type Rarity, type Scope, cloneMeta, metaOf, setMeta, willyContent } from './meta';
import { grantBox } from './loot';
import { pushedByFlag, standing } from './resolve';

/**
 * Achievements (docs/willy/DESIGN.md §9), evaluated after every command over its events.
 *
 * The runtime events (entityDefeated, attackRolled, entityPushed…) are first translated into the
 * design vocabulary the achievements are written in (attackResolved with actor/objetivo/critico,
 * objectDestroyed with explota/enemigosAfectados…). Then the generic condition language runs over
 * them: counters per scope (partida, planta, combate, turno), `al` triggers and live `dato`
 * values. Unlocks are kept in the run (state.systems.willyMeta), each once, and announce
 * themselves with an `achievementUnlocked` event; their boxes wait to be opened.
 *
 * «siempre» counts as «partida»: achievements live in the run, not in a browser profile.
 */

export const WILLY_ID = 'willy';
const PARTY_FACTION = 'concursantes';

/** A translated event: a type and fields, some of them entity snapshots (actor, objetivo…). */
export type MetaEvent = { type: string; [k: string]: JsonValue | undefined };

// --- Matching -----------------------------------------------------------------------------------

function lookup(obj: unknown, path: string): unknown {
  let v: unknown = obj;
  for (const part of path.split('.')) {
    if (v === null || v === undefined || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

export function matchValue(v: unknown, m: Match): boolean {
  if (m !== null && typeof m === 'object') {
    if ('en' in m) return m.en.includes(v as string | number);
    if ('tiene' in m) return Array.isArray(v) && v.includes(m.tiene);
    if ('existe' in m) return (v !== undefined && v !== null) === m.existe;
    const r = m as { min?: number; max?: number };
    return typeof v === 'number' && (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
  }
  return v === m;
}

export function matchPattern(ev: MetaEvent, p: EventPattern): boolean {
  if (ev.type !== p.evento) return false;
  return Object.entries(p.donde ?? {}).every(([k, m]) => matchValue(lookup(ev, k), m));
}

// --- Event translation --------------------------------------------------------------------------

function isParty(state: GameState, e: Entity | undefined): boolean {
  if (!e) return false;
  if (e.id === WILLY_ID || e.tags.includes(`companero-de:${WILLY_ID}`)) return true;
  const owner = e.tags.find((t) => t.startsWith('invocado-por:'))?.slice('invocado-por:'.length);
  return !!owner && isParty(state, state.entities[owner]);
}

function isFoe(e: Entity | undefined): boolean {
  return !!e && !e.tags.includes(OBJECT_TAG) && !hasTag(e, 'barrera') && e.factionId !== PARTY_FACTION;
}

export function snapshot(state: GameState, id: string | undefined): JsonValue | undefined {
  const e = id ? state.entities[id] : undefined;
  if (!e) return id ? { id } : undefined;
  return {
    id: e.id,
    nombre: e.name,
    faccion: e.tags.includes(OBJECT_TAG) ? 'objeto' : e.factionId,
    plantilla: e.spriteId,
    condiciones: e.conditions.map((c) => c.id),
    etiquetas: e.tags,
    equipo: isParty(state, e),
    tamano: e.tags.find((t) => t.startsWith('tamano:'))?.slice(7) ?? (hasTag(e, 'grande') ? 'grande' : 'normal'),
    genero: e.tags.includes('genero:f') ? 'f' : 'm',
  };
}

const ENVIRONMENT_CAUSES = ['caida', 'fueraDePlano', 'choque', 'explosion', 'superficie', 'ardiendo', 'veneno', 'trampa', 'roto', 'decorado', 'derrumbe'];

/** Translates one command's events into the achievements' vocabulary. */
export function translate(state: GameState, events: GameEvent[]): MetaEvent[] {
  const out: MetaEvent[] = [];
  const raw = events as unknown as Record<string, unknown>[];
  // Collisions after a push name what it hit; damaged entities tell who a blast reached.
  const collided = new Map<string, string>();
  const damaged = new Set<string>();
  for (const e of raw) {
    if (e.type === 'collided') collided.set(String(e.entityId), String(e.with));
    if (e.type === 'damageDealt') damaged.add(String(e.targetId));
  }
  let actorId: string | undefined;
  let actionId: string | undefined;
  const ability = () => (actionId?.startsWith('hab:') ? actionId.slice(4) : actionId?.startsWith('comp:') ? actionId.slice(5) : undefined);
  const weapon = () => (actionId?.startsWith('obj:') ? actionId.slice(4) : undefined);
  const snap = (id: unknown) => snapshot(state, typeof id === 'string' ? id : undefined);
  for (const e of raw) {
    switch (e.type) {
      case 'actionPerformed':
        actorId = String(e.actorId);
        actionId = String(e.actionId);
        break;
      case 'turnStarted':
        actorId = String(e.entityId);
        actionId = undefined;
        break;
      case 'entityMoved':
        if (!actionId) actorId = String(e.entityId);
        break;
      case 'entityDefeated': {
        const target = state.entities[String(e.entityId)];
        const src = (e.actorId as string | undefined) ?? actorId;
        out.push({ type: 'entityDefeated', actor: snap(src), objetivo: snap(e.entityId), causa: (e.cause as string) ?? 'golpe', elemento: e.element as string | undefined, habilidad: ability(), arma: weapon() });
        if (target && hasTag(target, 'explosivo')) {
          const hit = [...damaged].filter((id) => {
            const v = state.entities[id];
            return v && isFoe(v) && gridDistance(v.position, target.position) <= 1;
          }).length;
          out.push({ type: 'objectDestroyed', actor: snap(src), objetivo: snap(target.id), explota: true, enemigosAfectados: hit, causa: (e.cause as string) ?? 'golpe' });
        }
        break;
      }
      case 'attackRolled': {
        const a = state.entities[String(e.attackerId)];
        const t = state.entities[String(e.targetId)];
        if (!a || !t || t.tags.includes(OBJECT_TAG)) break;
        const rise = (tileAt(state.map, a.position)?.height ?? 0) - (tileAt(state.map, t.position)?.height ?? 0);
        out.push({ type: 'attackResolved', actor: snap(a.id), objetivo: snap(t.id), critico: !!e.crit, acierto: !!e.hit, natural: (e.natural as number) ?? null, alturaRelativa: rise, habilidad: ability(), arma: weapon() });
        if (typeof e.natural === 'number') out.push({ type: 'checkRolled', actor: snap(a.id), natural: e.natural });
        break;
      }
      case 'saveRolled': {
        const roll = e.roll as { dice?: { kept?: number[] }[] } | undefined;
        const natural = roll?.dice?.[0]?.kept?.[0];
        if (typeof natural === 'number') out.push({ type: 'checkRolled', actor: snap(e.entityId), natural });
        break;
      }
      case 'entityPushed': {
        const id = String(e.entityId);
        const flag = state.flags[pushedByFlag(id)];
        out.push({ type: 'entityPushed', actor: snap(typeof flag === 'string' ? flag : actorId), objetivo: snap(id), choque: collided.get(id) === 'entidad' ? 'entidad' : collided.get(id) === 'muro' ? 'muro' : null });
        break;
      }
      case 'damageDealt':
        out.push({ type: 'damageDealt', objetivo: snap(e.targetId), cantidad: Number(e.amount) || 0, critico: !!e.crit, elemento: e.element as string | undefined, actor: snap(actorId) });
        break;
      case 'entityFell':
        out.push({ type: 'fell', entidad: snap(e.entityId), niveles: (e.levels as number) ?? 0 });
        break;
      case 'conditionApplied':
        out.push({ type: 'conditionApplied', condicion: String(e.condition), objetivo: snap(e.entityId), actor: snap(actorId), habilidad: ability() });
        break;
      case 'mapChanged': {
        const to = String(e.to);
        if (to.startsWith('camerino')) out.push({ type: 'safeZoneEntered', mapa: to });
        if (to.startsWith('planta-')) out.push({ type: 'floorEntered', planta: Number(to.slice(7)) || 0, mapa: to });
        break;
      }
      case 'skillUsed':
      case 'skillLevelUp':
      case 'traitTriggered':
      case 'showOff':
      case 'forcedMoveResisted':
      case 'saltoCompleto':
      case 'levelUp':
      case 'companeroCae':
      case 'strike':
        out.push({ ...(e as MetaEvent), actor: snap(e.entityId) });
        break;
      default:
        // The game's own events (floorExited, boxOpened, itemUsed, achievementUnlocked…) as they are.
        if (typeof e.type === 'string' && GAME_EVENTS.has(e.type)) out.push({ ...(e as MetaEvent) });
    }
  }
  return out;
}

const GAME_EVENTS = new Set(['combatStarted', 'combatEnded', 'floorExited', 'floorCleared', 'runStarted', 'runEnded', 'boxDelivered', 'boxOpened', 'itemObtained', 'itemUsed', 'itemEquipped', 'itemSold', 'achievementUnlocked', 'trapTriggered', 'trapSpotted', 'rested', 'npcTalked', 'surfaceReacted', 'regenerated', 'partyPatchedUp', 'audienceChanged', 'audienceMilestone', 'meterChanged', 'sponsorMessage', 'sponsorWithdrew', 'sponsorReturned', 'sponsorGift']);

// --- Combat bookkeeping -------------------------------------------------------------------------

function foesIn(state: GameState): Entity[] {
  return state.turn.order.map((id) => state.entities[id]).filter((e): e is Entity => !!e && isFoe(e));
}

function startCombat(state: GameState): CombatStats {
  const foes = foesIn(state);
  const w = state.entities[WILLY_ID];
  return {
    enemigos: foes.length,
    vidaInicial: w?.resources.vida?.current ?? 0,
    vidaPerdida: 0,
    eliminaciones: 0,
    eliminacionesEntorno: 0,
    ataquesConArmaDeWilly: 0,
    criticos: 0,
    fallosSeguidos: 0,
    vidaMinimaPct: w?.resources.vida ? w.resources.vida.current / Math.max(1, w.resources.vida.max) : 1,
    ...(foes.find((f) => hasTag(f, 'jefe')) ? { jefe: foes.find((f) => hasTag(f, 'jefe'))!.spriteId } : {}),
    elite: foes.some((f) => hasTag(f, 'elite')),
    rondas: 1,
    rival: foes.some((f) => hasTag(f, 'rival')),
  };
}

function trackCombat(c: CombatStats, state: GameState, events: GameEvent[]): void {
  let actionId: string | undefined;
  for (const raw of events as unknown as Record<string, unknown>[]) {
    if (raw.type === 'actionPerformed') actionId = String(raw.actionId);
    if (raw.type === 'damageDealt' && raw.targetId === WILLY_ID) c.vidaPerdida += Number(raw.amount) || 0;
    if (raw.type === 'entityDefeated' && isFoe(state.entities[String(raw.entityId)])) {
      c.eliminaciones++;
      if (ENVIRONMENT_CAUSES.includes(String(raw.cause))) c.eliminacionesEntorno++;
    }
    if (raw.type === 'attackRolled' && raw.attackerId === WILLY_ID) {
      if (actionId === 'basic:golpe' || actionId?.startsWith('obj:')) c.ataquesConArmaDeWilly++;
      c.fallosSeguidos = raw.hit ? 0 : c.fallosSeguidos + 1;
    }
    if (raw.type === 'attackRolled' && raw.crit && isParty(state, state.entities[String(raw.attackerId)])) c.criticos++;
  }
  c.rondas = Math.max(c.rondas ?? 1, state.turn.round || 1);
  const v = state.entities[WILLY_ID]?.resources.vida;
  if (v) c.vidaMinimaPct = Math.min(c.vidaMinimaPct, v.current / Math.max(1, v.max));
}

// --- Live values (`dato`) -----------------------------------------------------------------------

export function datum(state: GameState, meta: MetaState, path: string, ctx: { combat?: CombatStats; result?: string }): unknown {
  const w = state.entities[WILLY_ID];
  const c = ctx.combat ?? meta.combate ?? undefined;
  switch (path) {
    case 'combate.resultado':
      return ctx.result;
    case 'combate.enemigos':
      return c?.enemigos;
    case 'combate.vidaPerdida':
      return c?.vidaPerdida;
    case 'combate.eliminacionesEntornoPct':
      return c && c.eliminaciones ? Math.round((100 * c.eliminacionesEntorno) / Math.max(c.enemigos, c.eliminaciones)) : 0;
    case 'combate.ataquesConArmaDeWilly':
      return c?.ataquesConArmaDeWilly;
    case 'combate.criticos':
      return c?.criticos;
    case 'combate.fallosSeguidos':
      return c?.fallosSeguidos;
    case 'combate.vidaMinimaPct':
      return c ? Math.round(c.vidaMinimaPct * 100) : undefined;
    case 'combate.rondas':
      return c?.rondas;
    case 'combate.jefe':
      return c?.jefe;
    case 'combate.enemigosAturdidos':
      return Object.values(state.entities).filter((e) => isFoe(e) && standing(e) && hasCondition(e, 'aturdido')).length;
    case 'combate.automatasActivos':
      return Object.values(state.entities).filter((e) => hasTag(e, 'automata') && standing(e)).length;
    case 'willy.vida':
      return w?.resources.vida?.current;
    case 'willy.vidaPct':
      return w?.resources.vida ? Math.round((100 * w.resources.vida.current) / Math.max(1, w.resources.vida.max)) : undefined;
    case 'willy.clase':
      return w ? classOf(w) : undefined;
    case 'willy.habilidadesNivel3': {
      const cls = w ? CLASSES[classOf(w) ?? ''] : undefined;
      return cls && w ? cls.habilidades.filter((h) => skillLevel(w, h.id) >= 3).length : 0;
    }
    case 'partida.habilidadesSinUsar': {
      const cls = w ? CLASSES[classOf(w) ?? ''] : undefined;
      if (!cls || !w) return undefined;
      const lvl = w.stats.nivel ?? 1;
      return cls.habilidades.filter((h) => !h.pasiva && h.nivelPersonaje <= lvl && !meta.habilidadesUsadas.includes(h.id)).length;
    }
    case 'partida.habilidadesUsadas':
      return meta.habilidadesUsadas.length;
    case 'partida.cajasSinAbrir':
      return meta.cajas.length;
    case 'partida.cajasAbiertas':
      return meta.cajasAbiertas;
    case 'partida.consumiblesCuracionUsados':
      return meta.consumiblesCuracionUsados;
    case 'partida.pasos':
      return meta.pasosTotales;
    case 'partida.objetosEnMochila':
      return Object.values(((state.systems.inventory as Record<string, Record<string, number>> | undefined) ?? {}).party ?? {}).reduce((s, n) => s + n, 0);
    case 'partida.objetosEquipados':
      return Object.values(meta.equipo).reduce((s, slots) => s + Object.keys(slots).length, 0);
    case 'partida.logros':
    case 'perfil.logros':
      return meta.logros.length;
    case 'partida.plantasLimpias':
      return meta.plantasLimpias.length;
    case 'partida.modoEliminacion':
      return state.flags.modoEliminacion;
    case 'partida.dificultad':
      return state.flags.dificultad ?? state.settings?.difficulty;
    default:
      return undefined;
  }
}

// --- Evaluation ---------------------------------------------------------------------------------

/** Counter nodes of a condition, in walk order (their index keys the counter). */
function counterNodes(c: Condition, out: (Condition & { ambito: Scope })[] = []): (Condition & { ambito: Scope })[] {
  if ('contar' in c || 'sumar' in c) out.push(c);
  else if ('al' in c) counterNodes(c.si, out);
  else if ('todas' in c) c.todas.forEach((x) => counterNodes(x, out));
  else if ('alguna' in c) c.alguna.forEach((x) => counterNodes(x, out));
  else if ('no' in c) counterNodes(c.no, out);
  return out;
}

function scopeKey(state: GameState, meta: MetaState, scope: Scope): string {
  switch (scope) {
    case 'planta':
      return state.map.id;
    case 'combate':
      return `c${meta.combates}`;
    case 'turno':
      return `t${meta.combates}:${state.turn.round}:${state.turn.activeEntityId ?? ''}`;
    default:
      return 'run';
  }
}

function evaluate(def: AchievementDef, c: Condition, state: GameState, meta: MetaState, ctx: { combat?: CombatStats; result?: string }, nodes: Condition[]): boolean {
  if ('contar' in c || 'sumar' in c) {
    const idx = nodes.indexOf(c);
    const counter = meta.cont[`${def.id}#${idx}`];
    return !!counter && counter.k === scopeKey(state, meta, c.ambito) && counter.n >= c.min;
  }
  if ('al' in c) return evaluate(def, c.si, state, meta, ctx, nodes);
  if ('todas' in c) return c.todas.every((x) => evaluate(def, x, state, meta, ctx, nodes));
  if ('alguna' in c) return c.alguna.some((x) => evaluate(def, x, state, meta, ctx, nodes));
  if ('no' in c) return !evaluate(def, c.no, state, meta, ctx, nodes);
  const v = datum(state, meta, c.dato, ctx);
  if (c.igual !== undefined) return v === c.igual;
  if (typeof v !== 'number') return false;
  return (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max);
}

function trigger(c: Condition): string | null {
  return 'al' in c ? c.al : null;
}

function hasCounter(c: Condition): boolean {
  return counterNodes(c).length > 0;
}

// --- The hook -----------------------------------------------------------------------------------

/** Details for the narrator's line ({enemigo:el}, {objeto}, {habilidad}). */
function contextOf(ev: MetaEvent | undefined): Record<string, JsonValue> {
  if (!ev) return {};
  const target = (ev.objetivo ?? ev.entidad) as { nombre?: string; genero?: string } | undefined;
  const out: Record<string, JsonValue> = {};
  if (target?.nombre) {
    out.enemigo = target.nombre;
    out.enemigoGenero = target.genero ?? 'm';
  }
  if (typeof ev.item === 'string') out.objeto = ev.item;
  if (typeof ev.habilidad === 'string') out.habilidad = ev.habilidad;
  return out;
}

function unlock(def: AchievementDef, meta: MetaState, ev: MetaEvent | undefined, effects: Effect[], events: GameEvent[], state: GameState): MetaEvent {
  meta.logros.push(def.id);
  const boxes: Rarity[] = [];
  for (const r of def.recompensas) {
    if (r.tipo === 'caja' && r.nivel) {
      boxes.push(r.nivel);
      const g = grantBox(meta, r.nivel, 'logro', def.nombre);
      events.push(g);
    }
    if ((r.tipo === 'desbloqueo' || r.tipo === 'cosmetico') && r.item && !meta.desbloqueos.includes(r.item)) meta.desbloqueos.push(r.item);
  }
  const unlocked: MetaEvent = {
    type: 'achievementUnlocked',
    logroId: def.id,
    logro: def.nombre,
    descripcion: def.descripcion,
    categoria: def.categoria,
    oculto: def.oculto,
    frase: def.narrador,
    contexto: contextOf(ev),
    cajas: boxes,
    ...(boxes.length ? { recompensa: { caja: boxes[0]! } } : {}),
  };
  // The unlock goes before its box delivery, so the toast reads in order.
  events.splice(events.length - boxes.length, 0, unlocked as unknown as GameEvent);
  void effects;
  void state;
  return unlocked;
}

function isPlantaMap(state: GameState): boolean {
  return state.map.id.startsWith('planta-');
}

/** Every hostile creature on the floor is down: «planta limpia». */
function floorCleared(state: GameState, meta: MetaState): boolean {
  if (!isPlantaMap(state) || state.turn.mode === 'combat' || meta.plantasLimpias.includes(state.map.id)) return false;
  const foes = Object.values(state.entities).filter((e) => isFoe(e) && e.controllerId !== 'player:1' && !hasTag(e, 'pnj'));
  return foes.length > 0 && foes.every((e) => !standing(e));
}

export function achievementsHook(_ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  const content = willyContent();
  const w = state.entities[WILLY_ID];
  if (!content || !w) return { effects: [], events: [] };
  const meta = cloneMeta(metaOf(state));
  const fresh = !meta.iniciado;
  meta.iniciado = true;
  const outEvents: GameEvent[] = [];
  const queue: MetaEvent[] = [];
  if (fresh) queue.push({ type: 'runStarted' });

  // Combat bookkeeping (the stats feed `dato` and the end-of-fight rewards).
  let endedWith: { combat: CombatStats; result: string } | undefined;
  for (const raw of events) {
    if (raw.type === 'combatStarted') {
      meta.combates++;
      meta.combate = startCombat(state);
    }
  }
  if (meta.combate) trackCombat(meta.combate, state, events);
  const ended = events.find((e) => e.type === 'combatEnded') as (GameEvent & { winner: string | null }) | undefined;
  if (ended && meta.combate) {
    endedWith = { combat: meta.combate, result: ended.winner === w.factionId ? 'victoria' : 'derrota' };
  }
  // Abilities used (for «Probador oficial»).
  for (const raw of events as unknown as Record<string, unknown>[]) {
    if (raw.type === 'actionPerformed' && raw.actorId === WILLY_ID && String(raw.actionId).startsWith('hab:')) {
      const id = String(raw.actionId).slice(4);
      if (!meta.habilidadesUsadas.includes(id)) meta.habilidadesUsadas.push(id);
    }
  }

  queue.push(...translate(state, events));
  // Fight rewards: elites, rivals and bosses leave a box.
  if (endedWith?.result === 'victoria') {
    const fights = content.loot.combates ?? {};
    const floor = Number(state.map.id.match(/planta-(\d+)/)?.[1] ?? 0);
    const c = endedWith.combat;
    if (c.jefe) outEvents.push(grantBox(meta, content.loot.fuentes.jefes[String(Math.min(5, Math.max(1, Math.ceil(floor / Math.max(1, floor > 5 ? 2 : 1)))))] ?? 'plata', 'jefe', c.jefe));
    else if (c.rival && fights.rival) outEvents.push(grantBox(meta, fights.rival, 'combate', 'rival'));
    else if (c.elite && fights.elite) outEvents.push(grantBox(meta, fights.elite, 'combate', 'elite'));
  }
  if (floorCleared(state, meta)) {
    meta.plantasLimpias.push(state.map.id);
    const cleared: MetaEvent = { type: 'floorCleared', mapa: state.map.id, planta: Number(state.map.id.slice(7)) || 0 };
    outEvents.push(cleared as unknown as GameEvent);
    queue.push(cleared);
    const tier = content.loot.combates?.plantaLimpia;
    if (tier) outEvents.push(grantBox(meta, tier, 'planta', state.map.id));
  }

  const locked = () => content.achievements.filter((a) => !meta.logros.includes(a.id));
  const ctxFor = (ev: MetaEvent) => (ev.type === 'combatEnded' && endedWith ? endedWith : {});
  for (let i = 0; i < queue.length && i < 400; i++) {
    const ev = queue[i]!;
    for (const def of locked()) {
      const nodes = counterNodes(def.condicion);
      let touched = false;
      nodes.forEach((n, idx) => {
        const pattern = 'contar' in n ? n.contar : 'sumar' in n ? n.sumar : null;
        if (!pattern || !matchPattern(ev, pattern)) return;
        const key = `${def.id}#${idx}`;
        const k = scopeKey(state, meta, n.ambito);
        const prev = meta.cont[key];
        const add = 'sumar' in n ? Number(lookup(ev, n.campo)) || 0 : 1;
        meta.cont[key] = { k, n: (prev && prev.k === k ? prev.n : 0) + add };
        touched = true;
      });
      const at = trigger(def.condicion);
      const due = at ? ev.type === at : touched;
      if (!due) continue;
      if (evaluate(def, def.condicion, state, meta, ctxFor(ev), nodes)) queue.push(unlock(def, meta, ev, [], outEvents, state));
    }
  }
  // Live-value achievements (no events to wait for).
  for (const def of locked()) {
    if (trigger(def.condicion) || hasCounter(def.condicion)) continue;
    if (evaluate(def, def.condicion, state, meta, {}, [])) {
      const u = unlock(def, meta, undefined, [], outEvents, state);
      // An unlock may complete «so many achievements».
      for (const other of locked()) {
        if (!trigger(other.condicion) && !hasCounter(other.condicion) && evaluate(other, other.condicion, state, meta, {}, [])) unlock(other, meta, u, [], outEvents, state);
      }
    }
  }
  if (endedWith) meta.combate = null;
  void rng;
  return { effects: [setMeta(meta)], events: fresh ? [{ type: 'runStarted' } as GameEvent, ...outEvents] : outEvents };
}
