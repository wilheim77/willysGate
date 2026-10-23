import { type Entity, type GameEvent, type GameState, type JsonValue, hasCondition, stat } from '../../../engine';
import { attr, hasTrait, skillLevel } from '../character';
import { itemDef } from '../meta';
import type { Resolver, WillyEvent } from '../resolve';
import { type AudienceRule, WILLY_ID, clone, currentFloor, currentPlanta, showConfig } from './config';
import { type View, entityView, eventViews, matchPattern } from './patterns';
import { grantBox } from './rewards';

/**
 * Audiencia (DESIGN.md §6, content/willy/data/audience.json): a viewer count that spectacular
 * play raises and boring play lowers. It never punishes: losses are a percentage and stop at the
 * planta's minimum. It pays boxes at milestones and at the end of each planta, wakes up the
 * sponsors (each has a minimum audience) and, on the last floor, feeds the presenter's Share.
 *
 * Bookkeeping lives in state.systems.audiencia. Events:
 * - audienceChanged { delta, deltaPct, espectadores, causa, entityId? }
 * - audienceMilestone { espectadores, caja }
 * - audienceTier { tramo, nombre }
 */

export { WILLY_ID } from './config';

export interface AudienceState {
  valor: number;
  /** Highest value this run (season summary). */
  pico: number;
  /** Milestones already paid. */
  hitos: number[];
  /** Novelty keys seen this run. */
  vistos: string[];
  /** Novelty keys of the last few Willy turns: [key, turn]. */
  recientes: [string, number][];
  /** Willy's turns so far (the novelty span counts these). */
  turno: number;
  /** Floors already entered (the arrival hype is paid once per floor). */
  pisos: number[];
  /** Plantas whose end-of-planta bonus was paid. */
  primas: number[];
  /** Abilities used at least once («habilidad nueva»). */
  habilidades: string[];
  /** This Willy turn: did he act, and did anything interesting happen? */
  turnoWilly: { activo: boolean; actuo: boolean; interesante: boolean };
  /** The last action and how many times in a row. */
  ultimaAccion: [string, number] | null;
  /** Clock seconds out of combat since the last gain. */
  aburrido: number;
  /** «Hacer el ganso» this combat. */
  gansos: number;
  /** Willy's health when this combat started. */
  vidaInicio: number | null;
  /** «Viral»: the next spectacular moments multiply. */
  viral: { mult: number; momentos: number } | null;
  /** Current tier index (audience.json → tramos). */
  tramo: number;
  /** Clock seconds left when last seen (boredom counts the clock that runs out). */
  reloj?: number | null;
  /** «Especial de audiencia» (aviso): where it was picked up, and the floor it multiplies. */
  especial?: { desde: number | null; piso: number | null } | null;
}

export function audienceOf(state: GameState): AudienceState | undefined {
  return state.systems.audiencia as unknown as AudienceState | undefined;
}

export function freshAudience(): AudienceState {
  const cfg = showConfig()!;
  return {
    valor: cfg.audience.inicial,
    pico: cfg.audience.inicial,
    hitos: [],
    vistos: [],
    recientes: [],
    turno: 0,
    pisos: [],
    primas: [],
    habilidades: [],
    turnoWilly: { activo: false, actuo: false, interesante: false },
    ultimaAccion: null,
    aburrido: 0,
    gansos: 0,
    vidaInicio: null,
    viral: null,
    tramo: tierOf(cfg.audience.inicial),
  };
}

function tierOf(value: number): number {
  const tramos = showConfig()!.audience.tramos;
  let i = 0;
  tramos.forEach((t, k) => {
    if (value >= t.desde) i = k;
  });
  return i;
}

export function floorMinimum(state: GameState): number {
  return showConfig()!.audience.porPlanta[String(currentPlanta(state))]?.minimo ?? 0;
}

function plantaMult(state: GameState): number {
  return showConfig()!.audience.porPlanta[String(currentPlanta(state))]?.mult ?? 1;
}

/** Everything that multiplies Willy's gains: Carisma, the Influencer, items, Sin repetición. */
export function gainMultiplier(state: GameState): number {
  const w = state.entities[WILLY_ID];
  if (!w) return 1;
  let m = 1 + 0.05 * attr(w, 'car');
  if (hasTrait(w, 'directo')) m *= 1.5;
  const items = stat(w, 'multAudiencia', 0);
  if (items) m *= 1 + items / 100;
  if (isHardcore(state)) m *= showConfig()!.audience.multSinRepeticion;
  const especial = audienceOf(state)?.especial;
  if (especial?.piso !== undefined && especial?.piso !== null && especial.piso === currentFloor(state)) m *= showConfig()!.audience.especialAudiencia.mult;
  return m;
}

export function isHardcore(state: GameState): boolean {
  // DESIGN.md §12: chosen when the season starts (the meta systems store it in state.settings).
  const settings = (state as unknown as { settings?: { eliminationMode?: string } }).settings;
  return settings?.eliminationMode === 'sinRepeticion';
}

/** Spectacular moments: the novelty key of a gain (rule + cause or object). */
function noveltyKey(rule: AudienceRule, v: View): string {
  const extra = v.causaOriginal ?? v.habilidad ?? v.caja ?? '';
  return `${rule.id}:${String(extra)}`;
}

function novelty(a: AudienceState, key: string): number {
  const cfg = showConfig()!.audience.novedad;
  if (!a.vistos.includes(key)) return cfg.primeraVezEnPartida;
  const recent = a.recientes.filter(([k, t]) => k === key && a.turno - t < cfg.repeticionesRecientes.ventanaTurnos).length;
  const mults = cfg.repeticionesRecientes.multiplicadores;
  return mults[Math.min(recent, mults.length - 1)] ?? 1;
}

/** Where the floating «+audiencia» goes: the victim, the actor, or Willy. */
function anchorOf(v: View): string | undefined {
  const pick = (x: unknown) => (x && typeof x === 'object' ? ((x as { id?: string }).id ?? undefined) : undefined);
  return pick(v.objetivo) ?? pick(v.entidad) ?? pick(v.objeto) ?? pick(v.actor) ?? WILLY_ID;
}

/**
 * Applies one change to the audience: clamps to [floor minimum, maximum], records the peak,
 * pays milestones, announces the tier, and emits audienceChanged. Returns the real delta.
 */
export function changeAudience(r: Resolver, a: AudienceState, delta: number, causa: string, entityId?: string): number {
  const cfg = showConfig()!.audience;
  const before = a.valor;
  const min = floorMinimum(r.state);
  let after = Math.round(before + delta);
  after = Math.min(cfg.maximo, delta < 0 ? Math.max(Math.min(before, min), after) : Math.max(after, min));
  const real = after - before;
  if (real === 0) return 0;
  a.valor = after;
  a.pico = Math.max(a.pico, after);
  r.emit({ type: 'audienceChanged', delta: real, deltaPct: before > 0 ? Math.round((100 * real) / before) : 100, espectadores: after, causa, ...(entityId ? { entityId } : {}) } as unknown as WillyEvent);
  for (const h of cfg.hitos) {
    if (after >= h.espectadores && !a.hitos.includes(h.espectadores)) {
      a.hitos.push(h.espectadores);
      const w = r.state.entities[WILLY_ID];
      // «Algoritmo favorable» (Influencer): milestones give a box one tier up.
      const caja = w && hasTrait(w, 'algoritmo-favorable') ? boxUp(h.caja) : h.caja;
      r.emit({ type: 'audienceMilestone', espectadores: h.espectadores, caja } as unknown as WillyEvent);
      grantBox(r, caja, `hito:${h.espectadores}`);
    }
  }
  const tier = tierOf(after);
  if (tier !== a.tramo) {
    if (tier > a.tramo) r.emit({ type: 'audienceTier', tramo: tier, nombre: cfg.tramos[tier]!.nombre } as unknown as WillyEvent);
    a.tramo = tier;
  }
  return real;
}

const BOXES = ['bronce', 'plata', 'oro', 'legendaria'];
function boxUp(caja: string): string {
  const i = BOXES.indexOf(caja);
  return i < 0 ? caja : BOXES[Math.min(BOXES.length - 1, i + 1)]!;
}

function lose(r: Resolver, a: AudienceState, pct: number, causa: string): number {
  return changeAudience(r, a, (-a.valor * pct) / 100, causa);
}

/** Reads the event field a rule's porCampo names (enemigosAfectados...). */
function perField(rule: AudienceRule, v: View): number {
  return Object.entries(rule.porCampo ?? {}).reduce((sum, [k, per]) => sum + per * Number(v[k] ?? 0), 0);
}

/**
 * One command's worth of audience. Returns the total gained (the Share drains with it) and
 * whether there was any loss (the Share grows with boredom).
 */
export function runAudience(r: Resolver, events: GameEvent[]): { gained: number; lost: number; views: View[] } {
  const cfg = showConfig()!.audience;
  const state = r.state;
  const a: AudienceState = { ...freshAudience(), ...clone(audienceOf(state) ?? {}) };
  let gained = 0;
  let lost = 0;
  const willy = state.entities[WILLY_ID];
  const inCombat = state.turn.mode === 'combat';

  // Abilities used for the first time this run.
  const firstUse = new Set<string>();
  for (const e of events) {
    const f = e as unknown as { type: string; entityId?: string; habilidad?: string };
    if (e.type === 'skillUsed' && f.entityId === WILLY_ID && f.habilidad && !a.habilidades.includes(f.habilidad)) {
      a.habilidades.push(f.habilidad);
      firstUse.add(`${f.entityId}:${f.habilidad}`);
    }
  }
  const views = eventViews(events, state, { firstSkillUse: firstUse });

  // Willy's turn bookkeeping: a wait or a dull turn costs viewers.
  for (const e of events) {
    const f = e as unknown as Record<string, unknown>;
    if (e.type === 'turnStarted') {
      if (a.turnoWilly.activo && f.entityId !== WILLY_ID) {
        const acted = a.turnoWilly.actuo;
        if (!acted) {
          lost += -lose(r, a, ruleLoss('esperar'), 'esperar');
          views.push({ evento: 'turnEnded', entityId: WILLY_ID, esperar: true });
          r.emit({ type: 'turnEnded', entityId: WILLY_ID, esperar: true } as unknown as WillyEvent);
        } else if (!a.turnoWilly.interesante) {
          lost += -lose(r, a, ruleLoss('turno-soso'), 'turno-soso');
          views.push({ evento: 'turnEnded', entityId: WILLY_ID, sinEfecto: true });
          r.emit({ type: 'turnEnded', entityId: WILLY_ID, sinEfecto: true } as unknown as WillyEvent);
        }
        a.turnoWilly = { activo: false, actuo: false, interesante: false };
      }
      if (f.entityId === WILLY_ID) {
        a.turno += 1;
        a.turnoWilly = { activo: true, actuo: false, interesante: false };
      }
    }
    if (e.type === 'actionPerformed' && f.actorId === WILLY_ID) {
      a.turnoWilly.actuo = true;
      // The same action three times in a row bores people.
      const key = `${String(f.actionId)}`;
      a.ultimaAccion = a.ultimaAccion && a.ultimaAccion[0] === key ? [key, a.ultimaAccion[1] + 1] : [key, 1];
      if (a.ultimaAccion[1] >= 3 && inCombat) {
        lost += -lose(r, a, ruleLoss('monotonia'), 'monotonia');
        views.push({ evento: 'actionRepeated', veces: a.ultimaAccion[1] });
      }
    }
    if (e.type === 'entityMoved' && f.entityId === WILLY_ID) a.turnoWilly.actuo = true;
    if ((e.type === 'damageDealt' || e.type === 'entityPushed' || e.type === 'healed') && a.turnoWilly.activo) a.turnoWilly.interesante = true;
    if (e.type === 'skillUsed' && f.entityId === WILLY_ID && f.habilidad === 'viral') {
      a.viral = { mult: Number(f.multiplicador ?? 3), momentos: Number(f.momentos ?? 1) };
    }
    if (e.type === 'combatStarted') {
      a.gansos = 0;
      a.vidaInicio = willy?.resources.vida?.current ?? null;
    }
  }

  // Combat results: victory (and close calls), or running away.
  const ended = events.find((e) => e.type === 'combatEnded') as unknown as { winner: string | null } | undefined;
  if (ended && willy) {
    const hp = willy.resources.vida!;
    const resultado = ended.winner === willy.factionId ? 'victoria' : willy && hp.current > 0 ? 'huida' : 'derrota';
    const lostPct = a.vidaInicio ? Math.round((100 * Math.max(0, a.vidaInicio - hp.current)) / hp.max) : 0;
    views.push({ evento: 'combatEnded', resultado, vidaPct: Math.round((100 * hp.current) / hp.max), vidaPerdidaPct: lostPct, actor: entityView(willy) });
    a.vidaInicio = null;
    a.viral = null;
    a.turnoWilly = { activo: false, actuo: false, interesante: false };
  }

  // «Mate del concurso» at Maestría: the audience votes, everything this turn ×3 (here: this command).
  const maestriaVote = !!willy && events.some((e) => {
    const f = e as unknown as { type: string; entityId?: string; habilidad?: string };
    return f.type === 'skillUsed' && f.entityId === WILLY_ID && f.habilidad === 'mate-del-concurso';
  }) && skillLevel(willy, 'mate-del-concurso') >= 5;

  for (const e of events) {
    const f = e as unknown as Record<string, unknown>;
    // «Repertorio corto» (Bardo): the same song twice in a row bores people.
    if (e.type === 'traitTriggered' && f.rasgo === 'repertorio-corto' && f.entityId === WILLY_ID) {
      lost += -changeAudience(r, a, -cfg.clases.repertorioCorto * plantaMult(state), 'repertorio-corto');
    }
    // «Unboxing» (Influencer): extra audience for each silver-or-better item out of a box.
    if (e.type === 'boxOpened' && willy && hasTrait(willy, 'unboxing')) {
      const good = ((f.objetos as { rareza?: string }[] | undefined) ?? []).filter((o) => o.rareza && o.rareza !== 'bronce').length;
      if (good) {
        const lvl = skillLevel(willy, 'unboxing');
        const bonus = 1 + (lvl >= 4 ? 0.5 : lvl >= 2 ? 0.25 : 0);
        gained += changeAudience(r, a, good * cfg.clases.unboxingPorObjeto * bonus * plantaMult(state) * gainMultiplier(state), 'unboxing', WILLY_ID);
      }
    }
    // Items that move the meter (Share embotellado: +25 %).
    if (e.type === 'itemUsed') {
      const def = itemDef(String(f.item));
      for (const fx of (def?.usar?.efectos ?? []) as { type: string; meter?: string; pct?: number; cause?: string }[]) {
        if (fx.type === 'modifyMeter' && fx.meter === 'audiencia' && fx.pct) gained += changeAudience(r, a, (a.valor * fx.pct) / 100, fx.cause ?? 'objeto', WILLY_ID);
      }
    }
  }

  // Gains. «Sin reflejo» (the presenter): the drones don't film him, so nothing he does gives
  // anyone audience (his crits on Willy, his shoves, his trapdoors).
  const unfilmed = showConfig()!.share.jefeId;
  const byHim = (v: View) => [v.actor, v.atacante].some((x) => x && typeof x === 'object' && (x as { id?: string }).id === unfilmed) || v.causaOriginal === 'trampilla';
  for (const v of views) {
    if (byHim(v)) continue;
    for (const rule of cfg.ganancias) {
      if (!rule.base || (rule.soloEnCombate && !inCombat) || !matchPattern(v, rule.patron)) continue;
      if (rule.id === 'ganso') a.gansos += 1;
      const key = noveltyKey(rule, v);
      let amount = (rule.base + perField(rule, v)) * plantaMult(state) * gainMultiplier(state) * novelty(a, key);
      if (rule.id === 'ganso' && rule.decrecientePorCombate) amount *= rule.decrecientePorCombate ** Math.max(0, a.gansos - 1);
      if (rule.id === 'ganso' && willy) amount *= gansoMultiplier(willy);
      if (maestriaVote) amount *= cfg.clases.mateDelConcursoMaestria;
      if (a.viral && inCombat) {
        amount *= a.viral.mult;
        a.viral.momentos -= 1;
        if (a.viral.momentos <= 0) {
          a.viral = null;
          if (willy && hasCondition(willy, 'viral')) r.apply({ type: 'removeCondition', entityId: WILLY_ID, condition: 'viral' });
        }
      }
      if (!a.vistos.includes(key)) a.vistos.push(key);
      a.recientes.push([key, a.turno]);
      gained += changeAudience(r, a, amount, rule.id, anchorOf(v));
      a.turnoWilly.interesante = true;
      a.aburrido = 0;
    }
    for (const rule of cfg.perdidas) {
      if (!rule.pct || ['esperar', 'turno-soso', 'monotonia'].includes(rule.id) || !matchPattern(v, rule.patron)) continue;
      lost += -lose(r, a, rule.pct, rule.id);
    }
  }
  const span = cfg.novedad.repeticionesRecientes.ventanaTurnos;
  a.recientes = a.recientes.filter(([, t]) => a.turno - t < span);

  // Arriving on a new floor: the audience expects things (+10 %), and never starts below the minimum.
  for (const e of events) {
    if (e.type !== 'mapChanged') continue;
    const floor = currentFloor(r.state);
    if (floor === undefined || a.pisos.includes(floor)) continue;
    a.pisos.push(floor);
    gained += changeAudience(r, a, Math.max(floorMinimum(r.state) - a.valor, 0) + (Math.max(a.valor, floorMinimum(r.state)) * cfg.expectacionAlEntrarEnPlanta.pct) / 100, 'expectacion');
  }

  // Leaving the planta's second floor: the end-of-planta bonus box.
  for (const v of views) {
    if (v.evento !== 'floorExited') continue;
    const piso = showConfig()!.pisos.find((p) => p.id === Number(v.planta));
    const planta = piso?.planta ?? currentPlanta(r.state);
    if (a.primas.includes(planta) || (piso ? piso.parte < 2 : !isLastFloorOfPlanta(r.state))) continue;
    a.primas.push(planta);
    const prima = [...cfg.prima].reverse().find((p) => a.valor >= p.audienciaMin);
    if (prima) {
      r.emit({ type: 'audienceBonus', planta, caja: prima.caja, espectadores: a.valor } as unknown as WillyEvent);
      grantBox(r, prima.caja, `prima:${planta}`);
    }
  }

  // «Al filo»: leaving by the stairs with less than 10 % of the clock left pays a box too.
  for (const v of views) {
    if (v.evento !== 'floorExited' || v.metodo !== 'escalera') continue;
    const p = cfg.primaAlFilo;
    if (Number(v.relojRestantePct ?? 100) <= p.relojRestanteMaxPct) {
      r.emit({ type: 'audienceBonus', planta: currentPlanta(r.state), caja: p.caja, espectadores: a.valor, alFilo: true } as unknown as WillyEvent);
      grantBox(r, p.caja, `al-filo:${String(v.planta ?? '')}`);
    }
  }

  // «Especial de audiencia» (aviso): picked up, it multiplies the next floor; spent when that floor ends.
  const flag = r.state.flags[cfg.especialAudiencia.flag];
  if (flag && !a.especial) a.especial = { desde: currentFloor(r.state) ?? null, piso: null };
  if (a.especial) {
    const floor = currentFloor(r.state);
    const arrived = events.some((e) => e.type === 'mapChanged');
    if (a.especial.piso === null && arrived && floor !== undefined && floor !== a.especial.desde) a.especial.piso = floor;
    if (a.especial.piso !== null && views.some((v) => v.evento === 'floorExited')) {
      a.especial = null;
      r.apply({ type: 'setFlag', flag: cfg.especialAudiencia.flag, value: 0 });
    }
  }

  // Out of combat, walking about with nothing happening: 30 s of clock lose 1 %. The floor clock
  // (systems.clock) says how much time went by; without it, 1 s per tile walked and 3 per interaction.
  if (!inCombat) {
    const clock = r.state.systems.clock as unknown as { remaining?: number } | undefined;
    if (typeof clock?.remaining === 'number') {
      if (typeof a.reloj === 'number' && clock.remaining < a.reloj) a.aburrido += a.reloj - clock.remaining;
      a.reloj = clock.remaining;
    } else {
      a.reloj = null;
      for (const e of events) {
        const f = e as unknown as { entityId?: string; path?: unknown[] };
        if (e.type === 'entityMoved' && f.entityId === WILLY_ID) a.aburrido += f.path?.length ?? 0;
        if (e.type === 'dialogueStarted' || e.type === 'interact') a.aburrido += 3;
      }
    }
    if (a.aburrido >= cfg.aburrimiento.segundosDeReloj && currentFloor(r.state) !== undefined) {
      a.aburrido = 0;
      lost += -lose(r, a, cfg.aburrimiento.pct, 'aburrimiento');
    }
  }

  r.apply({ type: 'setSystem', system: 'audiencia', value: a as unknown as JsonValue });
  return { gained, lost, views };

  function ruleLoss(id: string): number {
    return cfg.perdidas.find((p) => p.id === id)?.pct ?? 0;
  }
}

/** «Hacer el ganso»: the Mimo only mimes (half, unless «Público de calle»); items like the Pandereta add. */
function gansoMultiplier(willy: Entity): number {
  let m = 1 + stat(willy, 'bonoGanso', 0) / 100;
  if (hasTrait(willy, 'voto-de-silencio') && !hasTrait(willy, 'publico-de-calle')) m *= 0.5;
  return m;
}

function isLastFloorOfPlanta(state: GameState): boolean {
  const p = state.systems.planta as unknown as { parte?: number } | undefined;
  return (p?.parte ?? 2) >= 2;
}
