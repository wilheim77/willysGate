import type { GameEvent, GameState } from '../../engine';
import type { TutorialStep } from '../../src/game/tutorialStep';
import raw from './tutorial.json';

/**
 * Willy's integrated tutorial for the generic client (GameDefinition.tutorial and
 * .tutorialLocks). The texts, the order and the locks come from tutorial.json (the design:
 * docs/willy/DESIGN.md → «Tutorial integrado»); the triggers are wired here against the
 * events the game really emits, since the JSON's `disparador`/`zona`/`completar` describe a
 * hand-made Planta 1 («p1-calle-de-willy», markers, scripted box) that no longer exists:
 * floors are generated now, and a run starts in the Camerino.
 *
 * Left out: t04-casting (the casting happens before the first map), t21-cofres (nothing
 * emits «a chest came into view») and t27-atasco (no idle-time event). The JSON's
 * `sistema.*` locks (clock, sponsors, boxes, traps, chests switched off until their step)
 * are not enforced either: they'd be rules, and nothing in the rulesets reads them. Only the
 * `hud.*` ones are, as GameDefinition.tutorialLocks.
 */

interface RawStep {
  id: string;
  texto: string[];
  autoCerrarSegundos?: number;
}

const RAW = new Map((raw.pasos as RawStep[]).map((p) => [p.id, p]));

type Trigger = TutorialStep['trigger'];

function step(id: string, trigger: Trigger, extra: Partial<Pick<TutorialStep, 'after' | 'check'>> = {}): TutorialStep {
  const p = RAW.get(id);
  if (!p) throw new Error(`tutorial.json has no step "${id}"`);
  return { id, trigger, text: p.texto, ...(p.autoCerrarSegundos ? { autoCloseSeconds: p.autoCerrarSegundos } : {}), ...extra };
}

const willyMoves: Trigger = { event: 'entityMoved', match: { entityId: 'willy' } };
const willyTurn: Trigger = { event: 'turnStarted', match: { entityId: 'willy' } };
const isBossFight = (e: GameEvent): boolean => (((e as unknown as { order?: string[] }).order ?? []).some((id) => id.startsWith('jefe-')));

/** Below half health, having just lost some. */
function hurtBelowHalf(e: GameEvent, state: GameState): boolean {
  const { from, to } = e as unknown as { from: number; to: number };
  const max = state.entities.willy?.resources.vida?.max ?? 0;
  return to < from && max > 0 && to <= max / 2;
}

/** In the order they are meant to appear; an event shows at most one step. */
export const tutorial: TutorialStep[] = [
  // The Camerino, before the first floor.
  step('t01-moverse', { onMap: 'camerino' }),
  step('t03-audiencia', willyMoves, { after: ['t01-moverse'] }),
  step('t02-camara', willyMoves, { after: ['t03-audiencia'] }),
  // Floor 1: the party, then the clock on the first step.
  step('t05-atributos', { event: 'floorEntered' }),
  step('t15-reloj', willyMoves, { after: ['t05-atributos'] }),
  // First fight.
  step('t06-combate', { event: 'combatStarted' }, { check: (e) => !isBossFight(e) }),
  step('t07-atacar', willyTurn, { after: ['t06-combate'] }),
  step('t08-empujar', willyTurn, { after: ['t07-atacar'] }),
  step('t09-altura', { event: 'entityFell' }),
  step('t10-logro', { event: 'achievementUnlocked' }),
  step('t11-caja', { event: 'boxDelivered' }),
  step('t12-mochila', { event: 'boxOpened' }),
  step('t13-superficies', { event: 'surfaceChanged' }),
  step('t14-patrocinador', { event: 'sponsorMessage' }),
  // Whenever it comes up.
  step('t16-nivel', { event: 'levelUp' }),
  step('t17-habilidades', { event: 'skillUsed', match: { entityId: 'willy' } }),
  step('t18-condiciones', { event: 'conditionApplied', match: { entityId: 'willy' } }, { check: (e) => !['eliminado', 'dead'].includes(String((e as unknown as { condition?: string }).condition)) }),
  step('t19-curarse', { event: 'resourceChanged', match: { entityId: 'willy', resource: 'vida' } }, { check: hurtBelowHalf }),
  step('t20-trampas', { event: 'trapSpotted' }),
  step('t20b-trampas-pisada', { event: 'trapTriggered', match: { entityId: 'willy' } }),
  step('t22-aburrimiento', { event: 'audienceChanged', match: { causa: 'aburrimiento' } }),
  step('t23-reloj-mitad', { event: 'clockWarning', match: { pct: 50 } }),
  step('t24-jefe', { event: 'combatStarted' }, { check: isBossFight }),
  step('t25-camerino', { event: 'safeZoneEntered' }),
  step('t26-glosario', willyMoves, { after: ['t25-camerino'] }),
];

/** `hud.<x>` in tutorial.json → the <body data-locks> id src/style.css hides («atributos» is the party bar). */
const HUD_IDS: Record<string, string> = { atributos: 'grupo' };

export const tutorialLocks: Record<string, string> = Object.fromEntries(
  Object.entries(raw.bloqueosIniciales as Record<string, string>)
    .filter(([key]) => key.startsWith('hud.'))
    .map(([key, stepId]) => {
      const name = key.slice(4);
      return [`hud-${HUD_IDS[name] ?? name}`, stepId];
    }),
);
