import type { BaseCommand, GameEvent, GameState } from '../../engine';
import { show } from '../../rulesets/willy';
import type { FloatView, HudExtension, MeterView, PanelSection, ToastView } from '../../src/game/definition';
import cast from './data/cast.json';
import itemsData from './data/items.json';
import loot from './data/loot-tables.json';
import { SHOW } from './show';
import T from './texts/show.json';
import { viewers } from './format';

export { viewers };

/**
 * The show's HUD for the generic client (GameDefinition.hud): the audience counter (tap it for
 * the sponsors), the presenter's Share on the last floor, «+audiencia» floating over whoever
 * caused it, sponsor bubbles, and the sponsors panel with tastes and deals. Pure views over the
 * state: no DOM here.
 */

const ITEM_NAMES: Record<string, string> = Object.fromEntries(itemsData.items.map((i) => [i.id, i.nombre]));

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

const tierName = (v: number) => SHOW.audience.tramos.reduce((name, t) => (v >= t.desde ? t.nombre : name), SHOW.audience.tramos[0]!.nombre);
const boxName = (caja: string) => (T.caja as Record<string, string>)[caja] ?? caja;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

function nextMilestone(v: number) {
  return loot.fuentes.hitosAudiencia.find((h) => h.espectadores > v);
}

function meters(state: GameState): MeterView[] {
  const a = show.audienceOf(state) ?? { valor: SHOW.audience.inicial };
  const out: MeterView[] = [];
  if (state.entities.willy) {
    const next = nextMilestone(a.valor);
    const prev = [...loot.fuentes.hitosAudiencia].reverse().find((h) => h.espectadores <= a.valor)?.espectadores ?? 0;
    out.push({
      id: 'audiencia',
      icon: '📺',
      value: viewers(a.valor),
      label: tierName(a.valor),
      fill: next ? (a.valor - prev) / (next.espectadores - prev) : 1,
      color: '#ffd24a',
      title: fill(T.audienciaTitulo, { valor: a.valor.toLocaleString('es-ES'), tramo: tierName(a.valor) }),
      opensPanel: true,
    });
  }
  const share = show.shareOf(state);
  const boss = state.entities[SHOW.share.jefeId];
  if (share && boss && !boss.conditions.some((c) => c.id === 'eliminado')) {
    out.push({ id: 'share', icon: '🧛', value: `${share.valor}`, label: T.share, fill: share.valor / share.max, color: '#c0406a', title: fill(T.shareTitulo, { presentador: cast.presentador.nombre }) });
  }
  return out;
}

function float(event: GameEvent, _state: GameState): FloatView | null {
  if (event.type !== 'audienceChanged') return null;
  const e = event as unknown as { delta: number; entityId?: string };
  if (!e.delta) return null;
  const delta = `${e.delta > 0 ? '+' : '−'}${viewers(Math.abs(e.delta))}`;
  return { ...(e.entityId ? { entityId: e.entityId } : {}), text: fill(T.flotaAudiencia, { delta }), color: e.delta > 0 ? '#ffd24a' : '#c79a9a' };
}

function giftName(e: { item?: string; caja?: string }): string {
  return e.item ? (ITEM_NAMES[e.item] ?? e.item) : e.caja ? boxName(e.caja) : '';
}

function toast(event: GameEvent, _state: GameState): ToastView | null {
  const e = event as unknown as Record<string, unknown>;
  switch (event.type) {
    case 'sponsorMessage': {
      const tipo = String(e.tipo);
      const name = String(e.patrocinador);
      const title = tipo === 'cumplido' ? `${T.contratoCumplido} · ${name}` : tipo === 'roto' ? `${T.contratoRoto} · ${name}` : name;
      return { title, text: String(e.texto), color: String(e.color ?? '#ffd24a'), badge: initials(name) };
    }
    case 'sponsorGift': {
      const sp = show.sponsorData(String(e.patrocinadorId));
      return { title: fill(T.regaloTitulo, { patrocinador: sp?.nombre ?? '' }), text: fill(T.regaloTexto, { regalo: giftName(e as { item?: string; caja?: string }) }), color: sp?.color ?? '#ffd24a', badge: '🎁' };
    }
    case 'sponsorDealBroken': {
      const n = Number(e.multa ?? 0);
      if (!n) return null;
      const sp = show.sponsorData(String(e.patrocinadorId));
      return { title: `${T.contratoRoto} · ${sp?.nombre ?? ''}`, text: fill(T.multa, { n }), color: sp?.color ?? '#ff5577', badge: '−' };
    }
    case 'audienceMilestone':
      return { title: T.hitoTitulo, text: fill(T.hitoTexto, { valor: viewers(Number(e.espectadores)), caja: boxName(String(e.caja)) }), color: '#ffd24a', badge: '📺' };
    case 'audienceBonus':
      return { title: T.primaTitulo, text: fill(T.primaTexto, { valor: viewers(Number(e.espectadores)), caja: boxName(String(e.caja)) }), color: '#ffd24a', badge: '📦' };
    default:
      return null;
  }
}

function rewardText(r: { item?: string; caja?: string; fichas?: number }): string {
  const parts = [giftName(r), r.fichas ? fill(T.fichas, { n: r.fichas }) : ''].filter(Boolean);
  return parts.join(' + ');
}

function sections(state: GameState, issuer: string): PanelSection[] {
  const a = show.audienceOf(state);
  const s = show.sponsorsOf(state);
  const out: PanelSection[] = [];
  const valor = a?.valor ?? SHOW.audience.inicial;
  const next = nextMilestone(valor);
  out.push({
    title: T.audiencia,
    badge: '📺',
    color: '#ffd24a',
    lines: [
      next
        ? fill(T.audienciaResumen, { valor: viewers(valor), tramo: tierName(valor), minimo: viewers(show.floorMinimum(state)), hito: viewers(next.espectadores), caja: boxName(next.caja) })
        : fill(T.audienciaSinHito, { valor: viewers(valor), tramo: tierName(valor), minimo: viewers(show.floorMinimum(state)) }),
      ...(s ? [fill(T.resumen, { cumplidos: s.cumplidos, rotos: s.rotos })] : []),
    ],
  });
  const rules = SHOW.sponsors.reglas.afinidad;
  for (const sp of SHOW.sponsors.patrocinadores) {
    const st = s?.porId[sp.id];
    const afinidad = st?.afinidad ?? rules.inicial;
    const watching = valor >= sp.audienciaMinima;
    const estado = st?.retirado ? T.retirado : !watching ? fill(T.noMira, { min: viewers(sp.audienciaMinima) }) : (T.estados as Record<string, string>)[st?.estado ?? 'neutral'] ?? '';
    const tastes = (sp as unknown as { gustosTexto?: { gusta: string[]; disgusta: string[] } }).gustosTexto;
    const lines = tastes ? [fill(T.leGusta, { lista: tastes.gusta.join(', ').toLowerCase() }), fill(T.noLeGusta, { lista: tastes.disgusta.join(', ').toLowerCase() })] : [];
    const actions: PanelSection['actions'] = [];
    const offer = s?.ofertas.find((o) => o.patrocinadorId === sp.id);
    const deal = offer && show.dealData(sp.id, offer.contratoId);
    if (deal) {
      lines.push(fill(T.oferta, { texto: deal.texto }), fill(T.premio, { premio: rewardText(deal.recompensa), multa: deal.multa }));
      if ((s?.contratos.length ?? 0) >= show.MAX_ACTIVE_DEALS) lines.push(fill(T.tope, { max: show.MAX_ACTIVE_DEALS }));
      else actions.push({ label: T.aceptar, primary: true, command: { type: 'aceptarContrato', issuer, patrocinadorId: sp.id } as BaseCommand });
      actions.push({ label: T.rechazar, command: { type: 'rechazarContrato', issuer, patrocinadorId: sp.id } as BaseCommand });
    }
    const running = s?.contratos.find((d) => d.patrocinadorId === sp.id);
    const runningDeal = running && show.dealData(sp.id, running.contratoId);
    if (running && runningDeal) lines.push(`${fill(T.enCurso, { texto: runningDeal.texto })} (${fill(T.progreso, { hecho: running.progreso, total: running.cantidad })})`);
    out.push({
      title: sp.nombre,
      subtitle: `${sp.lema} · ${estado}`,
      badge: initials(sp.nombre),
      color: sp.color,
      bar: { fill: (afinidad - rules.min) / (rules.max - rules.min), label: fill(T.afinidad, { valor: Math.round(afinidad) }), color: sp.color },
      lines,
      actions,
    });
  }
  return out;
}

export const willyHud: HudExtension = {
  meters,
  float,
  toast,
  panel: {
    icon: '📣',
    title: T.panelTitulo,
    sections,
    badge: (state) => show.sponsorsOf(state)?.ofertas.length ?? 0,
  },
};
