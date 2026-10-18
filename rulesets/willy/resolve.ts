import {
  type CheckResult,
  type Effect,
  type Entity,
  type GameEvent,
  type GameState,
  type RngCursor,
  type Ruleset,
  type Vec2,
  OBJECT_TAG,
  applyEffects,
  gridDistance,
  hasCondition,
  hasTag,
  isHostile,
  lightLevelAt,
  obstructionsBetween,
  simulatePush,
  surfaceAt,
  tileAt,
} from '../../engine';
import { type RollMode, d20Check, resolveRollMode } from '../common/d20';
import { ATTR_LABELS, attackAttr, attr, classOf, defence, hasTrait, isBoss, levelAfter, skillLevel, useResource } from './character';
import { type Attr, abilityData } from './data';
import { type Dice, averageDice, rollDice } from './dice';

/**
 * Working copy while resolving one action: reads see the effects already produced,
 * and the effects are returned for the engine to apply. Same pattern as dnd5e.
 */
export class Resolver {
  readonly effects: Effect[] = [];
  readonly events: GameEvent[] = [];

  /** What the action being resolved was aimed at; skillUsed events carry it for the client's FX. */
  actionTarget?: { entityId?: string; tile?: Vec2 };

  constructor(
    readonly ruleset: Ruleset,
    public state: GameState,
    readonly rng: RngCursor,
  ) {}

  entity(id: string): Entity {
    return this.state.entities[id]!;
  }

  apply(...effects: Effect[]): void {
    if (effects.length === 0) return;
    this.state = applyEffects(this.ruleset, this.state, effects).state;
    this.effects.push(...effects);
  }

  emit(event: GameEvent): void {
    const e = event as GameEvent & { target?: unknown };
    if (e.type === 'skillUsed' && e.target === undefined && this.actionTarget) e.target = this.actionTarget;
    this.events.push(event);
  }

  outcome() {
    return { effects: this.effects, events: this.events };
  }
}

// --- Events ------------------------------------------------------------------------

export interface AttackRolledEvent extends GameEvent {
  type: 'attackRolled';
  attackerId: string;
  targetId: string;
  label: string;
  roll?: CheckResult;
  hit: boolean;
  crit: boolean;
  natural?: number;
}

export interface DamageDealtEvent extends GameEvent {
  type: 'damageDealt';
  targetId: string;
  amount: number;
  element: string;
  crit: boolean;
}

/** Game-level events the narrator, audience and achievements listen to. */
export interface WillyEvent extends GameEvent {
  type:
    | 'entityDefeated'
    | 'healed'
    | 'saveRolled'
    | 'forcedMoveResisted'
    | 'traitTriggered'
    | 'skillUsed'
    | 'skillLevelUp'
    | 'showOff'
    | 'saltoCompleto'
    | 'companeroCae'
    | 'xpGained'
    | 'levelUp'
    | 'cinta'
    | 'marea'
    | 'mareaAviso'
    | 'bounced'
    | 'collided'
    | 'fueraDePlano'
    | 'strike'
    | 'exploded';
  [key: string]: unknown;
}

// --- Standing ------------------------------------------------------------------------

export function standing(e: Entity): boolean {
  return (e.resources.vida?.current ?? 1) > 0 && !hasCondition(e, 'eliminado');
}

export function isCreature(e: Entity): boolean {
  return !e.tags.includes(OBJECT_TAG);
}

const NO_ACT = ['aturdido', 'dormido', 'petrificado', 'eliminado', 'encajado'];
export function canAct(e: Entity): boolean {
  // Antennas fire on their owner's turn; barriers never act.
  if (hasTag(e, 'torreta') || hasTag(e, 'barrera')) return false;
  return standing(e) && !NO_ACT.some((c) => hasCondition(e, c));
}

export function heightOf(state: GameState, p: Vec2): number {
  return tileAt(state.map, p)?.height ?? 0;
}

// --- Odds --------------------------------------------------------------------------------

/** d20 + bonus vs target: natural 20 always succeeds, natural 1 always fails. */
export function chanceD20(bonus: number, target: number, mode: RollMode = 'normal'): number {
  let ok = 0;
  for (let d = 1; d <= 20; d++) if (d === 20 || (d !== 1 && d + bonus >= target)) ok++;
  const p = ok / 20;
  if (mode === 'advantage') return 1 - (1 - p) ** 2;
  if (mode === 'disadvantage') return p * p;
  return p;
}

// --- Attacks --------------------------------------------------------------------------------

export interface AttackSpec {
  attackerId: string;
  targetId: string;
  label: string;
  melee: boolean;
  dice: Dice;
  element: string;
  /** Extra visible bonuses to hit (ability-specific). */
  extra?: { label: string; value: number; term?: string }[];
  /** Extra flat damage (ability-specific), added after the roll. */
  extraDamage?: number;
  /** Natural roll that is a critical (20 by default; the Tasador's Ojo clínico lowers it). */
  critOn?: number;
  /** A shot that came off a wall (Pase picado's bounce) doesn't care about cover. */
  ignoresCover?: boolean;
}

/** All visible to-hit modifiers ("+2 desde arriba"), so the preview and the roll agree. */
export function attackModifiers(state: GameState, attacker: Entity, target: Entity, spec: AttackSpec): { modifiers: { label: string; value: number; term?: string }[]; mode: RollMode } {
  const mods: { label: string; value: number; term?: string }[] = [attackAttr(attacker, spec.melee)];
  const rise = heightOf(state, attacker.position) - heightOf(state, target.position);
  if (rise > 0) mods.push({ label: 'Desde arriba', value: Math.min(4, 2 * rise), term: 'altura' });
  const flank = Object.values(state.entities).some(
    (o) => o.id !== attacker.id && isCreature(o) && standing(o) && !isHostile(o, attacker) && gridDistance(o.position, target.position) === 1,
  );
  if (flank && spec.melee) mods.push({ label: 'Flanqueo', value: 2, term: 'flanqueo' });
  if (hasCondition(target, 'tumbado')) mods.push({ label: 'Objetivo tumbado', value: spec.melee ? 3 : -2, term: 'tumbado' });
  if (lightLevelAt(state, target.position) < 0.25) mods.push({ label: 'A oscuras', value: -2, term: 'oscuridad' });
  const cover = spec.ignoresCover ? 0 : coverPenalty(state, attacker.position, target.position);
  if (cover) mods.push({ label: cover === -5 ? 'Cubierto del todo' : 'Cubierto a medias', value: cover, term: 'cobertura' });
  if (hasCondition(attacker, 'cegado')) mods.push({ label: 'Cegado', value: -5, term: 'cegado' });
  if (hasCondition(attacker, 'mareado')) mods.push({ label: 'Mareado', value: -2, term: 'mareado' });
  if (hasCondition(attacker, 'compulsado')) mods.push({ label: 'Compulsado', value: 2, term: 'compulsado' });
  if (hasCondition(attacker, 'pasodoble')) mods.push({ label: 'Pasodoble', value: 2 });
  if (hasTrait(attacker, 'pez') && surfaceAt(state, attacker.position)?.type === 'agua') mods.push({ label: 'Como pez en el agua', value: 2 });
  const studied = target.conditions.find((c) => c.id === 'estudiado' && c.sourceId === attacker.id);
  if (studied) mods.push({ label: 'Ojo clínico', value: skillLevel(attacker, 'ojo-clinico') >= 2 ? 5 : 4 });
  const signal = automatonSignal(state, attacker);
  if (signal > 0) mods.push({ label: 'Cobertura total', value: 1 });
  mods.push(...(spec.extra ?? []));
  const mode = resolveRollMode(hasCondition(attacker, 'afortunado'), false);
  return { modifiers: mods.filter((m) => m.value !== 0), mode };
}

export function attackPreview(state: GameState, spec: AttackSpec): { chance: number; crit: number; expected: number; bonus: number; def: number; modifiers: { label: string; value: number; term?: string }[] } {
  const attacker = state.entities[spec.attackerId]!;
  const target = state.entities[spec.targetId]!;
  const { modifiers, mode } = attackModifiers(state, attacker, target, spec);
  const bonus = modifiers.reduce((s, m) => s + m.value, 0);
  const def = defence(target);
  const chance = Math.max(chanceD20(bonus, def, mode), (21 - effectiveCritOn(attacker, target, spec)) / 20);
  const critOn = effectiveCritOn(attacker, target, spec);
  const single = (21 - critOn) / 20;
  const crit = mode === 'advantage' ? 1 - (1 - single) ** 2 : single;
  const dmg = averageDice(spec.dice) + damageBonusFor(attacker, spec) + (spec.extraDamage ?? 0);
  const expected = adjustDamage(target, chance * dmg + crit * (averageDice(spec.dice) - spec.dice.bonus), spec.element);
  return { chance, crit, expected, bonus, def, modifiers };
}

/** The Tasador's Ojo clínico widens the critical range against a studied target. */
function effectiveCritOn(attacker: Entity, target: Entity, spec: AttackSpec): number {
  const studied = target.conditions.some((c) => c.id === 'estudiado' && c.sourceId === attacker.id);
  const fromStudy = studied ? (skillLevel(attacker, 'ojo-clinico') >= 3 ? 17 : 18) : 20;
  return Math.min(spec.critOn ?? 20, fromStudy);
}

function damageBonusFor(attacker: Entity, spec: AttackSpec): number {
  if (hasTag(attacker, 'criatura')) return hasCondition(attacker, 'animado') ? 1 : 0;
  return Math.floor(attr(attacker, spec.melee ? 'fue' : 'agi') / 3) + (hasCondition(attacker, 'animado') ? 1 : 0);
}

/** Rolls the attack; on a hit deals damage (doubled dice on a natural 20). */
export function resolveAttack(r: Resolver, spec: AttackSpec): { hit: boolean; crit: boolean; damage: number } {
  const attacker = r.entity(spec.attackerId);
  const target = r.entity(spec.targetId);
  if (!standing(target)) return { hit: false, crit: false, damage: 0 };
  if (target.tags.includes(OBJECT_TAG)) {
    r.emit({ type: 'attackRolled', attackerId: attacker.id, targetId: target.id, label: spec.label, hit: true, crit: false } as AttackRolledEvent);
    const dmg = dealDamage(r, target.id, Math.max(1, rollDice(r.rng, spec.dice) + damageBonusFor(attacker, spec)), spec.element, attacker.id, 'golpe');
    return { hit: true, crit: false, damage: dmg };
  }
  if (hasCondition(attacker, 'escondido')) r.apply({ type: 'removeCondition', entityId: attacker.id, condition: 'escondido' });
  // «Afortunado» is for the next roll only.
  if (hasCondition(attacker, 'afortunado')) r.apply({ type: 'removeCondition', entityId: attacker.id, condition: 'afortunado' });
  const { modifiers, mode } = attackModifiers(r.state, attacker, target, spec);
  const def = defence(target);
  const roll = d20Check(r.rng, { check: 'ataque', label: spec.label, mode, modifiers, target: def, targetLabel: 'DEF' });
  roll.targetTerm = 'def';
  const natural = roll.dice[0]!.kept[0]!;
  const critOn = effectiveCritOn(attacker, target, spec);
  const hit = natural >= critOn || (natural !== 1 && roll.total >= def);
  const crit = natural >= critOn;
  if (target.conditions.some((c) => c.id === 'estudiado' && c.sourceId === attacker.id)) r.apply({ type: 'removeCondition', entityId: target.id, condition: 'estudiado' });
  roll.success = hit;
  if (crit) roll.outcome = 'critical';
  if (natural === 1) roll.outcome = 'fumble';
  r.emit({ type: 'attackRolled', attackerId: attacker.id, targetId: target.id, label: spec.label, roll, hit, crit, natural } as AttackRolledEvent);
  if (!hit) {
    // Esquivar levels up when an enemy misses you.
    if (target.resources[useResource('esquivar')]) countUse(r, target.id, 'esquivar');
    return { hit, crit, damage: 0 };
  }
  const raw = Math.max(1, rollDice(r.rng, spec.dice, crit ? 2 : 1) + damageBonusFor(attacker, spec) + (spec.extraDamage ?? 0));
  const damage = dealDamage(r, target.id, raw, spec.element, attacker.id, 'golpe', crit);
  return { hit, crit, damage };
}

// --- Damage, healing, defeat ------------------------------------------------------------

/** Immunities, wet+lightning, frozen+blunt, glazed gnome. */
export function adjustDamage(target: Entity, amount: number, element: string): number {
  if (hasTag(target, `inmune:${element}`)) return 0;
  if (hasCondition(target, 'petrificado') || hasCondition(target, 'encajado')) return 0;
  if (element === 'fuego' && hasCondition(target, 'protegidoFuego')) return 0;
  let a = amount;
  if (element === 'rayo' && hasCondition(target, 'empapado') && !hasTrait(target, 'hijo-del-cantabrico')) a *= 2;
  if (element === 'golpe' && hasCondition(target, 'congelado')) a += 2;
  if (element === 'golpe' && hasTrait(target, 'ceramica-esmaltada')) a = Math.max(1, a - 1);
  return Math.floor(a);
}

/** Hooks run after damage (the Butanero's gas bottle...). Registered by abilities.ts. */
export const damageHooks: ((r: Resolver, targetId: string, amount: number, element: string) => void)[] = [];

/**
 * Asked after adjustDamage: each may change the amount (0 means no damage). The final boss uses
 * it: in the dark he only takes damage under a spotlight, and a spotlight makes it +50 %.
 */
export const damageModifierHooks: ((r: Resolver, targetId: string, amount: number, element: string, sourceId?: string) => number)[] = [];

export function dealDamage(r: Resolver, targetId: string, raw: number, element: string, sourceId?: string, cause = 'golpe', crit = false): number {
  // Someone may have left play earlier in the same action (a summon whose owner fell, a collapsed room).
  const target = r.state.entities[targetId];
  if (!target || !standing(target)) return 0;
  let amount = adjustDamage(target, raw, element);
  for (const hook of damageModifierHooks) if (amount > 0) amount = Math.max(0, Math.floor(hook(r, targetId, amount, element, sourceId)));
  if (amount <= 0) return 0;
  const hp = target.resources.vida?.current ?? 0;
  r.emit({ type: 'damageDealt', targetId, amount, element, crit } as DamageDealtEvent);
  r.apply({ type: 'modifyResource', entityId: targetId, resource: 'vida', delta: -amount });
  if (hasCondition(target, 'dormido')) r.apply({ type: 'removeCondition', entityId: targetId, condition: 'dormido' });
  if (hp - amount <= 0) defeat(r, targetId, sourceId, cause, element);
  else for (const hook of damageHooks) hook(r, targetId, amount, element);
  return amount;
}

/** Run when someone is eliminated (companions remember where they fell). */
export const defeatHooks: ((r: Resolver, id: string) => void)[] = [];

/**
 * Asked before anyone is eliminated: a hook that returns true keeps them in the fight at 1
 * health, with no elimination, no entityDefeated and no experience (the final boss's Share).
 */
export const preventDefeatHooks: ((r: Resolver, id: string, cause: string) => boolean)[] = [];

export function defeat(r: Resolver, id: string, sourceId: string | undefined, cause: string, element?: string): void {
  if (preventDefeatHooks.some((h) => h(r, id, cause))) {
    r.apply({ type: 'modifyResource', entityId: id, resource: 'vida', delta: 1 - (r.entity(id).resources.vida?.current ?? 0) });
    return;
  }
  // 'eliminado' drives Willy's own rules (standing(), NO_ACT…); 'dead' is the cross-ruleset
  // condition id the generic engine/client already use for "this is a corpse" (see
  // engine/dialogue.ts and src/scenes/MapScene.ts's applyFate, written against dnd5e's
  // condition of the same name) — applied alongside it so defeated Willy entities get the
  // same corpse/vanish-on-death handling there, not just dnd5e's.
  r.apply({ type: 'applyCondition', entityId: id, condition: 'eliminado' }, { type: 'applyCondition', entityId: id, condition: 'dead' });
  for (const hook of defeatHooks) hook(r, id);
  const fallen = r.entity(id);
  // Automatons blow up when destroyed (Construir autómata, level 4).
  const ownerId = fallen.tags.find((t) => t.startsWith('invocado-por:'))?.slice('invocado-por:'.length);
  const owner = ownerId ? r.state.entities[ownerId] : undefined;
  if (owner && hasTag(fallen, 'automata') && skillLevel(owner, 'construir-automata') >= 4) {
    r.emit({ type: 'exploded', entityId: id, at: fallen.position } as WillyEvent);
    for (const v of Object.values(r.state.entities)) {
      if (v.id !== id && standing(v) && gridDistance(v.position, fallen.position) <= 1) dealDamage(r, v.id, rollDice(r.rng, { count: 1, sides: 6, bonus: 0 }), 'rayo', ownerId, 'explosion');
    }
  }
  // Barrels of gas go off: 2d6 of fire to everything around and fire on the floor.
  if (hasTag(fallen, 'explosivo')) {
    r.emit({ type: 'exploded', entityId: id, at: fallen.position } as WillyEvent);
    const around: Vec2[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) around.push({ x: fallen.position.x + dx, y: fallen.position.y + dy });
    for (const v of Object.values(r.state.entities)) {
      if (v.id !== id && standing(v) && gridDistance(v.position, fallen.position) <= 1) dealDamage(r, v.id, rollDice(r.rng, { count: 2, sides: 6, bonus: 0 }), 'fuego', sourceId, 'explosion');
    }
    r.apply({ type: 'applyElement', tiles: around.filter((p) => tileAt(r.state.map, p)?.walkable), element: 'fuego' });
  }
  // Summons leave when their owner falls.
  for (const e of Object.values(r.state.entities)) if (e.tags.includes(`invocado-por:${id}`)) r.apply({ type: 'despawnEntity', entityId: e.id });
  // «¡Que es de época!»: the Tasador is sad for a turn after breaking scenery.
  const source = sourceId ? r.state.entities[sourceId] : undefined;
  if (source && hasTrait(source, 'que-es-de-epoca') && r.entity(id).tags.includes(OBJECT_TAG)) {
    r.apply({ type: 'applyCondition', entityId: sourceId!, condition: 'pena' });
    r.emit({ type: 'traitTriggered', entityId: sourceId!, rasgo: 'que-es-de-epoca' } as WillyEvent);
  }
  const ev: WillyEvent = { type: 'entityDefeated', entityId: id, cause };
  if (sourceId) ev.actorId = sourceId;
  if (element) ev.element = element;
  r.emit(ev);
}

export function heal(r: Resolver, targetId: string, amount: number): number {
  const t = r.entity(targetId);
  if (!standing(t) || amount <= 0) return 0;
  const hp = t.resources.vida!;
  const gained = Math.min(amount, hp.max - hp.current);
  if (gained > 0) r.apply({ type: 'modifyResource', entityId: targetId, resource: 'vida', delta: gained });
  r.emit({ type: 'healed', targetId, amount: gained } as WillyEvent);
  return gained;
}

// --- Saves -------------------------------------------------------------------------------------

/** d20 + attribute vs DIF, for resisting (salvación). Creatures use their attack bonus as a rough stand-in. */
export function saveBonus(e: Entity, a: Attr): number {
  return hasTag(e, 'criatura') ? Math.floor((e.stats.ataque ?? 3) / 2) + (hasTag(e, 'jefe') ? 3 : 0) : attr(e, a);
}

export function rollSave(r: Resolver, entityId: string, a: Attr, dif: number): boolean {
  const e = r.entity(entityId);
  const roll = d20Check(r.rng, { check: `save:${a}`, label: `Resistir (${ATTR_LABELS[a]})`, mode: 'normal', modifiers: [{ label: ATTR_LABELS[a], value: saveBonus(e, a) }], target: dif, targetLabel: 'DIF' });
  roll.targetTerm = 'dif';
  const natural = roll.dice[0]!.kept[0]!;
  roll.success = natural === 20 || (natural !== 1 && roll.total >= dif);
  r.emit({ type: 'saveRolled', entityId, roll } as WillyEvent);
  return roll.success;
}

// --- Skills by use --------------------------------------------------------------------------------

/** A use with effect: bump the counter and announce a new skill level. */
export function countUse(r: Resolver, entityId: string, abilityId: string): void {
  const e = r.entity(entityId);
  const res = useResource(abilityId);
  if (!e.resources[res]) return;
  const before = skillLevel(e, abilityId);
  r.apply({ type: 'modifyResource', entityId, resource: res, delta: 1 });
  const after = levelAfter(e, abilityId, (e.resources[res]?.current ?? 0) + 1);
  r.emit({ type: 'skillUsed', entityId, habilidad: abilityId, nivel: before } as WillyEvent);
  if (after > before) r.emit({ type: 'skillLevelUp', entityId, habilidad: abilityId, nombre: abilityData(classOf(e), abilityId)?.nombre ?? abilityId, nivel: after, maestria: after >= 5 } as WillyEvent);
}

// --- Pushes, collisions, the void --------------------------------------------------------------

/** Immune to forced movement: the Funcionario's Plaza en propiedad, anchors... */
export function unmovable(e: Entity): boolean {
  return hasTrait(e, 'plaza-en-propiedad') || hasTag(e, 'inmune:empuje');
}

/**
 * Pushes `targetId` `distance` tiles away from `from` (negative pulls). Applies collision
 * damage (1d6 against a wall, 1d4 to both against a creature) and throws non-bosses
 * into the void ("fuera de plano"). Falls are resolved by the engine through onFall.
 */
export function pushEntity(r: Resolver, targetId: string, from: Vec2, distance: number, sourceId?: string): { moved: number; collided?: 'wall' | 'entity' | 'void' } {
  const target = r.entity(targetId);
  if (!standing(target) || distance === 0) return { moved: 0 };
  if (unmovable(target)) {
    r.emit({ type: 'forcedMoveResisted', entityId: targetId } as WillyEvent);
    return { moved: 0 };
  }
  let dx = Math.sign(target.position.x - from.x);
  let dy = Math.sign(target.position.y - from.y);
  if (distance < 0) {
    dx = -dx;
    dy = -dy;
  }
  if (dx === 0 && dy === 0) return { moved: 0 };
  const steps = Math.abs(distance);
  const sim = simulatePush(r.ruleset, r.state, targetId, dx, dy, steps);
  const moved = gridDistance(target.position, sim.to);
  // Who pushed, for the collision and void hooks (they run after this action, in the engine).
  if (sourceId) r.apply({ type: 'setFlag', flag: pushedByFlag(targetId), value: sourceId });
  if (moved > 0 || sim.collidedWith || sim.intoVoid) r.apply({ type: 'push', entityId: targetId, dx, dy, distance: steps });
  // A petrified enemy that gets pushed shatters (the Tasador's Pieza de museo).
  if (moved > 0 && hasCondition(target, 'petrificado') && !isBoss(target)) {
    r.emit({ type: 'collided', entityId: targetId, with: 'roto' } as WillyEvent);
    r.apply({ type: 'removeCondition', entityId: targetId, condition: 'petrificado' });
    dealDamage(r, targetId, r.entity(targetId).resources.vida?.current ?? 999, 'golpe', sourceId, 'roto');
    return { moved };
  }
  if (sim.intoVoid) return { moved, collided: 'void' };
  if (!sim.collidedWith) return { moved };
  return { moved, collided: sim.collidedWith.wall ? 'wall' : 'entity' };
}

export const pushedByFlag = (id: string) => `willy:empujadoPor:${id}`;

function pusherOf(state: GameState, id: string): string | undefined {
  const v = state.flags[pushedByFlag(id)];
  return typeof v === 'string' ? v : undefined;
}

/**
 * R17: shoved into something. A wall hurts 1d6; another creature, 1d4 each, and if the push
 * had distance left the other one goes flying too («¡Strike!»), unless it is bigger or anchored.
 */
export function onCollision(ruleset: Ruleset, state: GameState, id: string, hit: { entityId?: string; wall?: boolean }, push: { dx: number; dy: number; remaining: number }, rng: RngCursor) {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id];
  if (!e || !standing(e)) return r.outcome();
  const source = pusherOf(state, id);
  const wall = hit.entityId ? r.state.entities[hit.entityId] : undefined;
  if (wall && hasTag(wall, 'barrera:persiana-de-ventanilla') && (e.resources.acciones?.current ?? 0) > 0) {
    // Ventanilla cerrada: whoever bumps into it loses an action complaining.
    r.apply({ type: 'modifyResource', entityId: id, resource: 'acciones', delta: -1 });
    r.emit({ type: 'traitTriggered', entityId: id, rasgo: 'ventanilla-cerrada' } as WillyEvent);
  }
  if (hit.wall || !hit.entityId || (wall && hasTag(wall, 'barrera'))) {
    r.emit({ type: 'collided', entityId: id, with: 'muro' } as WillyEvent);
    dealDamage(r, id, rollDice(rng, { count: 1, sides: 6, bonus: 0 }), 'golpe', source, 'choque');
    return r.outcome();
  }
  const other = hit.entityId;
  r.emit({ type: 'collided', entityId: id, with: 'entidad', otherId: other } as WillyEvent);
  dealDamage(r, id, rollDice(rng, { count: 1, sides: 4, bonus: 0 }), 'golpe', source, 'choque');
  dealDamage(r, other, rollDice(rng, { count: 1, sides: 4, bonus: 0 }), 'golpe', source, 'choque');
  const o = r.entity(other);
  if (push.remaining > 0 && standing(o) && !unmovable(o) && !isBoss(o) && (push.dx || push.dy)) {
    r.emit({ type: 'strike', entityId: id, otherId: other } as WillyEvent);
    if (source) r.apply({ type: 'setFlag', flag: pushedByFlag(other), value: source });
    r.apply({ type: 'push', entityId: other, dx: push.dx, dy: push.dy, distance: push.remaining });
  }
  return r.outcome();
}

/** R18: shoved into the void. Normal enemies are out ("fuera de plano"); bosses hang on, lose 20 % and climb back. */
export function onVoid(ruleset: Ruleset, state: GameState, id: string, rng: RngCursor) {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id];
  if (!e || !standing(e)) return r.outcome();
  const source = pusherOf(state, id);
  r.emit({ type: 'fueraDePlano', entityId: id } as WillyEvent);
  if (!isBoss(e)) {
    dealDamage(r, id, e.resources.vida?.current ?? 999, 'golpe', source, 'fueraDePlano');
    return r.outcome();
  }
  dealDamage(r, id, Math.ceil((e.resources.vida?.max ?? 0) * 0.2), 'golpe', source, 'fueraDePlano');
  const back = nearestFreeTile(r.state, e);
  if (back) r.apply({ type: 'setPosition', entityId: id, position: back });
  return r.outcome();
}

function nearestFreeTile(state: GameState, e: Entity): Vec2 | null {
  for (let radius = 1; radius <= 3; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const p = { x: e.position.x + dx, y: e.position.y + dy };
        const t = tileAt(state.map, p);
        if (!t?.walkable) continue;
        if (Object.values(state.entities).some((o) => o.id !== e.id && standing(o) && o.position.x === p.x && o.position.y === p.y)) continue;
        return p;
      }
    }
  }
  return null;
}

/** Cobertura total: +1 near the engineer (≤ 4 tiles), −2 (no signal) farther; 0 for everyone else. */
export function automatonSignal(state: GameState, e: Entity): number {
  if (!hasTag(e, 'automata')) return 0;
  const ownerId = e.tags.find((t) => t.startsWith('invocado-por:'))?.slice('invocado-por:'.length);
  const owner = ownerId ? state.entities[ownerId] : undefined;
  if (!owner || !hasTrait(owner, 'cobertura-total')) return 0;
  const range = hasTag(owner, 'antena-plegable') ? 6 : 4;
  return gridDistance(owner.position, e.position) <= range ? 1 : -2;
}

/** Cover from scenery between the two (crates, barrels, barriers): −2 with one obstacle, −5 with two or more. Adjacent attacks ignore it. */
export function coverPenalty(state: GameState, from: Vec2, to: Vec2): number {
  if (gridDistance(from, to) <= 1) return 0;
  const blockers = obstructionsBetween(state, from, to).filter((o) => o.kind === 'entity' && standing(state.entities[o.entityId!] ?? ({ resources: {}, conditions: [] } as never)));
  return blockers.length >= 2 ? -5 : blockers.length === 1 ? -2 : 0;
}

/** Falling: 1 level is free; then 1d6 per level beyond the first, and you land prone. */
export function fallDamage(r: Resolver, id: string, levels: number): void {
  const e = r.entity(id);
  if (!e || !standing(e)) return;
  if (hasTrait(e, 'planeo')) return;
  const dice = Math.max(0, levels - 1);
  if (dice > 0) {
    const mult = hasTrait(e, 'clonc') ? 2 : 1;
    dealDamage(r, id, rollDice(r.rng, { count: dice, sides: 6, bonus: 0 }) * mult, 'golpe', undefined, 'caida');
  }
  const standsUp = hasTrait(e, 'dos-metros-cuatro') && levels <= 2;
  if (standing(r.entity(id)) && isCreature(e) && !standsUp) r.apply({ type: 'applyCondition', entityId: id, condition: 'tumbado', remainingTurns: 1 });
}
