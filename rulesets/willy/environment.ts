import { type ActionOutcome, type GameState, type RngCursor, type Ruleset, type SurfaceDef, type SurfaceReaction, OBJECT_TAG, hasCondition, hasTag } from '../../engine';
import { hasTrait } from './character';
import { rollDice } from './dice';
import { Resolver, dealDamage, fallDamage, rollSave, standing } from './resolve';

/**
 * Willy's surfaces (RULESET.md → «Superficies») as engine data, and what they do to whoever
 * steps in or starts a turn on them. Elements: fuego, agua, frio, rayo.
 */
export const SURFACES: Record<string, SurfaceDef> = {
  agua: { label: 'Agua', color: '#2c6a8e' },
  aceite: { label: 'Aceite', hazard: 0.5, color: '#4a3c1c' },
  fuego: { label: 'Fuego', hazard: 4, durationRounds: 3, light: { radius: 3, intensity: 0.9, color: '#ff8a30' }, color: '#e2601e' },
  hielo: { label: 'Hielo', hazard: 1, color: '#bfe4f0' },
  vapor: { label: 'Vapor', durationRounds: 2, color: '#d8dde0' },
  toxico: { label: 'Tóxico', hazard: 2, durationRounds: 4, color: '#7ab03a' },
  electrificada: { label: 'Agua electrificada', hazard: 4, durationRounds: 1, expiresInto: 'agua', light: { radius: 2, intensity: 0.5, color: '#9fd8ff' }, color: '#5ab0e0' },
  canicas: { label: 'Canicas', hazard: 1, color: '#c0a0ff' },
  red: { label: 'Red', hazard: 1, color: '#8a7a5a' },
  expedientes: { label: 'Expedientes', hazard: 1, durationRounds: 3, color: '#efe8d0' },
  gas: { label: 'Gas', hazard: 1, durationRounds: 3, color: '#c8d870' },
};

export const SURFACE_REACTIONS: SurfaceReaction[] = [
  { surface: '', element: 'fuego', result: 'fuego' },
  { surface: 'fuego', element: 'fuego', result: 'fuego' },
  { surface: 'aceite', element: 'fuego', result: 'fuego', spreads: true },
  { surface: 'expedientes', element: 'fuego', result: 'fuego', spreads: true },
  { surface: 'gas', element: 'fuego', result: 'fuego', spreads: true },
  { surface: 'red', element: 'fuego', result: null },
  { surface: 'toxico', element: 'fuego', result: 'fuego' },
  { surface: 'agua', element: 'fuego', result: 'vapor' },
  { surface: 'hielo', element: 'fuego', result: 'agua' },
  { surface: 'fuego', element: 'agua', result: 'vapor' },
  { surface: 'expedientes', element: 'agua', result: null },
  { surface: '', element: 'agua', result: 'agua' },
  { surface: 'agua', element: 'frio', result: 'hielo', spreads: true },
  { surface: 'fuego', element: 'frio', result: null },
  { surface: 'vapor', element: 'frio', result: 'agua' },
  { surface: 'agua', element: 'rayo', result: 'electrificada', spreads: true },
];

/** What a surface does to a creature. Slipping happens only when stepping in. */
export function onSurface(ruleset: Ruleset, state: GameState, id: string, surface: string, trigger: 'enter' | 'turnStart', rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id];
  if (!e || !standing(e)) return r.outcome();
  if (e.tags.includes(OBJECT_TAG)) {
    if (surface === 'fuego' && trigger === 'turnStart') dealDamage(r, id, rollDice(rng, { count: 1, sides: 6, bonus: 0 }), 'fuego', undefined, 'superficie');
    return r.outcome();
  }
  const cond = (condition: string, turns?: number) => {
    if (hasTag(e, `inmune:${condition}`)) return;
    r.apply({ type: 'applyCondition', entityId: id, condition, ...(turns !== undefined ? { remainingTurns: turns } : {}) });
  };
  switch (surface) {
    case 'agua':
      if (hasCondition(e, 'ardiendo')) r.apply({ type: 'removeCondition', entityId: id, condition: 'ardiendo' });
      if (!hasTrait(e, 'pez')) cond('empapado', 2);
      break;
    case 'fuego':
      if (!hasCondition(e, 'empapado')) cond('ardiendo', 2);
      dealDamage(r, id, rollDice(rng, { count: 1, sides: 4, bonus: 0 }), 'fuego', undefined, 'superficie');
      break;
    case 'electrificada':
      dealDamage(r, id, rollDice(rng, { count: 1, sides: 6, bonus: 0 }), 'rayo', undefined, 'superficie');
      if (standing(r.entity(id))) cond('electrocutado', 1);
      break;
    case 'toxico':
      if (!hasTag(e, 'inmune:envenenado') && !hasTrait(e, 'guantes')) cond('envenenado', 3);
      break;
    case 'red':
    case 'expedientes':
      if (trigger === 'enter' || surface === 'expedientes') cond('enredado');
      break;
    case 'aceite':
    case 'canicas':
    case 'hielo':
      if (trigger === 'enter' && !hasTag(e, 'inmune:tumbado') && !rollSave(r, id, 'agi', 13)) {
        cond('tumbado', 1);
        r.emit({ type: 'slipped', entityId: id, surface } as never);
      }
      break;
  }
  return r.outcome();
}

export function onFall(ruleset: Ruleset, state: GameState, id: string, levels: number, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  if (state.entities[id]) fallDamage(r, id, levels);
  return r.outcome();
}
