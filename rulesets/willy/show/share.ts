import type { GameEvent, GameState, JsonValue } from '../../../engine';
import { type Resolver, type WillyEvent, heal, preventDefeatHooks, standing } from '../resolve';
import { audienceOf, changeAudience, floorMinimum } from './audience';
import { WILLY_ID, clone, showConfig } from './config';

/**
 * The presenter's Share (floors.json → jefe-presentador → medidorShare): his own audience,
 * 0-100, starting at 50. While it is above 0 he cannot drop below 1 health («en antena»).
 * Every audience gain Willy makes while he is on the map drains it (1 point per 1 % gained, at
 * least 1); every loss, every wait and every hit he lands on Willy refills it. At the start of
 * his turn the audience votes (votoPorRonda × Willy's audience over the planta's minimum, up
 * to ×4, comes off the Share) and then he heals Share ÷ 10. The «mordisco de share» (event shareStolen { pct }) moves that
 * share of Willy's audience into his meter.
 *
 * state.systems.share = { valor, max }. Events: meterChanged { medidor: 'share', de, a,
 * entityId }, shareCero { entityId }, enAntena { entityId }.
 */

export interface ShareState {
  valor: number;
  max: number;
}

export function shareOf(state: GameState): ShareState | undefined {
  return state.systems.share as unknown as ShareState | undefined;
}

function bossOf(state: GameState) {
  const id = showConfig()?.share.jefeId;
  const boss = id ? state.entities[id] : undefined;
  return boss && standing(boss) ? boss : undefined;
}

function setShare(r: Resolver, s: ShareState, value: number, bossId: string): void {
  const before = s.valor;
  s.valor = Math.max(0, Math.min(s.max, Math.round(value)));
  if (s.valor === before) return;
  r.emit({ type: 'meterChanged', medidor: 'share', de: before, a: s.valor, max: s.max, entityId: bossId } as unknown as WillyEvent);
  if (s.valor === 0) r.emit({ type: 'shareCero', entityId: bossId } as unknown as WillyEvent);
}

/** Runs after the audience for the same command. `emitted` are the show's own events so far. */
export function runShare(r: Resolver, events: GameEvent[], emitted: GameEvent[]): void {
  const cfg = showConfig()!.share;
  const boss = bossOf(r.state);
  if (!boss) return;
  const s: ShareState = clone(shareOf(r.state) ?? { valor: cfg.inicial, max: cfg.max });
  const fresh = !shareOf(r.state);
  let value = s.valor;

  for (const e of emitted) {
    const f = e as unknown as { type: string; delta?: number; deltaPct?: number };
    if (f.type !== 'audienceChanged') continue;
    if ((f.delta ?? 0) > 0) value -= Math.max(1, f.deltaPct ?? 0);
    else value += cfg.subePorPerdida;
  }
  for (const e of events) {
    const f = e as unknown as Record<string, unknown>;
    if (e.type === 'attackRolled' && f.attackerId === boss.id && f.targetId === WILLY_ID && f.hit) value += cfg.subePorGolpe;
    if (e.type === 'shareStolen') {
      const pct = Number(f.pct ?? 0);
      const a = audienceOf(r.state);
      if (a && pct > 0) {
        const copy = clone(a);
        changeAudience(r, copy, (-copy.valor * pct) / 100, 'mordisco');
        r.apply({ type: 'setSystem', system: 'audiencia', value: copy as unknown as JsonValue });
      }
      value += pct;
    }
  }
  setShare(r, s, value, boss.id);

  // His turn: the audience votes (Willy's viewers drain the Share), then he heals Share ÷ 10.
  if (events.some((e) => e.type === 'turnStarted' && (e as unknown as { entityId: string }).entityId === boss.id)) {
    const a = audienceOf(r.state);
    const min = Math.max(1, floorMinimum(r.state));
    const votes = Math.round(cfg.votoPorRonda * Math.min(4, (a?.valor ?? 0) / min));
    if (votes > 0 && s.valor > 0) {
      r.emit({ type: 'audienceVote', entityId: boss.id, votos: votes } as unknown as WillyEvent);
      setShare(r, s, s.valor - votes, boss.id);
    }
    if (s.valor > 0) heal(r, boss.id, Math.floor(s.valor / cfg.curacionDivisor));
  }
  if (fresh || s.valor !== shareOf(r.state)?.valor) r.apply({ type: 'setSystem', system: 'share', value: s as unknown as JsonValue });
}

// «Inmortal»: while he has Share, he stays on the air at 1 health. Every blow that would have
// finished him is spectacle too: it drains `drenajeEnAntena` of Share, and the one that empties
// it takes him off the air for good (floors.json: «hay que vaciar el Share con espectáculo»).
preventDefeatHooks.push((r, id) => {
  const cfg = showConfig();
  if (!cfg || id !== cfg.share.jefeId) return false;
  const s: ShareState = clone(shareOf(r.state) ?? { valor: cfg.share.inicial, max: cfg.share.max });
  if (s.valor <= 0) return false;
  setShare(r, s, s.valor - cfg.share.drenajeEnAntena, id);
  r.apply({ type: 'setSystem', system: 'share', value: s as unknown as JsonValue });
  if (s.valor <= 0) return false;
  r.emit({ type: 'enAntena', entityId: id, share: s.valor } as unknown as WillyEvent);
  return true;
});
