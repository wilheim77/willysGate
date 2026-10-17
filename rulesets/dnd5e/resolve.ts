import {
  type CheckResult,
  type DiceRoll,
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
  tileAt,
} from '../../engine';
import { type RollMode, d20Check, resolveRollMode } from '../common/d20';
import { ABILITY_LABELS, type Ability } from './abilities';
import { armorClass, hasFeature, mod, profBonus } from './character';
import { type DiceExpr, averageOf, rollDice, sum } from './dice';
import { coverBetween } from './cover';

/**
 * Working copy used while resolving one action: reads see the effects already
 * produced (so a second attack knows the first one killed), and the effects are
 * returned for the engine to apply for real. Ruleset events go along for the UI.
 */
export class Resolver {
  readonly effects: Effect[] = [];
  readonly events: GameEvent[] = [];

  constructor(
    private ruleset: Ruleset,
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

// --- Events for the renderer --------------------------------------------------

export interface AttackRolledEvent extends GameEvent {
  type: 'attackRolled';
  attackerId: string;
  targetId: string;
  label: string;
  /** Absent when the attack cannot miss (objects stand still and are hit automatically). */
  roll?: CheckResult;
  hit: boolean;
  crit: boolean;
}

export interface DamageDealtEvent extends GameEvent {
  type: 'damageDealt';
  targetId: string;
  amount: number;
  damageType: string;
  crit: boolean;
}

export interface HealedEvent extends GameEvent {
  type: 'healed';
  targetId: string;
  amount: number;
}

export interface SaveRolledEvent extends GameEvent {
  type: 'saveRolled';
  entityId: string;
  roll: CheckResult;
}

export interface FateEvent extends GameEvent {
  type: 'downed' | 'died' | 'stabilized' | 'revived' | 'bleeding' | 'reactionUsed';
  entityId: string;
  detail?: string;
}

// --- Rolls and modifiers -----------------------------------------------------

const INCAPACITATED = ['paralyzed', 'stunned', 'downed', 'dead', 'unconscious'];

export function heightOf(state: GameState, p: Vec2): number {
  return tileAt(state.map, p)?.height ?? 0;
}

/** Advantage/disadvantage on an attack, with the reasons shown to the player. */
export function attackMode(state: GameState, attacker: Entity, target: Entity, melee: boolean): { mode: RollMode; reasons: string[] } {
  const adv: string[] = [];
  const dis: string[] = [];
  if (heightOf(state, attacker.position) > heightOf(state, target.position)) adv.push('desde arriba');
  if (INCAPACITATED.some((c) => hasCondition(target, c)) || hasCondition(target, 'restrained')) adv.push('objetivo indefenso');
  if (hasCondition(target, 'guided')) adv.push('saeta guía');
  if (hasCondition(target, 'prone')) (melee ? adv : dis).push('objetivo derribado');
  if (hasCondition(target, 'dodging')) dis.push('el objetivo esquiva');
  if (['poisoned', 'frightened', 'blinded', 'prone'].some((c) => hasCondition(attacker, c))) dis.push('atacante afectado');
  if (!melee && Object.values(state.entities).some((e) => isCreature(e) && isHostile(e, attacker) && standing(e) && gridDistance(e.position, attacker.position) === 1)) {
    dis.push('enemigo pegado');
  }
  if (hasTag(attacker, 'pack_tactics') && Object.values(state.entities).some((e) => e.id !== attacker.id && isCreature(e) && !isHostile(e, attacker) && standing(e) && gridDistance(e.position, target.position) === 1)) {
    adv.push('tácticas de manada');
  }
  const mode = resolveRollMode(adv.length > 0, dis.length > 0);
  const reasons = mode === 'advantage' ? adv : mode === 'disadvantage' ? dis : [];
  return { mode, reasons };
}

/** A living thing rather than scenery (barrels and crates are not threats or allies). */
export function isCreature(e: Entity): boolean {
  return !e.tags.includes(OBJECT_TAG);
}

export function standing(e: Entity): boolean {
  return (e.resources.hp?.current ?? 1) > 0 && !hasCondition(e, 'dead') && !hasCondition(e, 'downed');
}

/** Probability that d20 + bonus >= target, with natural 1 always failing and the crit range always hitting. */
export function chanceToHit(bonus: number, target: number, mode: RollMode, critOn = 20): { hit: number; crit: number } {
  let single = 0;
  for (let d = 1; d <= 20; d++) if (d !== 1 && (d >= critOn || d + bonus >= target)) single++;
  const p = single / 20;
  const c = (21 - critOn) / 20;
  if (mode === 'advantage') return { hit: 1 - (1 - p) ** 2, crit: 1 - (1 - c) ** 2 };
  if (mode === 'disadvantage') return { hit: p * p, crit: c * c };
  return { hit: p, crit: c };
}

/** Probability that a d20 + bonus check meets the DC (no automatic success/failure on saves). */
export function chanceToSucceed(bonus: number, dc: number, mode: RollMode = 'normal'): number {
  const p = Math.min(1, Math.max(0, (21 - (dc - bonus)) / 20));
  if (mode === 'advantage') return 1 - (1 - p) ** 2;
  if (mode === 'disadvantage') return p * p;
  return p;
}

export function saveBonus(e: Entity, ability: Ability): number {
  return mod(e, ability) + (hasTag(e, `prof:save:${ability}`) ? profBonus(e) : 0);
}

export function spellAttackBonus(e: Entity, ability: Ability): number {
  return profBonus(e) + mod(e, ability);
}

export function spellDc(e: Entity, ability: Ability): number {
  return 8 + profBonus(e) + mod(e, ability);
}

// --- Saving throws -------------------------------------------------------------

export function saveMode(target: Entity, ability: Ability, damageType?: string): RollMode {
  const adv = (hasFeature(target, 'dwarven_resilience') && damageType === 'poison') || hasCondition(target, 'dodging') && ability === 'dex';
  return resolveRollMode(!!adv, false);
}

export function rollSave(r: Resolver, entityId: string, ability: Ability, dc: number, damageType?: string): boolean {
  const target = r.entity(entityId);
  if ((hasCondition(target, 'paralyzed') || hasCondition(target, 'stunned')) && (ability === 'str' || ability === 'dex')) {
    r.emit({ type: 'saveRolled', entityId, roll: autoFail(ability, dc) } as SaveRolledEvent);
    return false;
  }
  const modifiers = [{ label: ABILITY_LABELS[ability], value: mod(target, ability) }];
  if (hasTag(target, `prof:save:${ability}`)) modifiers.push({ label: 'Competencia', value: profBonus(target), term: 'proficiency' } as never);
  if (hasCondition(target, 'blessed')) modifiers.push({ label: 'Bendición', value: r.rng.die(4), term: 'bless' } as never);
  const roll = d20Check(r.rng, {
    check: `save:${ability}`,
    label: `Salvación de ${ABILITY_LABELS[ability]}`,
    mode: saveMode(target, ability, damageType),
    modifiers,
    target: dc,
  });
  roll.targetTerm = 'dc';
  r.emit({ type: 'saveRolled', entityId, roll } as SaveRolledEvent);
  return roll.success;
}

function autoFail(ability: Ability, dc: number): CheckResult {
  return {
    check: `save:${ability}`,
    label: `Salvación de ${ABILITY_LABELS[ability]}`,
    dice: [],
    modifiers: [],
    total: 0,
    target: dc,
    targetLabel: 'CD',
    targetTerm: 'dc',
    success: false,
    outcome: 'auto_fail',
  };
}

// --- Damage, healing, death ------------------------------------------------------

export function adjustForType(target: Entity, amount: number, type: string): number {
  if (hasTag(target, `immune:${type}`)) return 0;
  if (hasTag(target, `resist:${type}`)) return Math.floor(amount / 2);
  if (hasTag(target, `vuln:${type}`)) return amount * 2;
  return amount;
}

export function dealDamage(r: Resolver, targetId: string, raw: number, type: string, crit = false): number {
  const target = r.entity(targetId);
  if (hasCondition(target, 'dead')) return 0;
  const amount = adjustForType(target, raw, type);
  if (amount <= 0) return 0;
  const hp = target.resources.hp?.current ?? 0;
  r.emit({ type: 'damageDealt', targetId, amount, damageType: type, crit } as DamageDealtEvent);
  if (hasCondition(target, 'turned')) r.apply({ type: 'removeCondition', entityId: targetId, condition: 'turned' });

  if (hasCondition(target, 'downed')) {
    // Hitting someone already down makes them bleed out faster.
    const bleed = target.resources.bleed?.current ?? 0;
    r.apply({ type: 'modifyResource', entityId: targetId, resource: 'bleed', delta: crit ? -2 : -1 });
    if (bleed - (crit ? 2 : 1) <= 0) die(r, targetId);
    return amount;
  }

  r.apply({ type: 'modifyResource', entityId: targetId, resource: 'hp', delta: -amount });
  if (hp - amount <= 0) dropToZero(r, targetId, type, crit, amount);
  else checkConcentration(r, targetId, amount);
  return amount;
}

function dropToZero(r: Resolver, id: string, type: string, crit: boolean, amount: number): void {
  const e = r.entity(id);
  if (hasTag(e, 'undead_fortitude') && type !== 'radiant' && !crit) {
    if (rollSave(r, id, 'con', 5 + amount)) {
      r.apply({ type: 'modifyResource', entityId: id, resource: 'hp', delta: 1 });
      r.emit({ type: 'reactionUsed', entityId: id, detail: 'Fortaleza de no muerto' } as FateEvent);
      return;
    }
  }
  if ((e.resources.relentless?.current ?? 0) > 0) {
    r.apply({ type: 'modifyResource', entityId: id, resource: 'relentless', delta: -1 }, { type: 'modifyResource', entityId: id, resource: 'hp', delta: 1 });
    r.emit({ type: 'reactionUsed', entityId: id, detail: 'Aguante incansable' } as FateEvent);
    return;
  }
  endConcentration(r, id);
  if (hasTag(e, 'pc')) {
    r.apply(
      { type: 'applyCondition', entityId: id, condition: 'downed' },
      { type: 'removeCondition', entityId: id, condition: 'stable' },
      { type: 'modifyResource', entityId: id, resource: 'bleed', delta: 3 },
    );
    r.emit({ type: 'downed', entityId: id } as FateEvent);
  } else {
    die(r, id);
  }
}

/** Things that happen when something is destroyed (an oil barrel explodes). Registered by environment.ts. */
export const destructionHooks: ((r: Resolver, id: string) => void)[] = [];

export function die(r: Resolver, id: string): void {
  endConcentration(r, id);
  r.apply(
    { type: 'removeCondition', entityId: id, condition: 'downed' },
    { type: 'removeCondition', entityId: id, condition: 'stable' },
    { type: 'applyCondition', entityId: id, condition: 'dead' },
  );
  r.emit({ type: 'died', entityId: id } as FateEvent);
  for (const hook of destructionHooks) hook(r, id);
}

export function heal(r: Resolver, targetId: string, amount: number): void {
  const t = r.entity(targetId);
  if (hasCondition(t, 'dead') || amount <= 0) return;
  const hp = t.resources.hp!;
  const gained = Math.min(amount, hp.max - hp.current);
  if (hasCondition(t, 'downed')) {
    r.apply({ type: 'removeCondition', entityId: targetId, condition: 'downed' }, { type: 'removeCondition', entityId: targetId, condition: 'stable' });
    r.emit({ type: 'revived', entityId: targetId } as FateEvent);
  }
  if (gained > 0) r.apply({ type: 'modifyResource', entityId: targetId, resource: 'hp', delta: gained });
  r.emit({ type: 'healed', targetId, amount: gained } as HealedEvent);
}

// --- Concentration -----------------------------------------------------------------

export const concentrationSource = (casterId: string) => `conc:${casterId}`;

export function endConcentration(r: Resolver, casterId: string): void {
  if (!hasCondition(r.entity(casterId), 'concentrating')) return;
  const source = concentrationSource(casterId);
  for (const e of Object.values(r.state.entities)) {
    for (const c of e.conditions) if (c.sourceId === source) r.apply({ type: 'removeCondition', entityId: e.id, condition: c.id });
  }
  r.apply({ type: 'removeCondition', entityId: casterId, condition: 'concentrating' });
}

function checkConcentration(r: Resolver, id: string, damage: number): void {
  if (!hasCondition(r.entity(id), 'concentrating')) return;
  if (!rollSave(r, id, 'con', Math.max(10, Math.floor(damage / 2)))) endConcentration(r, id);
}

// --- Attacks --------------------------------------------------------------------------

export interface AttackSpec {
  attackerId: string;
  targetId: string;
  label: string;
  /** Ability + proficiency (+ others); shown in the breakdown. */
  modifiers: { label: string; value: number; term?: string }[];
  damage: DiceExpr;
  damageType: string;
  melee: boolean;
  /** Natural roll needed for a critical (20, or 19 for a Champion). */
  critOn: number;
  /** Extra dice on a hit (Sneak Attack...), doubled on a crit. */
  extra?: { label: string; dice: DiceExpr; type: string }[];
  /** Weapon attacks only: half-orc Savage Attacks adds a die on melee crits. */
  weapon?: boolean;
}

export function attackPreview(state: GameState, spec: AttackSpec) {
  const attacker = state.entities[spec.attackerId]!;
  const target = state.entities[spec.targetId]!;
  const { mode, reasons } = attackMode(state, attacker, target, spec.melee);
  const bless = hasCondition(attacker, 'blessed') ? 2.5 : 0;
  const bonus = spec.modifiers.reduce((s, m) => s + m.value, 0);
  const cover = coverBetween(state, attacker.position, target.position);
  const ac = armorClass(target) + cover.bonus;
  const autoCrit = spec.melee && (hasCondition(target, 'paralyzed') || hasCondition(target, 'downed'));
  const object = target.tags.includes(OBJECT_TAG);
  const chance = object ? { hit: 1, crit: 0 } : chanceToHit(bonus + bless, ac, mode, spec.critOn);
  const crit = autoCrit ? chance.hit : chance.crit;
  const diceAvg = (d: DiceExpr) => averageOf({ ...d, bonus: 0 });
  const base = averageOf(spec.damage) + (spec.extra ?? []).reduce((s, x) => s + averageOf(x.dice), 0);
  const critExtra = diceAvg(spec.damage) + (spec.extra ?? []).reduce((s, x) => s + diceAvg(x.dice), 0);
  const expected = adjustForType(target, object ? averageOf(spec.damage) : chance.hit * base + crit * critExtra, spec.damageType);
  return { chance: chance.hit, crit: object ? 0 : crit, expected, mode, reasons, bonus, ac, cover, object };
}

export function resolveAttack(r: Resolver, spec: AttackSpec): { hit: boolean; crit: boolean } {
  const attacker = r.entity(spec.attackerId);
  const target = r.entity(spec.targetId);
  if (!standing(target) && !hasCondition(target, 'downed')) return { hit: false, crit: false };
  if (target.tags.includes(OBJECT_TAG)) {
    // Barrels and crates don't dodge: the attack always lands, never as a critical.
    r.emit({ type: 'attackRolled', attackerId: attacker.id, targetId: target.id, label: spec.label, hit: true, crit: false } as AttackRolledEvent);
    dealDamage(r, target.id, Math.max(1, sum(rollDice(r.rng, spec.damage.count, spec.damage.sides)) + spec.damage.bonus), spec.damageType);
    return { hit: true, crit: false };
  }
  const { mode } = attackMode(r.state, attacker, target, spec.melee);
  const modifiers = [...spec.modifiers];
  if (hasCondition(attacker, 'blessed')) modifiers.push({ label: 'Bendición', value: r.rng.die(4), term: 'bless' });
  let ac = armorClass(target) + coverBetween(r.state, attacker.position, target.position).bonus;
  const roll = d20Check(r.rng, { check: 'attack', label: spec.label, mode, modifiers, target: ac, targetLabel: 'CA' });
  roll.targetTerm = 'ac';
  const natural = roll.dice[0]!.kept[0]!;
  // Halfling Lucky: a natural 1 is rerolled once.
  if (natural === 1 && hasFeature(attacker, 'lucky')) {
    const again = r.rng.die(20);
    roll.dice.push({ sides: 20, rolls: [again], kept: [again], note: 'suerte' });
    roll.total = again + modifiers.reduce((s, m) => s + m.value, 0);
    roll.dice[0]!.kept = [];
  }
  const kept = roll.dice.at(-1)!.kept[0] ?? natural;
  let hit = kept !== 1 && (kept >= spec.critOn || roll.total >= ac);
  let crit = hit && (kept >= spec.critOn || (spec.melee && (hasCondition(target, 'paralyzed') || hasCondition(target, 'downed'))));
  if (hasCondition(target, 'guided')) r.apply({ type: 'removeCondition', entityId: target.id, condition: 'guided' });

  // Reaction: Shield, only if it turns this hit into a miss.
  if (hit && kept < spec.critOn && canReact(target) && hasTag(target, 'spell:shield') && (target.resources.spell_slot_1?.current ?? 0) > 0 && roll.total < ac + 5) {
    r.apply(
      { type: 'modifyResource', entityId: target.id, resource: 'reaction', delta: -1 },
      { type: 'modifyResource', entityId: target.id, resource: 'spell_slot_1', delta: -1 },
      { type: 'applyCondition', entityId: target.id, condition: 'shielded', remainingTurns: 1 },
    );
    r.emit({ type: 'reactionUsed', entityId: target.id, detail: 'Escudo' } as FateEvent);
    ac += 5;
    hit = false;
    crit = false;
  }
  roll.target = ac;
  roll.success = hit;
  if (crit) roll.outcome = 'critical';
  r.emit({ type: 'attackRolled', attackerId: attacker.id, targetId: target.id, label: spec.label, roll, hit, crit } as AttackRolledEvent);
  if (!hit) return { hit, crit };

  const times = crit ? 2 : 1;
  let total = sum(rollDice(r.rng, spec.damage.count * times, spec.damage.sides)) + spec.damage.bonus;
  for (const x of spec.extra ?? []) total += sum(rollDice(r.rng, x.dice.count * times, x.dice.sides)) + x.dice.bonus;
  if (crit && spec.weapon && spec.melee && hasFeature(attacker, 'savage_attacks')) total += sum(rollDice(r.rng, 1, spec.damage.sides));
  total = Math.max(1, total);

  // Reaction: Uncanny Dodge halves the damage of a hit.
  if (hasFeature(target, 'uncanny_dodge') && canReact(target)) {
    r.apply({ type: 'modifyResource', entityId: target.id, resource: 'reaction', delta: -1 });
    r.emit({ type: 'reactionUsed', entityId: target.id, detail: 'Esquiva asombrosa' } as FateEvent);
    total = Math.floor(total / 2);
  }
  dealDamage(r, target.id, total, spec.damageType, crit);
  return { hit, crit };
}

export function canReact(e: Entity): boolean {
  return standing(e) && (e.resources.reaction?.current ?? 0) > 0 && !hasCondition(e, 'no_reactions') && !INCAPACITATED.some((c) => hasCondition(e, c));
}

export type { DiceRoll };
