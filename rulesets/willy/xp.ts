import { type Entity, hasTag, isHostile, tagValue } from '../../engine';
import { ATTRS, classOf, level } from './character';
import { CLASSES, type Attr } from './data';
import { MAX_LEVEL, levelForXp, levelUpEffects } from './progression';
import { type Resolver, type WillyEvent, defeatHooks, standing } from './resolve';

/**
 * Experience: every foe that falls gives its `xp:<n>` (the floor generator scales it per floor)
 * to the contestants of the other side (Willy; companions level with him). Crossing a threshold
 * levels Willy up on the spot: +1 level, +2 attribute points, +3 max health, 25 % health back,
 * full energy, and the class's new passives. The points go where the class is strongest, like
 * «Que elija el Narrador» (the client can offer the choice later: RULESET.md → «Progresión»).
 */

/** Two points for a level-up, to the class's two best attributes (or alternating, from level 2). */
export function autoPoints(e: Entity): Partial<Record<Attr, number>> {
  const cls = CLASSES[classOf(e) ?? ''];
  const order = cls
    ? (Object.entries(cls.atributos as Record<string, number>) as [Attr, number][]).sort((a, b) => b[1] - a[1]).map(([a]) => a)
    : (['fue', 'agu'] as Attr[]);
  const best = [...order, ...ATTRS].filter((a, i, all) => all.indexOf(a) === i);
  return { [best[0]!]: 1, [best[1]!]: 1 } as Partial<Record<Attr, number>>;
}

export function gainXp(r: Resolver, entityId: string, amount: number): void {
  const e = r.entity(entityId);
  if (!e.resources.xp || amount <= 0) return;
  const before = e.resources.xp.current;
  r.apply({ type: 'modifyResource', entityId, resource: 'xp', delta: amount });
  r.emit({ type: 'xpGained', entityId, amount } as WillyEvent);
  let lvl = level(e);
  const target = Math.min(MAX_LEVEL, levelForXp(before + amount));
  while (lvl < target) {
    const now = r.entity(entityId);
    r.apply(...levelUpEffects(now, autoPoints(now)));
    lvl += 1;
    // Passive class abilities that unlock at this level become traits.
    const cls = CLASSES[classOf(now) ?? ''];
    const passives = (cls?.habilidades ?? []).filter((h) => h.pasiva && h.nivelPersonaje === lvl).map((h) => `rasgo:${h.id}`);
    if (passives.length) r.apply({ type: 'setEntity', entityId, addTags: passives });
    const unlocked = (cls?.habilidades ?? []).filter((h) => h.nivelPersonaje === lvl).map((h) => h.id);
    r.emit({ type: 'levelUp', entityId, nivel: lvl, desbloquea: unlocked } as WillyEvent);
  }
}

defeatHooks.push((r, id) => {
  const fallen = r.entity(id);
  const xp = Number(tagValue(fallen, 'xp') ?? 0);
  if (!xp) return;
  for (const e of Object.values(r.state.entities)) {
    if (hasTag(e, 'pc') && standing(e) && isHostile(e, fallen)) gainXp(r, e.id, xp);
  }
});
