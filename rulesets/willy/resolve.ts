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
  simulatePush,
  tileAt,
} from '../../engine';
import { type RollMode, d20Check, resolveRollMode } from '../common/d20';
import { ATTR_LABELS, attackAttr, attr, defence, hasTrait, isBoss, levelAfter, skillLevel, useResource } from './character';
import type { Attr } from './data';
import { type Dice, averageDice, rollDice } from './dice';

/**
 * Working copy while resolving one action: reads see the effects already produced,
 * and the effects are returned for the engine to apply. Same pattern as dnd5e.
 */
export class Resolver {
  readonly effects: Effect[] = [];
  readonly events: GameEvent[] = [];

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
    | 'jumped'
    | 'collided'
    | 'fueraDePlano'
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

const NO_ACT = ['aturdido', 'dormido', 'petrificado', 'eliminado'];
export function canAct(e: Entity): boolean {
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
  if (hasCondition(attacker, 'cegado')) mods.push({ label: 'Cegado', value: -5, term: 'cegado' });
  if (hasCondition(attacker, 'mareado')) mods.push({ label: 'Mareado', value: -2, term: 'mareado' });
  if (hasCondition(attacker, 'compulsado')) mods.push({ label: 'Compulsado', value: 2, term: 'compulsado' });
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
  const chance = chanceD20(bonus, def, mode);
  const crit = mode === 'advantage' ? 1 - (19 / 20) ** 2 : 1 / 20;
  const dmg = averageDice(spec.dice) + damageBonusFor(attacker, spec) + (spec.extraDamage ?? 0);
  const expected = adjustDamage(target, chance * dmg + crit * (averageDice(spec.dice) - spec.dice.bonus), spec.element);
  return { chance, crit, expected, bonus, def, modifiers };
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
  const { modifiers, mode } = attackModifiers(r.state, attacker, target, spec);
  const def = defence(target);
  const roll = d20Check(r.rng, { check: 'ataque', label: spec.label, mode, modifiers, target: def, targetLabel: 'DEF' });
  roll.targetTerm = 'def';
  const natural = roll.dice[0]!.kept[0]!;
  const hit = natural === 20 || (natural !== 1 && roll.total >= def);
  const crit = natural === 20;
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
  if (element === 'fuego' && hasCondition(target, 'protegidoFuego')) return 0;
  let a = amount;
  if (element === 'rayo' && hasCondition(target, 'empapado') && !hasTrait(target, 'hijo-del-cantabrico')) a *= 2;
  if (element === 'golpe' && hasCondition(target, 'congelado')) a += 2;
  if (element === 'golpe' && hasTrait(target, 'ceramica-esmaltada')) a = Math.max(1, a - 1);
  return Math.floor(a);
}

/** Hooks run after damage (the Butanero's gas bottle...). Registered by abilities.ts. */
export const damageHooks: ((r: Resolver, targetId: string, amount: number, element: string) => void)[] = [];

export function dealDamage(r: Resolver, targetId: string, raw: number, element: string, sourceId?: string, cause = 'golpe', crit = false): number {
  const target = r.entity(targetId);
  if (!standing(target)) return 0;
  const amount = adjustDamage(target, raw, element);
  if (amount <= 0) return 0;
  const hp = target.resources.vida?.current ?? 0;
  r.emit({ type: 'damageDealt', targetId, amount, element, crit } as DamageDealtEvent);
  r.apply({ type: 'modifyResource', entityId: targetId, resource: 'vida', delta: -amount });
  if (hasCondition(target, 'dormido')) r.apply({ type: 'removeCondition', entityId: targetId, condition: 'dormido' });
  if (hp - amount <= 0) defeat(r, targetId, sourceId, cause, element);
  else for (const hook of damageHooks) hook(r, targetId, amount, element);
  return amount;
}

export function defeat(r: Resolver, id: string, sourceId: string | undefined, cause: string, element?: string): void {
  r.apply({ type: 'applyCondition', entityId: id, condition: 'eliminado' });
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
  if (after > before) r.emit({ type: 'skillLevelUp', entityId, habilidad: abilityId, nivel: after } as WillyEvent);
}

// --- Pushes, collisions, the void --------------------------------------------------------------

const VOID_TERRAINS = new Set(['void', 'vacio', 'foso', 'agujero']);

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
  if (moved > 0) r.apply({ type: 'push', entityId: targetId, dx, dy, distance: steps });
  if (!sim.collidedWith) return { moved };
  const beyond = { x: sim.to.x + dx, y: sim.to.y + dy };
  const tile = tileAt(r.state.map, beyond);
  if (sim.collidedWith.wall && tile && VOID_TERRAINS.has(tile.terrain)) {
    r.emit({ type: 'fueraDePlano', entityId: targetId } as WillyEvent);
    const t = r.entity(targetId);
    if (isBoss(t)) dealDamage(r, targetId, Math.ceil((t.resources.vida?.max ?? 0) * 0.2), 'golpe', sourceId, 'fueraDePlano');
    else dealDamage(r, targetId, t.resources.vida?.current ?? 999, 'golpe', sourceId, 'fueraDePlano');
    return { moved, collided: 'void' };
  }
  if (sim.collidedWith.wall) {
    r.emit({ type: 'collided', entityId: targetId, with: 'muro' } as WillyEvent);
    dealDamage(r, targetId, rollDice(r.rng, { count: 1, sides: 6, bonus: 0 }), 'golpe', sourceId, 'choque');
    return { moved, collided: 'wall' };
  }
  const other = sim.collidedWith.entityId!;
  r.emit({ type: 'collided', entityId: targetId, with: 'entidad', otherId: other } as WillyEvent);
  dealDamage(r, targetId, rollDice(r.rng, { count: 1, sides: 4, bonus: 0 }), 'golpe', sourceId, 'choque');
  dealDamage(r, other, rollDice(r.rng, { count: 1, sides: 4, bonus: 0 }), 'golpe', sourceId, 'choque');
  return { moved, collided: 'entity' };
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
