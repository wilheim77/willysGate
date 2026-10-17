import type { Effect, Entity } from '../../engine';
import { ATTRS, level } from './character';
import type { Attr } from './data';

/** XP needed for each level (RULESET.md → «Experiencia y niveles»). Index = level. */
export const XP_FOR_LEVEL = [0, 0, 60, 160, 320, 550, 850, 1250, 1750, 2350, 3050, 3900, 4900];
export const MAX_LEVEL = 12;

/** Level an XP total gives. */
export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) if (xp >= XP_FOR_LEVEL[l]!) lvl = l;
  return lvl;
}

/**
 * Effects of one level-up: +1 level, +2 attribute points (where the player put them),
 * +3 max health, 25 % of max health back and full energy. Uses the engine's modifyStat (R19).
 * Even levels also offer a perk and levels 3/6/9 unlock a class ability: the game shows those.
 */
export function levelUpEffects(e: Entity, points: Partial<Record<Attr, number>>): Effect[] {
  const spent = Object.values(points).reduce((s, v) => s + (v ?? 0), 0);
  if (spent !== 2 || Object.keys(points).some((k) => !(ATTRS as string[]).includes(k))) throw new Error('willy: a level-up spends exactly 2 attribute points');
  if (level(e) >= MAX_LEVEL) throw new Error('willy: already at the top level');
  const effects: Effect[] = [{ type: 'modifyStat', entityId: e.id, stat: 'nivel', delta: 1 }];
  for (const [a, v] of Object.entries(points)) if (v) effects.push({ type: 'modifyStat', entityId: e.id, stat: a, delta: v });
  effects.push({ type: 'modifyResourceMax', entityId: e.id, resource: 'vida', delta: 3 });
  const vida = e.resources.vida;
  if (vida) effects.push({ type: 'modifyResource', entityId: e.id, resource: 'vida', delta: Math.ceil((vida.max + 3) / 4) });
  const energia = e.resources.energia;
  if (energia) effects.push({ type: 'modifyResource', entityId: e.id, resource: 'energia', delta: energia.max - energia.current });
  return effects;
}
