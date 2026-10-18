import { type BaseCommand, type CommandHandler, type GameState, type JsonValue, RngCursor, fail } from '../../../engine';
import { attr } from '../character';
import { Resolver, type WillyEvent } from '../resolve';
import { audienceOf } from './audience';
import { type SponsorData, type SponsorDeal, type SponsorGift, type SponsorLine, WILLY_ID, clone, currentFloor, showConfig } from './config';
import { type View, matchPattern } from './patterns';
import { grantBox, grantCoins, grantItem } from './rewards';

/**
 * Patrocinadores (DESIGN.md §7, content/willy/data/sponsors.json). Each sponsor has an
 * affinity (−50 to 150) that its tastes raise and its dislikes lower, but only once the audience
 * passes its minimum (they show up one by one). States: neutral → interesado (20, first
 * message) → aFavor (50, gift) → fan (100, big gift), and another gift every 40 more (at most
 * two gifts per floor among all of them). Below −20 a sponsor withdraws, always warning first
 * when it crosses 0; it comes back at 30. Carisma multiplies the affinity won.
 *
 * Contratos (deals): an interested sponsor offers a concrete deal in the Camerino, or when it
 * first takes an interest. Accepted (`aceptarContrato`), it runs until the end of the next floor:
 * met, it pays a box, an item or coins; broken or missed, a fine in coins, lost affinity and a
 * pointed message. Events:
 * - sponsorAffinityChanged { patrocinadorId, delta, afinidad }
 * - sponsorStateChanged { patrocinadorId, de, a }
 * - sponsorMessage { patrocinadorId, patrocinador, tipo, lineaId, texto, color, primeraVez }
 * - sponsorGift { patrocinadorId, item?, caja?, grande }
 * - sponsorWithdrew / sponsorReturned { patrocinadorId }
 * - sponsorDealOffered / sponsorDealAccepted / sponsorDealDeclined / sponsorDealProgress /
 *   sponsorDealCompleted / sponsorDealBroken { patrocinadorId, contratoId, ... }
 */

export interface SponsorState {
  afinidad: number;
  estado: string;
  /** Has it ever looked at Willy (audience over its minimum)? */
  mirando: boolean;
  retirado: boolean;
  /** Warned since it last was interested (the warning is sent once per slide). */
  avisado: boolean;
  /** Affinity thresholds already paid with a gift. */
  pagados: number[];
  /** Message kinds already sent (for the Narrador's «primeraVez»). */
  dichos: string[];
}

export interface Deal {
  patrocinadorId: string;
  contratoId: string;
  progreso: number;
  cantidad: number;
  /** Floor whose exit closes it (undefined while signed in the Camerino: the next floor). */
  piso?: number;
}

export interface SponsorsState {
  porId: Record<string, SponsorState>;
  /** Gifts per floor: [floor, count]. */
  regalosPiso: [number, number];
  ofertas: { patrocinadorId: string; contratoId: string }[];
  contratos: Deal[];
  cumplidos: number;
  rotos: number;
}

export const MAX_ACTIVE_DEALS = 2;

export function sponsorsOf(state: GameState): SponsorsState | undefined {
  return state.systems.patrocinadores as unknown as SponsorsState | undefined;
}

function fresh(): SponsorsState {
  const cfg = showConfig()!.sponsors;
  return {
    porId: Object.fromEntries(cfg.patrocinadores.map((p) => [p.id, { afinidad: cfg.reglas.afinidad.inicial, estado: 'neutral', mirando: false, retirado: false, avisado: false, pagados: [], dichos: [] }])),
    regalosPiso: [0, 0],
    ofertas: [],
    contratos: [],
    cumplidos: 0,
    rotos: 0,
  };
}

export function sponsorData(id: string): SponsorData | undefined {
  return showConfig()?.sponsors.patrocinadores.find((p) => p.id === id);
}

export function dealData(sponsorId: string, dealId: string): SponsorDeal | undefined {
  return sponsorData(sponsorId)?.contratos?.find((c) => c.id === dealId);
}

function stateFor(affinity: number): string {
  const estados = showConfig()!.sponsors.reglas.estados;
  let id = 'neutral';
  for (const e of estados) if (affinity >= e.desde) id = e.id;
  return id;
}

const RANK: Record<string, number> = { neutral: 0, interesado: 1, aFavor: 2, fan: 3 };

function pick<T>(r: Resolver, list: T[]): T | undefined {
  return list.length ? list[r.rng.die(list.length) - 1] : undefined;
}

function pickGift(r: Resolver, gifts: SponsorGift[]): SponsorGift | undefined {
  const total = gifts.reduce((s, g) => s + (g.peso ?? 1), 0);
  if (total <= 0) return undefined;
  let roll = r.rng.die(total);
  for (const g of gifts) {
    roll -= g.peso ?? 1;
    if (roll <= 0) return g;
  }
  return gifts[0];
}

function say(r: Resolver, sp: SponsorData, st: SponsorState, tipo: string, lines: SponsorLine[] | undefined, extra: Record<string, unknown> = {}): void {
  const line = pick(r, lines ?? []);
  if (!line) return;
  const primeraVez = !st.dichos.includes(tipo);
  if (primeraVez) st.dichos.push(tipo);
  r.emit({ type: 'sponsorMessage', patrocinadorId: sp.id, patrocinador: sp.nombre, tipo, lineaId: line.id, texto: line.texto, color: sp.color, primeraVez, ...extra } as unknown as WillyEvent);
}

function give(r: Resolver, sp: SponsorData, gift: SponsorGift, grande: boolean, origen: string): void {
  r.emit({ type: 'sponsorGift', patrocinadorId: sp.id, ...(gift.item ? { item: gift.item } : {}), ...(gift.caja ? { caja: gift.caja } : {}), grande } as unknown as WillyEvent);
  if (gift.item) grantItem(r, gift.item, origen);
  if (gift.caja) grantBox(r, gift.caja, origen);
}

/** Gifts left this floor (at most `maxPorPlanta` among all sponsors). */
function giftRoom(r: Resolver, s: SponsorsState): boolean {
  const floor = currentFloor(r.state) ?? 0;
  if (s.regalosPiso[0] !== floor) s.regalosPiso = [floor, 0];
  return s.regalosPiso[1] < showConfig()!.sponsors.reglas.regalos.maxPorPlanta;
}

function changeAffinity(r: Resolver, s: SponsorsState, sp: SponsorData, delta: number): void {
  const rules = showConfig()!.sponsors.reglas;
  const st = s.porId[sp.id]!;
  const before = st.afinidad;
  const after = Math.max(rules.afinidad.min, Math.min(rules.afinidad.max, Math.round((before + delta) * 10) / 10));
  if (after === before) return;
  st.afinidad = after;
  r.emit({ type: 'sponsorAffinityChanged', patrocinadorId: sp.id, delta: Math.round((after - before) * 10) / 10, afinidad: after } as unknown as WillyEvent);

  // Warning when it slides past 0 from «interesado» or better, then withdrawal under −20.
  if (before >= 0 && after < 0 && RANK[st.estado]! >= 1 && !st.avisado && !st.retirado) {
    st.avisado = true;
    say(r, sp, st, 'aviso', sp.mensajes.aviso);
  }
  if (!st.retirado && after < rules.retirada.umbral) {
    if (!st.avisado) say(r, sp, st, 'aviso', sp.mensajes.aviso);
    st.retirado = true;
    say(r, sp, st, 'retirada', sp.mensajes.retirada);
    r.emit({ type: 'sponsorWithdrew', patrocinadorId: sp.id } as unknown as WillyEvent);
    // A withdrawn sponsor's deals are off (no fine: it's their doing).
    s.contratos = s.contratos.filter((d) => d.patrocinadorId !== sp.id);
    s.ofertas = s.ofertas.filter((o) => o.patrocinadorId !== sp.id);
  }
  if (st.retirado && after >= rules.vuelta.umbral) {
    st.retirado = false;
    st.avisado = false;
    say(r, sp, st, 'vuelta', sp.mensajes.vuelta);
    r.emit({ type: 'sponsorReturned', patrocinadorId: sp.id } as unknown as WillyEvent);
  }

  const estado = stateFor(after);
  if (estado !== st.estado) {
    r.emit({ type: 'sponsorStateChanged', patrocinadorId: sp.id, de: st.estado, a: estado } as unknown as WillyEvent);
    const up = RANK[estado]! > RANK[st.estado]!;
    st.estado = estado;
    if (up && estado === 'interesado') {
      st.avisado = false;
      say(r, sp, st, 'interes', sp.mensajes.interes);
      offer(r, s, sp);
    }
  }
  if (st.retirado) return;

  // Gifts: aFavor (50), fan (100) and every 40 more, each paid once.
  const every = rules.regalos.cadaAfinidadExtra;
  const fanAt = rules.estados.find((e) => e.id === 'fan')?.desde ?? 100;
  const favourAt = rules.estados.find((e) => e.id === 'aFavor')?.desde ?? 50;
  const steps = [favourAt, fanAt];
  for (let t = fanAt + every; t <= rules.afinidad.max; t += every) steps.push(t);
  for (const t of steps) {
    if (after < t || st.pagados.includes(t) || !giftRoom(r, s)) continue;
    st.pagados.push(t);
    s.regalosPiso[1] += 1;
    const grande = t === fanAt;
    const gift = grande ? sp.regaloGrande : pickGift(r, sp.regalos);
    if (!gift) continue;
    say(r, sp, st, 'regalo', sp.mensajes.regalo);
    give(r, sp, gift, grande, `patrocinador:${sp.id}`);
  }
}

/** An interested sponsor offers one of its deals (if it has none running or on the table). */
function offer(r: Resolver, s: SponsorsState, sp: SponsorData): void {
  const st = s.porId[sp.id]!;
  if (st.retirado || RANK[st.estado]! < 1 || !sp.contratos?.length) return;
  if (s.ofertas.some((o) => o.patrocinadorId === sp.id) || s.contratos.some((d) => d.patrocinadorId === sp.id)) return;
  const deal = pick(r, sp.contratos)!;
  s.ofertas.push({ patrocinadorId: sp.id, contratoId: deal.id });
  const line = pick(r, deal.mensajes.oferta);
  r.emit({ type: 'sponsorDealOffered', patrocinadorId: sp.id, contratoId: deal.id, texto: deal.texto } as unknown as WillyEvent);
  if (line) r.emit({ type: 'sponsorMessage', patrocinadorId: sp.id, patrocinador: sp.nombre, tipo: 'oferta', lineaId: line.id, texto: line.texto, color: sp.color, primeraVez: false } as unknown as WillyEvent);
}

function closeDeal(r: Resolver, s: SponsorsState, d: Deal, met: boolean, why: string): void {
  const sp = sponsorData(d.patrocinadorId);
  const deal = dealData(d.patrocinadorId, d.contratoId);
  s.contratos = s.contratos.filter((x) => x !== d);
  if (!sp || !deal) return;
  if (met) {
    s.cumplidos += 1;
    r.emit({ type: 'sponsorDealCompleted', patrocinadorId: sp.id, contratoId: deal.id } as unknown as WillyEvent);
    const line = pick(r, deal.mensajes.cumplido);
    if (line) r.emit({ type: 'sponsorMessage', patrocinadorId: sp.id, patrocinador: sp.nombre, tipo: 'cumplido', lineaId: line.id, texto: line.texto, color: sp.color, primeraVez: false } as unknown as WillyEvent);
    give(r, sp, deal.recompensa, false, `contrato:${deal.id}`);
    if (deal.recompensa.fichas) grantCoins(r, deal.recompensa.fichas, `contrato:${deal.id}`);
    changeAffinity(r, s, sp, 10);
  } else {
    s.rotos += 1;
    const multa = grantCoins(r, -deal.multa, `multa:${deal.id}`);
    r.emit({ type: 'sponsorDealBroken', patrocinadorId: sp.id, contratoId: deal.id, motivo: why, multa: -multa } as unknown as WillyEvent);
    const line = pick(r, deal.mensajes.roto);
    if (line) r.emit({ type: 'sponsorMessage', patrocinadorId: sp.id, patrocinador: sp.nombre, tipo: 'roto', lineaId: line.id, texto: line.texto, color: sp.color, primeraVez: false } as unknown as WillyEvent);
    changeAffinity(r, s, sp, -10);
  }
}

/** One command's worth of sponsor reactions, from the show's event views. */
export function runSponsors(r: Resolver, views: View[], events: { type: string }[]): void {
  const cfg = showConfig()!.sponsors;
  const s: SponsorsState = clone(sponsorsOf(r.state) ?? fresh());
  const audience = audienceOf(r.state)?.valor ?? 0;
  const willy = r.state.entities[WILLY_ID];
  const charisma = willy ? 1 + 0.05 * attr(willy, 'car') : 1;

  for (const sp of cfg.patrocinadores) {
    const st = s.porId[sp.id] ?? (s.porId[sp.id] = { afinidad: 0, estado: 'neutral', mirando: false, retirado: false, avisado: false, pagados: [], dichos: [] });
    if (audience < sp.audienciaMinima) continue;
    if (!st.mirando) {
      st.mirando = true;
      r.emit({ type: 'sponsorWatching', patrocinadorId: sp.id } as unknown as WillyEvent);
    }
    let delta = 0;
    for (const v of views) {
      for (const g of sp.gusta) if (matchPattern(v, g.patron)) delta += g.afinidad * charisma;
      for (const d of sp.disgusta) if (matchPattern(v, d.patron)) delta += d.afinidad;
    }
    if (delta) changeAffinity(r, s, sp, delta);
  }

  // Deals running: progress, breaking, and the floor's end.
  const floor = currentFloor(r.state);
  for (const d of [...s.contratos]) {
    if (d.piso === undefined && floor !== undefined) d.piso = floor;
    const deal = dealData(d.patrocinadorId, d.contratoId);
    if (!deal) continue;
    if (deal.rompe && views.some((v) => deal.rompe!.some((p) => matchPattern(v, p)))) {
      closeDeal(r, s, d, false, 'roto');
      continue;
    }
    const n = views.filter((v) => deal.cuenta.some((p) => matchPattern(v, p))).length;
    if (n) {
      d.progreso = Math.min(d.cantidad, d.progreso + n);
      r.emit({ type: 'sponsorDealProgress', patrocinadorId: d.patrocinadorId, contratoId: d.contratoId, progreso: d.progreso, cantidad: d.cantidad } as unknown as WillyEvent);
    }
    if (d.progreso >= d.cantidad) closeDeal(r, s, d, true, 'cumplido');
  }
  if (views.some((v) => v.evento === 'floorExited')) {
    for (const d of [...s.contratos]) if (d.piso !== undefined) closeDeal(r, s, d, false, 'plazo');
  }

  // Arriving at a Camerino: the interested sponsors put deals on the table.
  if (events.some((e) => e.type === 'mapChanged') && r.state.map.id.startsWith('camerino')) {
    s.ofertas = [];
    for (const sp of cfg.patrocinadores) offer(r, s, sp);
  }

  r.apply({ type: 'setSystem', system: 'patrocinadores', value: s as unknown as JsonValue });
}

// --- Commands --------------------------------------------------------------------------------

interface DealCommand extends BaseCommand {
  type: 'aceptarContrato' | 'rechazarContrato';
  patrocinadorId: string;
}

/** Runs a show change as a command outside an action (sign or decline a deal). */
function withResolver(state: GameState, ruleset: Parameters<CommandHandler>[2]['ruleset'], f: (r: Resolver, s: SponsorsState) => void): ReturnType<CommandHandler> {
  const rng = new RngCursor(state.rng);
  const r = new Resolver(ruleset, state, rng);
  const s: SponsorsState = clone(sponsorsOf(state) ?? fresh());
  f(r, s);
  r.apply({ type: 'setSystem', system: 'patrocinadores', value: s as unknown as JsonValue });
  return { ok: true, state: { ...r.state, rng: rng.state }, events: r.events };
}

export const aceptarContrato: CommandHandler<DealCommand> = (state, cmd, ctx) => {
  if (!showConfig()) return fail('show_off', 'The show is not configured');
  if (state.entities[WILLY_ID]?.controllerId !== cmd.issuer) return fail('not_controlled', 'Only the player signs deals');
  const s = sponsorsOf(state);
  const o = s?.ofertas.find((x) => x.patrocinadorId === cmd.patrocinadorId);
  if (!s || !o) return fail('no_offer', 'That sponsor has no deal on the table');
  if (s.contratos.length >= MAX_ACTIVE_DEALS) return fail('too_many_deals', 'Too many deals running');
  const deal = dealData(o.patrocinadorId, o.contratoId);
  if (!deal) return fail('no_offer', 'Unknown deal');
  return withResolver(state, ctx.ruleset, (r, st) => {
    st.ofertas = st.ofertas.filter((x) => x.patrocinadorId !== cmd.patrocinadorId);
    const floor = currentFloor(state);
    st.contratos.push({ patrocinadorId: o.patrocinadorId, contratoId: o.contratoId, progreso: 0, cantidad: deal.cantidad, ...(floor !== undefined ? { piso: floor } : {}) });
    r.emit({ type: 'sponsorDealAccepted', patrocinadorId: o.patrocinadorId, contratoId: o.contratoId, cantidad: deal.cantidad } as unknown as WillyEvent);
  });
};

export const rechazarContrato: CommandHandler<DealCommand> = (state, cmd, ctx) => {
  if (!showConfig()) return fail('show_off', 'The show is not configured');
  if (state.entities[WILLY_ID]?.controllerId !== cmd.issuer) return fail('not_controlled', 'Only the player declines deals');
  const s = sponsorsOf(state);
  if (!s?.ofertas.some((x) => x.patrocinadorId === cmd.patrocinadorId)) return fail('no_offer', 'That sponsor has no deal on the table');
  return withResolver(state, ctx.ruleset, (r, st) => {
    st.ofertas = st.ofertas.filter((x) => x.patrocinadorId !== cmd.patrocinadorId);
    r.emit({ type: 'sponsorDealDeclined', patrocinadorId: cmd.patrocinadorId } as unknown as WillyEvent);
  });
};
