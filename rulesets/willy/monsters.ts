import { type ActionDef, type ActionPreview, type ActionTarget, type Entity, type GameState, type Vec2, gridDistance, hasCondition, hasTag, isHostile } from '../../engine';
import { HANDLERS, extraActionSources } from './actions';
import { type CompanionAbility, blast, handlerFor } from './companions';
import data from './data/monster-abilities.json';
import { chanceD20, defeatHooks, standing } from './resolve';
import { averageDice, parseDice } from './dice';

/**
 * Enemies' abilities (data/monster-abilities.json): a creature has `habilidad:<id>` tags (the
 * floor generator puts them from floors.json) and gets `mon:<id>` actions, run by the same
 * data-driven handlers as the companions' (attack, support, area, summon, self-destruct). The
 * AI picks them through their previews like any other action. A creature tagged
 * `estalla:<id>` blows up with that ability's blast when it is knocked out.
 */

export const MONSTER_ABILITIES = data.habilidades as unknown as Record<string, Omit<CompanionAbility, 'id'>>;

const ability = (id: string): CompanionAbility | undefined => (MONSTER_ABILITIES[id] ? { id, ...MONSTER_ABILITIES[id]! } : undefined);

// --- How much the AI wants each ability ---------------------------------------------------------
//
// The shared handlers' previews only carry damage. Without more, the AI never spends energy on a
// grab, a scare or a heal for the team: a plain shove scores higher. Each enemy ability's preview
// gets a `utility` too: what its condition is worth on the foes it would reach (times the chance
// it sticks), what it heals or cleanses on the allies around, and what fresh help is worth.

/** What a condition is worth on a foe (or, for buffs, on an ally), roughly in points of damage. */
export const CONDITION_VALUE: Record<string, number> = { aturdido: 9, enredado: 4, asustado: 4, cegado: 4, tumbado: 3, mareado: 3, animado: 1.5 };
const BUFFS = new Set(['animado']);

const around = (s: GameState, actor: Entity, centre: Vec2, radius: number, hostile: boolean) =>
  Object.values(s.entities).filter((o) => standing(o) && !o.tags.includes('object') && isHostile(o, actor) === hostile && gridDistance(o.position, centre) <= radius);

/** A save's bonus as the previews see it (creatures use their to-hit; Willy, his attribute). */
const saveBonusOf = (e: Entity, attrId: string) => (hasTag(e, 'criatura') ? Math.floor((e.stats.ataque ?? 3) / 2) : (e.stats[attrId] ?? 5));

function stickChance(a: CompanionAbility, target: Entity, preview: ActionPreview): number {
  if (a.salvacion) return 1 - chanceD20(saveBonusOf(target, a.salvacion.atributo), a.salvacion.dif);
  return preview.chance ?? 1;
}

export function abilityUtility(s: GameState, actor: Entity, t: ActionTarget, a: CompanionAbility, preview: ActionPreview): number {
  if (!preview.valid) return 0;
  const centre = a.alcance === 0 ? actor.position : (t.tile ?? (t.entityId ? s.entities[t.entityId]?.position : undefined));
  let u = 0;
  const value = a.condicion ? (CONDITION_VALUE[a.condicion] ?? 2) * Math.min(2, a.turnos ?? 1) : 0;
  if (a.tipo === 'ataque' && a.condicion && t.entityId) {
    const target = s.entities[t.entityId];
    if (target && !hasCondition(target, a.condicion)) u += value * stickChance(a, target, preview);
    if (a.tirar && target && gridDistance(target.position, actor.position) > 1) u += 1.5;
  }
  if (a.tipo === 'area' && centre) {
    const hostile = !(a.condicion && BUFFS.has(a.condicion));
    for (const v of around(s, actor, centre, a.radio ?? 0, hostile)) if (a.condicion && !hasCondition(v, a.condicion)) u += value * stickChance(a, v, preview);
  }
  if (a.tipo === 'apoyo' && centre) {
    const allies = (a.radio ?? 0) > 0 || a.alcance === 0 ? around(s, actor, centre, a.radio ?? 0, false) : t.entityId && s.entities[t.entityId] ? [s.entities[t.entityId]!] : [];
    const heal = a.curar ? averageDice(parseDice(a.curar)) : 0;
    for (const ally of allies) {
      const hp = ally.resources.vida;
      if (hp && heal) u += Math.min(heal, hp.max - hp.current) * 1.2;
      for (const c of a.quitar ?? []) if (hasCondition(ally, c)) u += CONDITION_VALUE[c] ?? 2;
      if (a.condicion && !hasCondition(ally, a.condicion) && around(s, ally, ally.position, 6, true).length) u += value;
    }
  }
  if (a.tipo === 'invocar') {
    // Help is worth more the more foes there are and the fewer extras it already has.
    const mine = Object.values(s.entities).filter((e) => hasTag(e, `invocado-por:${actor.id}`) && standing(e)).length;
    const foes = Object.values(s.entities).filter((o) => standing(o) && isHostile(o, actor) && !o.tags.includes('object')).length;
    if (foes) u += Math.max(0, (a.cuantos ?? 1) * 4 - mine * 2);
  }
  return u;
}

for (const id of Object.keys(MONSTER_ABILITIES)) {
  const a = ability(id)!;
  const base = handlerFor(a);
  HANDLERS[`mon:${id}`] = {
    ...base,
    preview: (s, actor, t) => {
      const p = base.preview(s, actor, t);
      const u = abilityUtility(s, actor, t, a, p);
      return u > 0 ? { ...p, utility: (p.utility ?? 0) + u } : p;
    },
  };
}

/** For the AI: enemies with abilities spend their energy (it comes back after each fight). */
export function monsterAiProfile(state: GameState, id: string): { scarcity: number } | undefined {
  const e = state.entities[id];
  return e && e.tags.some((t) => t.startsWith('habilidad:')) ? { scarcity: 0.4 } : undefined;
}

export function monsterActions(state: GameState, e: Entity): ActionDef[] {
  const ids = e.tags.filter((t) => t.startsWith('habilidad:')).map((t) => t.slice('habilidad:'.length));
  return ids.flatMap((id) => {
    const a = ability(id);
    const h = HANDLERS[`mon:${id}`];
    if (!a || !h) return [];
    const target = typeof h.target === 'function' ? h.target(e, state) : h.target;
    return [{ id: `mon:${id}`, label: a.nombre, description: a.texto, cost: { acciones: a.coste.acciones, ...(a.coste.energia ? { energia: a.coste.energia } : {}) }, target, tags: ['ability', ...h.tags] }];
  });
}

extraActionSources.push(monsterActions);

defeatHooks.push((r, id) => {
  const e = r.entity(id);
  const how = e.tags.find((t) => t.startsWith('estalla:'))?.slice('estalla:'.length);
  const a = how ? ability(how) : undefined;
  if (a && hasTag(e, 'criatura')) blast(r, id, a);
});
