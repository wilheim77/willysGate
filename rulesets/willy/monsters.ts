import { type ActionDef, type Entity, type GameState, hasTag } from '../../engine';
import { HANDLERS, extraActionSources } from './actions';
import { type CompanionAbility, blast, handlerFor } from './companions';
import data from './data/monster-abilities.json';
import { defeatHooks } from './resolve';

/**
 * Enemies' abilities (data/monster-abilities.json): a creature has `habilidad:<id>` tags (the
 * floor generator puts them from floors.json) and gets `mon:<id>` actions, run by the same
 * data-driven handlers as the companions' (attack, support, area, summon, self-destruct). The
 * AI picks them through their previews like any other action. A creature tagged
 * `estalla:<id>` blows up with that ability's blast when it is knocked out.
 */

export const MONSTER_ABILITIES = data.habilidades as unknown as Record<string, Omit<CompanionAbility, 'id'>>;

const ability = (id: string): CompanionAbility | undefined => (MONSTER_ABILITIES[id] ? { id, ...MONSTER_ABILITIES[id]! } : undefined);

for (const id of Object.keys(MONSTER_ABILITIES)) HANDLERS[`mon:${id}`] = handlerFor(ability(id)!);

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
