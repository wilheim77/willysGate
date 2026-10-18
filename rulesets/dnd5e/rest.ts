import { type GameEvent, type GameState, type ResourceDef, type RngCursor, type Ruleset, hasCondition } from '../../engine';
import { abilityModifier } from './abilities';
import { CLASSES } from './data';
import { Resolver, heal } from './resolve';

/**
 * 5e rests (SRD 5.1), started by the engine's `rest` dialogue effect.
 * - short: spend hit dice (1dHD + CON each) until about 75 % HP or none left; refresh
 *   short-rest resources; a wizard's Arcane Recovery once per long rest.
 * - long: full HP, every long- and short-rest resource, half the hit dice back, conditions gone.
 * In both, a party member who is down but alive comes round.
 */
export interface RestEvent extends GameEvent {
  type: 'restRecovered';
  entityId: string;
  hp: number;
  hitDiceSpent: number;
  slots: number;
}

const KEEP_CONDITIONS = new Set(['dead']);

export function onRest(ruleset: Ruleset, resources: Record<string, ResourceDef>, state: GameState, partyIds: string[], kind: string, rng: RngCursor): { effects: never[]; events: GameEvent[] } {
  const r = new Resolver(ruleset, state, rng);
  const long = kind === 'long';
  const refreshes = (refresh: string | undefined) => refresh === 'shortRest' || (long && refresh === 'longRest');
  for (const id of partyIds) {
    const e0 = r.entity(id);
    if (!e0 || hasCondition(e0, 'dead') || !e0.resources.hp) continue;
    if (hasCondition(e0, 'downed')) heal(r, id, 1);
    let e = r.entity(id);
    const before = e.resources.hp!.current;
    let spent = 0;
    let slots = 0;

    if (long) {
      const hp = e.resources.hp!;
      if (hp.current < hp.max) r.apply({ type: 'modifyResource', entityId: id, resource: 'hp', delta: hp.max - hp.current });
      for (const c of e.conditions.map((x) => x.id)) if (!KEEP_CONDITIONS.has(c)) r.apply({ type: 'removeCondition', entityId: id, condition: c });
      const hd = e.resources.hit_dice;
      if (hd && hd.current < hd.max) r.apply({ type: 'modifyResource', entityId: id, resource: 'hit_dice', delta: Math.min(hd.max - hd.current, Math.max(1, Math.floor(hd.max / 2))) });
    } else {
      // Hit dice: the class die plus CON, one at a time, while it is worth it.
      const classId = e.tags.find((t) => t.startsWith('class:'))?.slice(6);
      const die = classId ? CLASSES[classId]?.hitDie : undefined;
      const con = abilityModifier(Number(e.stats.con ?? 10));
      while (die && (e.resources.hit_dice?.current ?? 0) > 0 && e.resources.hp!.current < Math.ceil(e.resources.hp!.max * 0.75)) {
        const gain = Math.max(1, rng.die(die) + con);
        r.apply({ type: 'modifyResource', entityId: id, resource: 'hit_dice', delta: -1 });
        heal(r, id, gain);
        spent++;
        e = r.entity(id);
      }
      // Arcane Recovery: spell slot levels up to half the wizard level (rounded up), once per long rest.
      if (e.tags.includes('feature:arcane_recovery') && (e.resources.arcane_recovery?.current ?? 0) > 0) {
        let budget = Math.ceil(Number(e.stats.level ?? 1) / 2);
        for (let level = Math.min(3, budget); level >= 1 && budget > 0; level--) {
          const pool = r.entity(id).resources[`spell_slot_${level}`];
          while (pool && budget >= level && r.entity(id).resources[`spell_slot_${level}`]!.current < pool.max) {
            r.apply({ type: 'modifyResource', entityId: id, resource: `spell_slot_${level}`, delta: 1 });
            budget -= level;
            slots += level;
          }
        }
        if (slots > 0) r.apply({ type: 'modifyResource', entityId: id, resource: 'arcane_recovery', delta: -1 });
      }
    }

    // Everything else that comes back with this rest.
    e = r.entity(id);
    for (const [res, pool] of Object.entries(e.resources)) {
      if (res === 'hp' || res === 'hit_dice' || (!long && res === 'arcane_recovery')) continue;
      if (refreshes(resources[res]?.refresh) && pool.current < pool.max) r.apply({ type: 'modifyResource', entityId: id, resource: res, delta: pool.max - pool.current });
    }
    r.emit({ type: 'restRecovered', entityId: id, hp: r.entity(id).resources.hp!.current - before, hitDiceSpent: spent, slots } as RestEvent);
  }
  return r.outcome() as { effects: never[]; events: GameEvent[] };
}
