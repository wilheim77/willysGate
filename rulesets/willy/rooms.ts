import { type ActionOutcome, type GameEvent, type GameState, type JsonValue, type RngCursor, type Ruleset, hasTag } from '../../engine';

/**
 * `roomEntered { rol: 'jefe', jefeId, visita }`: Willy walking into a planet boss's room. The
 * boss's room is an auto-fight zone, so it shows as the fight starting (`combatStarted`) with
 * the boss in the order. Two things read it: the tutorial's boss step (tutorial.json →
 * t24-jefe) and the Narrador's boss introductions (narrator/combate.json → jefeEntrada).
 * `visita` counts how many times this boss has been met in the run (the second time gets
 * different words). A floor's guardian (an elite, not a boss) doesn't count.
 */
export function roomsAfterCommand(_ruleset: Ruleset, state: GameState, events: GameEvent[], _rng: RngCursor): ActionOutcome {
  const out: ActionOutcome = { effects: [], events: [] };
  const started = events.find((e) => e.type === 'combatStarted') as (GameEvent & { order?: string[] }) | undefined;
  if (!started?.order) return out;
  const boss = started.order.map((id) => state.entities[id]).find((e) => e && hasTag(e, 'jefe') && !hasTag(e, 'guardian'));
  if (!boss) return out;
  const seen = { ...((state.systems.jefesVistos as unknown as Record<string, number> | undefined) ?? {}) };
  seen[boss.id] = (seen[boss.id] ?? 0) + 1;
  out.events.push({ type: 'roomEntered', rol: 'jefe', jefeId: boss.id, visita: seen[boss.id] } as unknown as GameEvent);
  out.effects.push({ type: 'setSystem', system: 'jefesVistos', value: seen as unknown as JsonValue });
  return out;
}
