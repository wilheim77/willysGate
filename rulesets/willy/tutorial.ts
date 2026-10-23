import type { ActionOutcome, Effect, GameEvent, GameState, RngCursor, Ruleset } from '../../engine';
import { type Pattern, type View, eventViews, matchPattern } from './show/patterns';

/**
 * The integrated tutorial (content/willy/tutorial.json, docs/willy/DESIGN.md §13), as rules: each
 * step fires once per run, the first time its trigger happens, and is remembered in the state
 * (flag `tutorial:<id>`) so it survives saves and drives the locks. Triggers speak the same event
 * vocabulary as achievements and sponsors (show/patterns.ts), plus:
 * - `tutorialDone { id }`: the command after that step fired (chained steps);
 * - `combatEnded { resultado }` and `bossFight` (a fight with a boss in it starts).
 * `despues` (a step id) only lets a step fire after that one; `noSiHecho` skips it if that one
 * already fired; `condicion.dato` supports `willy.vidaPct` (with min/max).
 *
 * One step per command, in file order; the event `tutorialStep { id, texto }` is what the client
 * shows (GameDefinition.tutorial). Locks (`bloqueosIniciales`: a system or HUD piece → the step
 * that turns it on) only apply on the first floor: `tutorialUnlocked(state, key)`.
 */

export interface TutorialStepData {
  id: string;
  texto: string[];
  disparador?: Pattern;
  despues?: string;
  noSiHecho?: string;
  condicion?: { dato: string; min?: number; max?: number };
}

export interface TutorialData {
  bloqueosIniciales: Record<string, string>;
  pasos: TutorialStepData[];
}

let DATA: TutorialData | undefined;

export function configureTutorial(data: TutorialData): void {
  DATA = data;
}

export const tutorialFlag = (id: string) => `tutorial:${id}`;
/** Steps fired by the previous command, for `tutorialDone` triggers. */
const LAST_FLAG = 'tutorial:ultimo';

/** Is this system or HUD piece on? Everything is, outside the first floor or without a tutorial. */
export function tutorialUnlocked(state: GameState, key: string): boolean {
  const step = DATA?.bloqueosIniciales[key];
  if (!step || key.startsWith('$')) return true;
  const floor = (state.systems.planta as unknown as { numero?: number } | undefined)?.numero;
  if (floor !== 1 || !state.map.id.startsWith('planta-')) return true;
  return state.flags[tutorialFlag(step)] === true;
}

function conditionHolds(state: GameState, c: TutorialStepData['condicion']): boolean {
  if (!c) return true;
  if (c.dato === 'willy.vidaPct') {
    const v = state.entities.willy?.resources.vida;
    if (!v || !v.max) return false;
    const pct = (100 * v.current) / v.max;
    return (c.min === undefined || pct >= c.min) && (c.max === undefined || pct <= c.max);
  }
  return true;
}

export function tutorialAfterCommand(_ruleset: Ruleset, state: GameState, events: GameEvent[], _rng: RngCursor): ActionOutcome {
  if (!DATA) return { effects: [], events: [] };
  const views: View[] = eventViews(events, state);
  for (const e of events) {
    const f = e as unknown as Record<string, unknown>;
    if (e.type === 'combatEnded') views.push({ evento: 'combatEnded', resultado: f.winner === state.entities.willy?.factionId ? 'victoria' : 'derrota' });
    if (e.type === 'combatStarted') {
      const ids = (f.participants as string[] | undefined) ?? state.turn.order;
      if (ids.some((id) => state.entities[id]?.tags.includes('jefe'))) views.push({ evento: 'bossFight' });
    }
  }
  const last = String(state.flags[LAST_FLAG] ?? '');
  if (last) views.push({ evento: 'tutorialDone', id: last });

  const effects: Effect[] = [];
  const out: GameEvent[] = [];
  if (last) effects.push({ type: 'setFlag', flag: LAST_FLAG, value: '' });
  const done = (id: string) => state.flags[tutorialFlag(id)] === true;
  for (const step of DATA.pasos) {
    if (!step.disparador || done(step.id)) continue;
    if (step.despues && !done(step.despues)) continue;
    if (step.noSiHecho && done(step.noSiHecho)) continue;
    if (!views.some((v) => matchPattern(v, step.disparador!)) || !conditionHolds(state, step.condicion)) continue;
    effects.push({ type: 'setFlag', flag: tutorialFlag(step.id), value: true }, { type: 'setFlag', flag: LAST_FLAG, value: step.id });
    out.push({ type: 'tutorialStep', id: step.id, texto: step.texto.join('\n\n') } as GameEvent);
    break;
  }
  return { effects, events: out };
}
