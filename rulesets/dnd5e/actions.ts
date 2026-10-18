import {
  type ActionDef,
  type ActionOutcome,
  type ActionPreview,
  type ActionTarget,
  type Entity,
  type GameState,
  type RngCursor,
  type Ruleset,
  type Vec2,
  gridDistance,
  hasCondition,
  hasLineOfSight,
  OBJECT_TAG,
  simulatePush,
  surfaceAt,
  trapAt,
  hasTag,
  isHostile,
  stat,
  tagValue,
  targetIds,
} from '../../engine';
import { ABILITY_LABELS, type Ability } from './abilities';
import { armorClass, castingAbility, hasFeature, mod, monsterOf, profBonus, tagValues } from './character';
import { SKILLS } from './abilities';
import { SURFACES } from './environment';
import { dnd5eRef } from './ref';
import { MONSTER_ACTIONS, type MonsterActionData, type Rider, SPELLS, type SpellData, WEAPONS } from './data';
import { type DiceExpr, averageOf, parseDice, rollDice, sum } from './dice';
import {
  type AttackSpec,
  Resolver,
  attackMode,
  attackPreview,
  chanceToSucceed,
  concentrationSource,
  dealDamage,
  endConcentration,
  adjustForType,
  heal,
  resolveAttack,
  rollSave,
  saveBonus,
  saveMode,
  spellAttackBonus,
  spellDc,
  standing,
  isCreature,
} from './resolve';

/**
 * Action ids: "attack:<weapon>", "spell:<id>", "ability:<id>" (a monster's own power),
 * "feature:<id>", "basic:<id>".
 * Everything is derived from the entity's tags and the SRD data, so new spells or
 * weapons are data changes.
 */

// --- Listing -------------------------------------------------------------------

/** The main action, or the extra one granted by Action Surge once it is spent. */
function mainCost(e: Entity): Record<string, number> {
  if ((e.resources.action?.current ?? 0) > 0) return { action: 1 };
  if ((e.resources.extra_action?.current ?? 0) > 0) return { extra_action: 1 };
  return { action: 1 };
}

function lowestSlot(e: Entity, level: number): number | null {
  for (let l = Math.max(1, level); l <= 3; l++) if ((e.resources[`spell_slot_${l}`]?.current ?? 0) > 0) return l;
  return null;
}

export function listActions(state: GameState, actorId: string): ActionDef[] {
  const e = state.entities[actorId];
  if (!e) return [];
  const actions: ActionDef[] = [];
  const main = mainCost(e);

  for (const w of tagValues(e, 'weapon')) {
    const weapon = WEAPONS[w];
    if (!weapon) continue;
    const melee = !weapon.properties.includes('ranged');
    actions.push({
      id: `attack:${w}`,
      label: `Atacar: ${weapon.label}`,
      description: `${weapon.damage} de daño ${DAMAGE_LABELS[weapon.type] ?? weapon.type}${attackSequence(e, w).length > 1 ? ` · ${attackSequence(e, w).length} ataques` : ''}${riderText(e, w)}.`,
      cost: main,
      target: { kind: 'creature', range: weapon.range, filter: 'hostile' },
      tags: ['attack', melee ? 'melee' : 'ranged', 'weapon'],
    });
  }

  for (const id of tagValues(e, 'spell')) {
    const spell = SPELLS[id];
    if (!spell || spell.cast === 'reaction') continue;
    const slot = spell.level === 0 ? 0 : lowestSlot(e, spell.level);
    const cost: Record<string, number> = spell.cast === 'bonus_action' ? { bonus_action: 1 } : { ...main };
    // Innate spells (x/day) spend their own uses instead of slots.
    if (spell.level > 0) cost[e.resources[`innate_${id}`] ? `innate_${id}` : `spell_slot_${slot ?? spell.level}`] = 1;
    actions.push(castableAction(`spell:${id}`, spell, cost, ['spell', spell.level === 0 ? 'cantrip' : `level${spell.level}`]));
  }

  // A monster's own powers: recharge (5-6) or a few uses a day.
  for (const id of tagValues(e, 'action')) {
    const power = MONSTER_ACTIONS[id];
    if (!power) continue;
    const cost: Record<string, number> = power.cast === 'bonus_action' ? { bonus_action: 1 } : { ...main };
    cost[`use_${id}`] = 1;
    actions.push(castableAction(`ability:${id}`, power, cost, ['ability', ...(power.recharge ? ['recharge'] : [])]));
  }

  if (hasFeature(e, 'second_wind')) {
    actions.push({ id: 'feature:second_wind', label: 'Tomar aliento', description: 'Recuperas 1d10 + nivel puntos de golpe.', cost: { bonus_action: 1, second_wind: 1 }, target: { kind: 'self', range: 0 }, tags: ['heal'] });
  }
  if (hasFeature(e, 'action_surge')) {
    actions.push({ id: 'feature:action_surge', label: 'Oleada de acción', description: 'Una acción extra este turno.', cost: { action_surge: 1 }, target: { kind: 'self', range: 0 }, tags: ['buff'] });
  }
  if (hasFeature(e, 'cunning_action')) {
    actions.push(
      { id: 'feature:dash', label: 'Correr (astuta)', description: 'Duplicas tu movimiento este turno.', cost: { bonus_action: 1 }, target: { kind: 'self', range: 0 }, tags: ['move'] },
      { id: 'feature:disengage', label: 'Retirarse (astuta)', description: 'Te mueves sin provocar ataques de oportunidad.', cost: { bonus_action: 1 }, target: { kind: 'self', range: 0 }, tags: ['move'] },
    );
  }
  if (hasFeature(e, 'turn_undead')) {
    actions.push({ id: 'feature:turn_undead', label: 'Expulsar muertos vivientes', description: 'Los no muertos cercanos huyen si fallan una salvación de Sabiduría.', cost: { ...main, channel_divinity: 1 }, target: { kind: 'self', range: 0 }, tags: ['control'] });
  }
  if (hasFeature(e, 'preserve_life')) {
    actions.push({ id: 'feature:preserve_life', label: 'Preservar la vida', description: `Reparte ${5 * stat(e, 'level', 1)} puntos de curación entre los aliados cercanos.`, cost: { ...main, channel_divinity: 1 }, target: { kind: 'self', range: 0 }, tags: ['heal'] });
  }

  actions.push(
    { id: 'basic:dodge', label: 'Esquivar', description: 'Hasta tu siguiente turno, los ataques contra ti tienen desventaja.', cost: main, target: { kind: 'self', range: 0 }, tags: ['defense'] },
    { id: 'basic:dash', label: 'Correr', description: 'Duplicas tu movimiento este turno.', cost: main, target: { kind: 'self', range: 0 }, tags: ['move'] },
    { id: 'basic:shove', label: 'Empujar', description: 'Atletismo enfrentado: si ganas, apartas al objetivo una casilla. Un barranco detrás hace el resto.', cost: main, target: { kind: 'creature', range: 1, filter: 'hostile' }, tags: ['control', 'push'] },
    { id: 'basic:stabilize', label: 'Estabilizar', description: 'Prueba de Medicina (CD 10) para que un aliado caído deje de desangrarse.', cost: main, target: { kind: 'creature', range: 1, filter: 'ally' }, tags: ['support'] },
  );
  return actions;
}

function castableAction(id: string, spell: SpellData, cost: Record<string, number>, tags: string[]): ActionDef {
  return {
    id,
    label: spell.label,
    description: spell.text,
    cost,
    target: {
      kind: spell.target,
      range: spell.range,
      ...(spell.filter ? { filter: spell.filter } : {}),
      // Bless/Aid pick several creatures; Magic Missile/Scorching Ray spread darts or rays.
      ...(spell.maxTargets ? { maxTargets: spell.maxTargets } : spell.multi && !spell.area ? { maxTargets: spell.multi, allowRepeat: true } : {}),
    },
    tags: [...tags, ...(spell.damage ? ['damage'] : []), ...(spell.heal ? ['heal'] : []), ...(spell.area ? ['area'] : [])],
  };
}

type Castable = SpellData & Partial<MonsterActionData>;

/** A spell or a monster's power, by action kind. */
function castableOf(kind: string, id: string): Castable | undefined {
  return kind === 'spell' ? SPELLS[id] : kind === 'ability' ? MONSTER_ACTIONS[id] : undefined;
}

/** Save DC: a power's fixed one, or the caster's spell DC. */
function castDc(caster: Entity, spell: Castable): number {
  return spell.dc ?? spellDc(caster, castingAbility(caster) ?? 'int');
}

export const DAMAGE_LABELS: Record<string, string> = {
  slashing: 'cortante',
  piercing: 'perforante',
  bludgeoning: 'contundente',
  fire: 'de fuego',
  cold: 'de frío',
  lightning: 'eléctrico',
  thunder: 'de trueno',
  radiant: 'radiante',
  necrotic: 'necrótico',
  force: 'de fuerza',
  poison: 'de veneno',
};

export function attacksPerAction(e: Entity): number {
  return Math.max(stat(e, 'multiattack', 1), hasFeature(e, 'extra_attack') ? 2 : 1);
}

/**
 * The weapons one Attack action swings, in order: the same one per attack, or a stat
 * block's mix (a wight's Life Drain then a longsword). Reactions get a single swing.
 */
export function attackSequence(e: Entity, weaponId: string): string[] {
  if (stat(e, 'single_attack', 0) > 0) return [weaponId];
  const combo = monsterOf(e)?.combos?.[weaponId];
  if (combo) return combo.filter((w) => WEAPONS[w]);
  return Array.from({ length: attacksPerAction(e) }, () => weaponId);
}

function riderOf(e: Entity, weaponId: string): Rider | undefined {
  return monsterOf(e)?.riders?.[weaponId];
}

function riderText(e: Entity, weaponId: string): string {
  const rider = riderOf(e, weaponId);
  if (!rider) return '';
  const save = rider.save ? ` (${ABILITY_LABELS[rider.save.ability]} CD ${rider.save.dc})` : '';
  return ` · ${rider.label}${save}`;
}

/** Condition immunities from the stat block (undead don't get poisoned). */
export function conditionImmune(e: Entity, condition: string): boolean {
  return hasTag(e, `condimmune:${condition}`);
}

function riderReaches(rider: Rider, target: Entity): boolean {
  return isCreature(target) && !(rider.immuneTags ?? []).some((t) => hasTag(target, t));
}

/** Expected worth of a weapon's rider on one hit: extra damage and conditions (in health points). */
function riderPreview(state: GameState, attacker: Entity, weaponId: string, target: Entity): { damage: number; utility: number } {
  const rider = riderOf(attacker, weaponId);
  if (!rider || !riderReaches(rider, target)) return { damage: 0, utility: 0 };
  const fail = rider.save
    ? 1 - chanceToSucceed(saveBonus(target, rider.save.ability) + (hasCondition(target, 'blessed') ? 2.5 : 0), rider.save.dc, saveMode(target, rider.save.ability, rider.damage?.type, rider.condition?.id))
    : 1;
  let damage = 0;
  if (rider.damage) {
    const avg = adjustForType(target, averageOf(parseDice(rider.damage.dice)), rider.damage.type);
    damage = fail * avg + (1 - fail) * (rider.save?.half ? avg / 2 : 0);
  }
  let utility = 0;
  if (rider.condition) utility += fail * conditionUtility(state, attacker, target, rider.condition.id, rider.condition.turns);
  if (rider.drain) utility += fail * 2;
  return { damage, utility };
}

/** What a rider does once its weapon has hit (and dealt `damage`). */
function applyRider(r: Resolver, attackerId: string, weaponId: string, targetId: string, damage: number): void {
  const rider = riderOf(r.entity(attackerId), weaponId);
  const target = r.entity(targetId);
  if (!rider || !riderReaches(rider, target) || !standing(target)) return;
  const saved = rider.save ? rollSave(r, targetId, rider.save.ability, rider.save.dc, rider.damage?.type, rider.condition?.id) : false;
  if (rider.damage) {
    const d = parseDice(rider.damage.dice);
    const rolled = sum(rollDice(r.rng, d.count, d.sides)) + d.bonus;
    const amount = saved ? (rider.save?.half ? Math.floor(rolled / 2) : 0) : rolled;
    if (amount > 0) dealDamage(r, targetId, amount, rider.damage.type);
  }
  if (saved || !standing(r.entity(targetId))) return;
  if (rider.condition && !conditionImmune(target, rider.condition.id)) {
    r.apply({ type: 'applyCondition', entityId: targetId, condition: rider.condition.id, remainingTurns: rider.condition.turns });
  }
  if (rider.drain && damage > 0) {
    // The maximum drops by the damage taken; the current hit points stay where the hit left them.
    r.apply(
      { type: 'modifyResourceMax', entityId: targetId, resource: 'hp', delta: -damage },
      { type: 'modifyResource', entityId: targetId, resource: 'hp', delta: damage },
      { type: 'modifyResourceMax', entityId: targetId, resource: 'drained', delta: damage },
    );
    r.emit({ type: 'reactionUsed', entityId: targetId, detail: `Vida drenada: −${damage} PG máximos` } as never);
  }
}

// --- What a condition is worth (for the AI) ------------------------------------------

/** Rough damage a creature deals per turn: what holding it down saves, or what a buff multiplies. */
function threat(e: Entity): number {
  let best = 2;
  for (const w of tagValues(e, 'weapon')) {
    const weapon = WEAPONS[w];
    if (!weapon) continue;
    const ranged = weapon.properties.includes('ranged');
    const m = ranged ? mod(e, 'dex') : weapon.properties.includes('finesse') ? Math.max(mod(e, 'dex'), mod(e, 'str')) : mod(e, 'str');
    best = Math.max(best, (averageOf(parseDice(weapon.damage)) + m) * attackSequence(e, w).length);
  }
  if (tagValues(e, 'spell').some((s) => SPELLS[s]?.damage)) best = Math.max(best, 8);
  return best * 0.65;
}

const BUFFS = new Set(['blessed', 'shield_of_faith', 'mage_armor', 'guided_check', 'spirit_guardians']);

/**
 * Health-equivalent worth of putting `condition` on `target` for `turns`, from the
 * caster's side: positive for a debuff on a foe or a buff on a friend, negative the other way.
 */
export function conditionUtility(state: GameState, caster: Entity, target: Entity, condition: string, turns: number): number {
  if (!isCreature(target) || hasCondition(target, condition) || conditionImmune(target, condition)) return 0;
  const t = threat(target);
  const rounds = Math.min(turns, 2);
  let value = 0;
  switch (condition) {
    case 'paralyzed':
      value = t * rounds + 4;
      break;
    case 'restrained':
      value = t * 0.4 + 3;
      break;
    case 'prone':
      value = t * 0.25 + 2;
      break;
    case 'frightened':
    case 'poisoned':
      value = t * 0.35 * rounds;
      break;
    case 'slowed':
      value = 1;
      break;
    case 'no_reactions':
      value = 0.5;
      break;
    case 'guided':
      value = 2;
      break;
    case 'blessed':
      value = t * 0.12 * Math.min(turns, 3) + 1;
      break;
    case 'shield_of_faith':
      value = 3;
      break;
    case 'mage_armor':
      value = 13 + mod(target, 'dex') > armorClass(target) ? 3 : 0;
      break;
  }
  void state;
  const friendly = !isHostile(caster, target);
  if (BUFFS.has(condition)) return friendly ? value : -value;
  return friendly ? -value * 1.5 : value;
}

// --- Weapon attacks ----------------------------------------------------------------

function weaponAttackSpec(state: GameState, attacker: Entity, weaponId: string, targetId: string, sneak: boolean): AttackSpec {
  const weapon = WEAPONS[weaponId]!;
  const ranged = weapon.properties.includes('ranged');
  const ability: Ability = ranged ? 'dex' : weapon.properties.includes('finesse') && mod(attacker, 'dex') > mod(attacker, 'str') ? 'dex' : 'str';
  const base = parseDice(weapon.damage);
  // Brute: a melee weapon deals one extra die.
  const damage = hasTag(attacker, 'brute') && !ranged ? { ...base, count: base.count + 1 } : base;
  const abilityMod = mod(attacker, ability);
  const damageMod = weapon.properties.includes('no_mod') ? 0 : abilityMod;
  const extra: AttackSpec['extra'] = [];
  if (sneak) extra.push({ label: 'Ataque furtivo', dice: { count: Math.ceil(stat(attacker, 'level', 1) / 2), sides: 6, bonus: 0 }, type: weapon.type });
  return {
    attackerId: attacker.id,
    targetId,
    label: weapon.label,
    modifiers: [
      { label: ABILITY_LABELS[ability], value: abilityMod },
      { label: 'Competencia', value: profBonus(attacker), term: 'proficiency' },
    ],
    damage: { ...damage, bonus: damage.bonus + damageMod },
    damageType: weapon.type,
    melee: !ranged,
    critOn: hasFeature(attacker, 'improved_critical') ? 19 : 20,
    extra,
    weapon: true,
  };
}

/** Sneak Attack: once per turn, finesse or ranged weapon, with advantage or an ally next to the target. */
function sneakApplies(state: GameState, attacker: Entity, weaponId: string, target: Entity): boolean {
  const weapon = WEAPONS[weaponId]!;
  if (!hasFeature(attacker, 'sneak_attack') || (attacker.resources.sneak_attack?.current ?? 0) < 1 || !isCreature(target)) return false;
  if (!weapon.properties.includes('finesse') && !weapon.properties.includes('ranged')) return false;
  const { mode } = attackMode(state, attacker, target, !weapon.properties.includes('ranged'));
  if (mode === 'disadvantage') return false;
  if (mode === 'advantage') return true;
  return Object.values(state.entities).some((e) => e.id !== attacker.id && isCreature(e) && !isHostile(e, attacker) && standing(e) && gridDistance(e.position, target.position) === 1);
}

// --- Spells -------------------------------------------------------------------------

function spellDamage(caster: Entity, spell: SpellData): DiceExpr | null {
  if (!spell.damage) return null;
  const d = parseDice(spell.damage.dice);
  const level = stat(caster, 'caster_level', stat(caster, 'level', 1));
  const scale = spell.damage.scale ? (level >= 11 ? 3 : level >= 5 ? 2 : 1) : 1;
  return { ...d, count: d.count * scale };
}

function healAmount(caster: Entity, spell: SpellData, slot: number, rng?: RngCursor): number {
  const d = parseDice(spell.heal!.dice);
  const ability = castingAbility(caster);
  const rolled = rng ? sum(rollDice(rng, d.count, d.sides)) + d.bonus : averageOf(d);
  const casterMod = spell.heal!.addMod && ability ? mod(caster, ability) : 0;
  const disciple = hasFeature(caster, 'disciple_of_life') ? 2 + slot : 0;
  return Math.max(0, Math.round(rolled + casterMod + disciple));
}

/** Tiles covered by an area spell aimed at `tile`. */
export function areaTiles(state: GameState, caster: Entity, spell: SpellData, tile: Vec2): Vec2[] {
  const area = spell.area!;
  const { width, height } = state.map;
  const out: Vec2[] = [];
  const centre = spell.range === 0 ? caster.position : tile;
  const dir = { x: tile.x - caster.position.x, y: tile.y - caster.position.y };
  const dirLen = Math.hypot(dir.x, dir.y) || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = { x, y };
      if (area.shape === 'sphere') {
        if (gridDistance(p, centre) <= area.size) out.push(p);
      } else {
        const v = { x: x - caster.position.x, y: y - caster.position.y };
        const len = Math.hypot(v.x, v.y);
        if (len === 0 || gridDistance(p, caster.position) > area.size) continue;
        const cos = (v.x * dir.x + v.y * dir.y) / (len * dirLen);
        if (area.shape === 'cone' && cos >= Math.cos(Math.PI / 4) - 1e-9) out.push(p);
        // A line is one tile wide: keep tiles within half a tile of the ray.
        if (area.shape === 'line' && cos > 0 && Math.abs(v.x * dir.y - v.y * dir.x) / dirLen <= 0.5) out.push(p);
      }
    }
  }
  return out;
}

function areaVictims(state: GameState, caster: Entity, spell: SpellData, target: ActionTarget): Entity[] {
  const tile = target.tile ?? (target.entityId ? state.entities[target.entityId]?.position : undefined) ?? caster.position;
  const tiles = new Set(areaTiles(state, caster, spell, tile).map((p) => `${p.x},${p.y}`));
  const sculpt = hasFeature(caster, 'sculpt_spells');
  return Object.values(state.entities).filter((e) => {
    if (!standing(e) || !tiles.has(`${e.position.x},${e.position.y}`)) return false;
    // A rallying cry or a war shout picks its listeners.
    if (spell.areaFilter === 'ally' && (isHostile(caster, e) || !isCreature(e))) return false;
    if (spell.areaFilter === 'hostile' && !isHostile(caster, e)) return false;
    // Cones, lines and self-centred bursts (Thunderwave) spare the caster.
    if ((spell.area!.shape !== 'sphere' || spell.range === 0) && e.id === caster.id) return false;
    // Evocation wizards carve safe pockets for their friends.
    if (sculpt && !isHostile(caster, e)) return false;
    return true;
  });
}

/** Creatures a targeted spell affects: the chosen one, plus the most wounded allies in range for multi-target spells. */
function spellTargets(state: GameState, caster: Entity, spell: SpellData, target: ActionTarget): Entity[] {
  if (spell.area) return areaVictims(state, caster, spell, target);
  if (spell.target === 'self') return [caster];
  // Explicit picks (the player chose each creature) win over the automatic choice.
  if (target.entityIds && target.entityIds.length > 0) {
    return [...new Set(target.entityIds)].map((id) => state.entities[id]).filter((e): e is Entity => !!e).slice(0, spell.maxTargets ?? 1);
  }
  const chosen = target.entityId ? state.entities[target.entityId] : undefined;
  if (!chosen) return [];
  if (!spell.maxTargets || spell.maxTargets <= 1) return [chosen];
  const missing = (e: Entity) => (e.resources.hp ? e.resources.hp.max - e.resources.hp.current : 0);
  const others = Object.values(state.entities)
    .filter((e) => e.id !== chosen.id && isCreature(e) && standing(e) && !isHostile(e, caster) && gridDistance(e.position, caster.position) <= spell.range)
    .sort((a, b) => missing(b) - missing(a) || a.id.localeCompare(b.id));
  return [chosen, ...others].slice(0, spell.maxTargets);
}

/**
 * One target per dart/ray: the player's picks, spread round-robin if they picked fewer
 * than the spell has; all on the single target otherwise.
 */
function dartTargets(spell: SpellData, target: ActionTarget): string[] {
  const n = spell.multi ?? 1;
  const picks = target.entityIds && target.entityIds.length > 0 ? target.entityIds : target.entityId ? [target.entityId] : [];
  if (picks.length === 0) return [];
  return Array.from({ length: n }, (_, i) => picks[i % picks.length]!);
}

function spellAttackSpec(caster: Entity, spell: Castable, targetId: string): AttackSpec {
  const ability = spell.attackAbility ?? castingAbility(caster) ?? 'int';
  return {
    attackerId: caster.id,
    targetId,
    label: spell.label,
    modifiers: [
      { label: ABILITY_LABELS[ability], value: mod(caster, ability) },
      { label: 'Competencia', value: profBonus(caster), term: 'proficiency' },
    ],
    damage: spellDamage(caster, spell) ?? { count: 0, sides: 0, bonus: 0 },
    damageType: spell.damage?.type ?? 'none',
    melee: spell.attack === 'melee',
    critOn: 20,
  };
}

// --- Preview ---------------------------------------------------------------------------

export function previewAction(state: GameState, actorId: string, actionId: string, target: ActionTarget): ActionPreview {
  const e = state.entities[actorId]!;
  const [kind, id] = actionId.split(':') as [string, string];
  const firstId = target.entityId ?? target.entityIds?.[0];
  const targetEntity = firstId ? state.entities[firstId] : undefined;

  if (kind === 'attack') {
    if (!targetEntity || !standing(targetEntity)) return { valid: false, reason: 'No hay a quién atacar ahí.' };
    if (!hasLineOfSight(state, e.position, targetEntity.position)) return { valid: false, reason: 'No lo ves: hay algo en medio.' };
    const sneak = sneakApplies(state, e, id, targetEntity);
    const p = attackPreview(state, weaponAttackSpec(state, e, id, targetEntity.id, sneak));
    const sequence = attackSequence(e, id);
    const n = sequence.length;
    // Each swing of the sequence (Sneak Attack only once), plus what its rider adds on a hit.
    let expected = 0;
    let utility = 0;
    let bestRider = 0;
    sequence.forEach((w, i) => {
      const pw = i === 0 ? p : attackPreview(state, weaponAttackSpec(state, e, w, targetEntity.id, false));
      const rider = riderPreview(state, e, w, targetEntity);
      expected += pw.expected + pw.chance * rider.damage;
      utility += pw.chance * rider.utility;
      bestRider = Math.max(bestRider, rider.utility);
    });
    // A second paralysis on the same target is worth little: cap at one rider's worth.
    utility = Math.min(utility, bestRider);
    const collateral = oilBarrelCollateral(state, targetEntity, 1 - Math.pow(1 - p.chance, n));
    const rider = sequence.map((w) => riderOf(e, w)).find((x) => x && riderReaches(x, targetEntity));
    return {
      valid: true,
      chance: p.chance,
      expectedDamage: expected,
      ...(utility ? { utility } : {}),
      ...(collateral.length ? { collateral } : {}),
      breakdown: [
        ...(attackBreakdown(p, n, sneak) ?? []),
        ...(rider ? [{ label: rider.label, value: rider.save ? `salvación de ${ABILITY_LABELS[rider.save.ability]} CD ${rider.save.dc}` : 'al impactar', term: 'saving_throw' }] : []),
      ],
    };
  }

  if (kind === 'spell' || kind === 'ability') {
    const spell = castableOf(kind, id);
    if (!spell) return { valid: false, reason: 'Acción desconocida.' };
    // Already holding a spell up: the AI won't swap it for another (the player still may).
    const swapsConcentration = !!spell.concentration && hasCondition(e, 'concentrating');
    const chosen = targetIds(target).map((t) => state.entities[t]).filter((t): t is Entity => !!t);
    if (spell.requiresTag && chosen.some((t) => !hasTag(t, spell.requiresTag!))) return { valid: false, reason: 'Este conjuro no afecta a esa criatura.' };
    if (spell.special === 'revivify') {
      return targetEntity && hasCondition(targetEntity, 'dead') ? { valid: true, chance: 1 } : { valid: false, reason: 'Solo sirve con un aliado muerto.' };
    }
    if (spell.special === 'stabilize') {
      return targetEntity && hasCondition(targetEntity, 'downed') && !hasCondition(targetEntity, 'stable') ? { valid: true, chance: 1 } : { valid: false, reason: 'Solo sirve con un aliado caído que se desangra.' };
    }
    if (spell.special === 'teleport') {
      const free = target.tile && !Object.values(state.entities).some((o) => standing(o) && o.position.x === target.tile!.x && o.position.y === target.tile!.y);
      return free ? { valid: true, chance: 1 } : { valid: false, reason: 'Necesitas una casilla libre.' };
    }
    if (spell.target === 'creature' && (!targetEntity || (!standing(targetEntity) && !spell.heal))) return { valid: false, reason: 'Objetivo no válido.' };
    const aimAt = target.tile ?? targetEntity?.position;
    const sightLines = target.tile ? [target.tile] : chosen.length ? chosen.map((t) => t.position) : aimAt ? [aimAt] : [];
    if (spell.range > 1 && sightLines.some((p) => !hasLineOfSight(state, e.position, p))) return { valid: false, reason: 'No lo ves: hay algo en medio.' };

    const victims = spellTargets(state, e, spell, target);
    const shots = dartTargets(spell, target);
    if (spell.attack && targetEntity) {
      let expected = 0;
      let chance = 0;
      for (const t of shots) {
        const p = attackPreview(state, spellAttackSpec(e, spell, t));
        expected += p.expected;
        chance = Math.max(chance, p.chance);
      }
      const p = attackPreview(state, spellAttackSpec(e, spell, targetEntity.id));
      const utility = spell.condition && !swapsConcentration ? p.chance * conditionUtility(state, e, targetEntity, spell.condition.id, spell.condition.turns) : 0;
      return { valid: true, chance, expectedDamage: expected, ...(utility ? { utility } : {}), breakdown: attackBreakdown(p, shots.length, false) };
    }
    if (spell.autoHit && spell.damage) {
      const d = spellDamage(e, spell)!;
      return { valid: true, chance: 1, expectedDamage: averageOf(d) * shots.length, breakdown: [{ label: 'Impacta siempre', value: '100 %', term: 'hit_chance' }, { label: 'Dardos', value: String(shots.length) }] };
    }
    if (spell.save) {
      const dc = castDc(e, spell);
      const dmg = spellDamage(e, spell);
      let expected = 0;
      let chance = 0;
      let utility = 0;
      for (const v of victims.filter(isCreature)) {
        const fail = 1 - chanceToSucceed(saveBonus(v, spell.save.ability) + (hasCondition(v, 'blessed') ? 2.5 : 0), dc, saveMode(v, spell.save.ability, spell.damage?.type, spell.condition?.id));
        chance = Math.max(chance, fail);
        if (spell.condition && spell.special !== 'spirit_guardians' && !swapsConcentration) utility += fail * conditionUtility(state, e, v, spell.condition.id, spell.condition.turns);
        if (dmg) {
          const avg = adjustForType(v, averageOf(dmg), spell.damage!.type);
          const value = fail * avg + (1 - fail) * (spell.save.half ? avg / 2 : hasFeature(e, 'potent_cantrip') && spell.level === 0 ? avg / 2 : 0);
          // Friendly fire counts against the plan.
          expected += isHostile(e, v) ? value : -value * 1.5;
        }
        // A failed save that throws someone off a ledge or into fire is worth that too.
        if (spell.push && isHostile(e, v)) expected += fail * describePush(state, v, e.position, spell.push).expected;
      }
      const affectedTiles = spell.area ? areaTiles(state, e, spell, target.tile ?? targetEntity?.position ?? e.position) : undefined;
      if (spell.area && victims.filter((v) => isCreature(v) && isHostile(e, v)).length === 0) {
        return { valid: true, chance: 0, expectedDamage: 0, breakdown: [{ label: 'No alcanza a ningún enemigo' }], ...(affectedTiles ? { affectedTiles } : {}) };
      }
      // Spirit Guardians already up (or another spell held): recasting gains nothing.
      if (swapsConcentration || (spell.special === 'spirit_guardians' && hasCondition(e, 'spirit_guardians'))) expected = 0;
      return {
        ...(affectedTiles ? { affectedTiles } : {}),
        valid: true,
        chance,
        expectedDamage: Math.max(0, expected),
        ...(utility ? { utility } : {}),
        breakdown: [
          { label: `CD ${dc} (${ABILITY_LABELS[spell.save.ability]})`, term: 'dc' },
          { label: 'Probabilidad de que falle la salvación', value: pct(chance), term: 'saving_throw' },
          ...(spell.area ? [{ label: `Afecta a ${victims.filter(isCreature).length} criatura(s)` }] : []),
          ...(spell.push ? victims.filter((v) => isCreature(v) && isHostile(e, v)).flatMap((v) => describePush(state, v, e.position, spell.push!).lines.map((l) => ({ ...l, label: `${v.name}: ${l.label}` }))) : []),
        ],
      };
    }
    if (spell.heal) {
      const slot = spell.level === 0 ? 0 : (lowestSlot(e, spell.level) ?? spell.level);
      const amount = healAmount(e, spell, slot);
      return { valid: true, chance: 1, expectedHealing: amount * victims.length, breakdown: [{ label: `Cura ~${amount} por objetivo` }, { label: 'Objetivos', value: String(victims.length) }] };
    }
    // Buffs and other plain conditions (Bless, Shield of Faith, a knight's Leadership).
    const utility = spell.condition && !swapsConcentration ? victims.reduce((n, v) => n + conditionUtility(state, e, v, spell.condition!.id, spell.condition!.turns), 0) : 0;
    return {
      valid: true,
      chance: 1,
      ...(utility ? { utility } : {}),
      ...(spell.maxTargets || spell.area ? { breakdown: [{ label: 'Objetivos', value: String(victims.length) }] } : {}),
      ...(spell.area ? { affectedTiles: areaTiles(state, e, spell, target.tile ?? e.position) } : {}),
    };
  }

  if (kind === 'feature' || kind === 'basic') {
    if (id === 'second_wind') return { valid: true, chance: 1, expectedHealing: 5.5 + stat(e, 'level', 1) };
    if (id === 'shove') {
      if (!targetEntity || !standing(targetEntity)) return { valid: false, reason: 'No hay a quién empujar.' };
      const p = shoveChance(e, targetEntity);
      const push = describePush(state, targetEntity, e.position, 1);
      return {
        valid: true,
        chance: p,
        ...(push.expected > 0 ? { expectedDamage: p * push.expected } : {}),
        breakdown: [{ label: 'Atletismo enfrentado', value: pct(p), term: 'contest' }, ...push.lines],
        affectedTiles: [push.to],
      };
    }
    if (id === 'stabilize') {
      if (!targetEntity || !hasCondition(targetEntity, 'downed') || hasCondition(targetEntity, 'stable')) return { valid: false, reason: 'Solo sirve con un aliado caído que se desangra.' };
      const p = chanceToSucceed(mod(e, 'wis') + (hasTag(e, 'prof:medicine') ? profBonus(e) : 0), 10);
      return { valid: true, chance: p, breakdown: [{ label: 'Medicina CD 10', value: pct(p), term: 'dc' }] };
    }
    if (id === 'turn_undead') {
      const undead = Object.values(state.entities).filter((o) => isHostile(e, o) && standing(o) && hasTag(o, 'type:undead') && gridDistance(o.position, e.position) <= 6);
      return undead.length ? { valid: true, chance: 0.6 } : { valid: false, reason: 'No hay muertos vivientes cerca.' };
    }
    if (id === 'preserve_life') return { valid: true, chance: 1, expectedHealing: preserveLifePlan(state, e).reduce((s, [, n]) => s + n, 0) };
    return { valid: true, chance: 1 };
  }
  return { valid: false, reason: 'Acción desconocida.' };
}

/** An oil barrel's burst (3d6 fire, DEX save for half: ~7.5 each), for previews and the AI. */
export const OIL_BLAST = 7.5;

/** Who an oil barrel would burn if this attack breaks it (one hit does): everyone within 1 tile. */
export function oilBarrelCollateral(state: GameState, barrel: Entity, breakChance: number): { entityId: string; damage: number }[] {
  if (!hasTag(barrel, 'explosive_oil')) return [];
  return Object.values(state.entities)
    .filter((o) => o.id !== barrel.id && !o.tags.includes(OBJECT_TAG) && standing(o) && gridDistance(o.position, barrel.position) <= 1)
    .map((o) => ({ entityId: o.id, damage: breakChance * OIL_BLAST }));
}

/** Prediction of a push away from `from`: where it lands and whether it falls (for previews). */
function describePush(state: GameState, target: Entity, from: Vec2, distance: number): { to: Vec2; lines: NonNullable<ActionPreview['breakdown']>; expected: number } {
  const sim = simulatePush(dnd5eRef(), state, target.id, Math.sign(target.position.x - from.x), Math.sign(target.position.y - from.y), distance);
  const lines: NonNullable<ActionPreview['breakdown']> = [];
  if (sim.dropped > 1) lines.push({ label: `Cae ${sim.dropped} niveles`, value: `~${((sim.dropped - 1) * 3.5).toFixed(1).replace('.', ',')} de daño y derribado`, term: 'fall' });
  else if (sim.collidedWith) lines.push({ label: 'Choca contra algo', value: sim.to.x === target.position.x && sim.to.y === target.position.y ? 'no se mueve' : '' });
  const surface = surfaceAt(state, sim.to);
  if (surface) lines.push({ label: 'Acaba sobre', value: SURFACES[surface.type]?.label ?? surface.type, term: 'surface' });
  // An armed trap where it lands goes off under it.
  const trap = trapAt(state, sim.to);
  const moved = sim.to.x !== target.position.x || sim.to.y !== target.position.y;
  const trapDamage = trap?.armed && moved && trap.params.damage ? averageOf(parseDice(String(trap.params.damage))) : 0;
  if (trapDamage > 0) lines.push({ label: 'Cae en una trampa', value: `~${trapDamage.toFixed(1).replace('.', ',')} de daño`, term: 'trap' });
  // What the shove is worth in hit points, so the AI (and the numbers) value a good push.
  const expected = (sim.dropped > 1 ? (sim.dropped - 1) * 3.5 : 0) + (surface ? (SURFACES[surface.type]?.hazard ?? 0) : 0) + trapDamage;
  return { to: sim.to, lines, expected };
}

/** The defender resists a shove with Athletics or Acrobatics, whichever is better. */
function bestEscape(t: Entity): string {
  return skillBonus(t, 'acrobatics') > skillBonus(t, 'athletics') ? 'acrobatics' : 'athletics';
}

function skillBonus(e: Entity, skill: string): number {
  return mod(e, SKILLS[skill]!.ability) + (hasTag(e, `prof:${skill}`) ? profBonus(e) : 0);
}

/** Exact chance that d20 + a ≥ d20 + b (ties go to the attacker), or vs a flat 10 for objects. */
function shoveChance(attacker: Entity, target: Entity): number {
  const a = skillBonus(attacker, 'athletics');
  if (target.tags.includes(OBJECT_TAG)) return Math.min(1, Math.max(0, (21 - (10 - a)) / 20));
  const b = skillBonus(target, bestEscape(target));
  let wins = 0;
  for (let x = 1; x <= 20; x++) for (let y = 1; y <= 20; y++) if (x + a >= y + b) wins++;
  return wins / 400;
}

function pct(p: number): string {
  return `${Math.round(p * 100)} %`;
}

function attackBreakdown(p: ReturnType<typeof attackPreview>, attacks: number, sneak: boolean): ActionPreview['breakdown'] {
  if (p.object) return [{ label: 'Impacta siempre (objeto)', value: '100 %', term: 'hit_chance' }, ...(attacks > 1 ? [{ label: 'Ataques', value: String(attacks) }] : [])];
  return [
    { label: 'Probabilidad de acierto', value: pct(p.chance), term: 'hit_chance' },
    { label: 'Bonificador de ataque', value: `${p.bonus >= 0 ? '+' : ''}${p.bonus}`, term: 'attack_bonus' },
    { label: 'CA del objetivo', value: String(p.ac), term: 'ac' },
    ...(p.mode !== 'normal' ? [{ label: p.mode === 'advantage' ? 'Ventaja' : 'Desventaja', value: p.reasons.join(', '), term: p.mode }] : []),
    ...(p.cover.bonus ? [{ label: 'Cobertura', value: `+${p.cover.bonus} CA (${p.cover.label})`, term: 'cover' }] : []),
    ...(attacks > 1 ? [{ label: 'Ataques', value: String(attacks) }] : []),
    ...(sneak ? [{ label: 'Ataque furtivo', term: 'sneak_attack' }] : []),
  ];
}

function preserveLifePlan(state: GameState, cleric: Entity): [string, number][] {
  let pool = 5 * stat(cleric, 'level', 1);
  const plan: [string, number][] = [];
  const allies = Object.values(state.entities)
    .filter((o) => !isHostile(o, cleric) && !hasCondition(o, 'dead') && gridDistance(o.position, cleric.position) <= 6 && o.resources.hp)
    .sort((a, b) => a.resources.hp!.current / a.resources.hp!.max - b.resources.hp!.current / b.resources.hp!.max);
  for (const a of allies) {
    const cap = Math.max(0, Math.floor(a.resources.hp!.max / 2) - a.resources.hp!.current);
    const give = Math.min(cap, pool);
    if (give > 0) plan.push([a.id, give]);
    pool -= give;
  }
  return plan;
}

// --- Perform -------------------------------------------------------------------------------

export function performAction(ruleset: Ruleset, state: GameState, actorId: string, actionId: string, target: ActionTarget, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[actorId]!;
  const [kind, id] = actionId.split(':') as [string, string];
  const targetId = target.entityId;

  if (kind === 'attack') {
    for (const w of attackSequence(e, id)) {
      const t = r.entity(targetId!);
      if (!standing(t)) break;
      const sneak = sneakApplies(r.state, r.entity(actorId), w, t);
      const { hit, damage } = resolveAttack(r, weaponAttackSpec(r.state, r.entity(actorId), w, t.id, sneak));
      if (hit && sneak) r.apply({ type: 'modifyResource', entityId: actorId, resource: 'sneak_attack', delta: -1 });
      if (hit) applyRider(r, actorId, w, t.id, damage);
    }
    return r.outcome();
  }

  if (kind === 'spell' || kind === 'ability') {
    castSpell(r, actorId, castableOf(kind, id)!, id, target);
    return r.outcome();
  }

  switch (id) {
    case 'second_wind':
      heal(r, actorId, sum(rollDice(rng, 1, 10)) + stat(e, 'level', 1));
      break;
    case 'action_surge':
      r.apply({ type: 'modifyResource', entityId: actorId, resource: 'extra_action', delta: 1 });
      break;
    case 'dash':
      r.apply({ type: 'applyCondition', entityId: actorId, condition: 'dashing', remainingTurns: 1 });
      break;
    case 'disengage':
      r.apply({ type: 'applyCondition', entityId: actorId, condition: 'disengaged', remainingTurns: 1 });
      break;
    case 'dodge':
      r.apply({ type: 'applyCondition', entityId: actorId, condition: 'dodging', remainingTurns: 1 });
      break;
    case 'shove': {
      const t = r.entity(targetId!);
      const attack = ruleset.resolveCheck(r.state, { actorId, check: 'athletics', target: 0 }, rng);
      const defence = t.tags.includes(OBJECT_TAG) ? 10 : ruleset.resolveCheck(r.state, { actorId: t.id, check: bestEscape(t), target: 0 }, rng).total;
      const won = attack.total >= defence;
      r.emit({ type: 'saveRolled', entityId: actorId, roll: { ...attack, target: defence, targetLabel: 'oposición', success: won } } as never);
      if (won) r.apply({ type: 'push', entityId: t.id, dx: Math.sign(t.position.x - e.position.x), dy: Math.sign(t.position.y - e.position.y), distance: 1 });
      break;
    }
    case 'stabilize': {
      const check = ruleset.resolveCheck(r.state, { actorId, check: 'medicine', target: 10 }, rng);
      r.emit({ type: 'saveRolled', entityId: actorId, roll: check } as never);
      if (check.success) stabilize(r, targetId!);
      break;
    }
    case 'turn_undead': {
      const dc = spellDc(e, 'wis');
      for (const o of Object.values(r.state.entities)) {
        if (!isHostile(e, o) || !standing(o) || !hasTag(o, 'type:undead') || gridDistance(o.position, e.position) > 6) continue;
        if (!rollSave(r, o.id, 'wis', dc)) {
          // Destroy Undead (level 5): weak undead crumble instead of fleeing.
          if (hasFeature(e, 'destroy_undead') && (o.resources.hp?.max ?? 99) <= 22) dealDamage(r, o.id, 999, 'radiant');
          else r.apply({ type: 'applyCondition', entityId: o.id, condition: 'turned', remainingTurns: 10 });
        }
      }
      break;
    }
    case 'preserve_life':
      for (const [allyId, n] of preserveLifePlan(r.state, e)) heal(r, allyId, n);
      break;
  }
  return r.outcome();
}

function stabilize(r: Resolver, id: string): void {
  r.apply({ type: 'applyCondition', entityId: id, condition: 'stable' });
  r.emit({ type: 'stabilized', entityId: id } as never);
}

function castSpell(r: Resolver, casterId: string, spell: Castable, spellId: string, target: ActionTarget): void {
  const caster = r.entity(casterId);
  const ability = castingAbility(caster) ?? 'int';
  const slot = spell.level === 0 ? 0 : (lowestSlot(caster, spell.level) ?? spell.level);
  // Area spells (cones, lines, spheres) carry their affected tiles, so the client can
  // draw a flare per tile without duplicating the shape math that already lives here.
  const aimedAt = target.tile ?? (target.entityId ? r.state.entities[target.entityId]?.position : undefined) ?? caster.position;
  const tiles = spell.area ? areaTiles(r.state, caster, spell, aimedAt) : undefined;
  r.emit({ type: 'spellCast', casterId, spellId, target, ...(tiles ? { tiles } : {}) } as never);

  if (spell.concentration) {
    endConcentration(r, casterId);
    r.apply({ type: 'applyCondition', entityId: casterId, condition: 'concentrating' });
  }
  const conditionFor = (id: string) =>
    spell.condition && !conditionImmune(r.entity(id), spell.condition.id)
      ? [{ type: 'applyCondition' as const, entityId: id, condition: spell.condition.id, remainingTurns: spell.condition.turns, ...(spell.concentration ? { sourceId: concentrationSource(casterId) } : {}) }]
      : [];

  switch (spell.special) {
    case 'stabilize':
      stabilize(r, target.entityId!);
      return;
    case 'teleport':
      r.apply({ type: 'setPosition', entityId: casterId, position: target.tile! });
      return;
    case 'aid':
      for (const t of spellTargets(r.state, caster, spell, target)) r.apply({ type: 'modifyResourceMax', entityId: t.id, resource: 'hp', delta: 5 });
      return;
    case 'cleanse': {
      const t = r.entity(target.entityId!);
      const bad = t.conditions.find((c) => ['poisoned', 'blinded', 'paralyzed', 'deafened'].includes(c.id));
      if (bad) r.apply({ type: 'removeCondition', entityId: t.id, condition: bad.id });
      return;
    }
    case 'revivify': {
      const id = target.entityId!;
      r.apply({ type: 'removeCondition', entityId: id, condition: 'dead' }, { type: 'removeCondition', entityId: id, condition: 'downed' });
      r.apply({ type: 'modifyResource', entityId: id, resource: 'hp', delta: 1 });
      r.emit({ type: 'revived', entityId: id } as never);
      return;
    }
    case 'spirit_guardians':
      r.apply(...conditionFor(casterId));
      return;
    case 'shield':
      return;
  }

  // The ground first: Grease lays its surface before anyone rolls to keep their feet.
  const touched = touchedTiles(r.state, caster, spell, target);
  if (spell.surface) r.apply({ type: 'spawnSurface', tiles: touched, surface: spell.surface });
  try {
    resolveSpellOnCreatures(r, casterId, spell, target, slot);
  } finally {
    if (spell.element && touched.length) r.apply({ type: 'applyElement', tiles: touched, element: spell.element });
  }
}

/** Tiles a spell touches for surface purposes: its area, or the target's tile. */
function touchedTiles(state: GameState, caster: Entity, spell: SpellData, target: ActionTarget): Vec2[] {
  if (spell.area) return areaTiles(state, caster, spell, target.tile ?? (target.entityId ? state.entities[target.entityId]?.position : undefined) ?? caster.position);
  const ids = target.entityIds ?? (target.entityId ? [target.entityId] : []);
  const tiles = ids.map((id) => state.entities[id]?.position).filter((p): p is Vec2 => !!p);
  return tiles.length ? tiles : target.tile ? [target.tile] : [];
}

function resolveSpellOnCreatures(r: Resolver, casterId: string, spell: Castable, target: ActionTarget, slot: number): void {
  const caster = r.entity(casterId);
  const ability = castingAbility(caster) ?? 'int';
  const conditionFor = (id: string) =>
    spell.condition && !conditionImmune(r.entity(id), spell.condition.id)
      ? [{ type: 'applyCondition' as const, entityId: id, condition: spell.condition.id, remainingTurns: spell.condition.turns, ...(spell.concentration ? { sourceId: concentrationSource(casterId) } : {}) }]
      : [];
  const victims = spellTargets(r.state, caster, spell, target);
  if (spell.attack) {
    for (const id of dartTargets(spell, target)) {
      const t = r.entity(id);
      if (!standing(t)) continue;
      const { hit } = resolveAttack(r, spellAttackSpec(r.entity(casterId), spell, t.id));
      if (hit) r.apply(...conditionFor(t.id));
    }
    return;
  }
  if (spell.autoHit && spell.damage) {
    const d = spellDamage(caster, spell)!;
    for (const id of dartTargets(spell, target)) dealDamage(r, id, sum(rollDice(r.rng, d.count, d.sides)) + d.bonus, spell.damage.type);
    return;
  }
  if (spell.save) {
    const dc = castDc(caster, spell);
    const d = spellDamage(caster, spell);
    const damage = d ? sum(rollDice(r.rng, d.count, d.sides)) + d.bonus : 0;
    for (const v of victims) {
      const saved = rollSave(r, v.id, spell.save.ability, dc, spell.damage?.type, spell.condition?.id);
      if (d) {
        const half = spell.save.half || (spell.level === 0 && hasFeature(caster, 'potent_cantrip'));
        const amount = saved ? (half ? Math.floor(damage / 2) : 0) : damage;
        if (amount > 0) dealDamage(r, v.id, amount, spell.damage!.type);
      }
      if (!saved) r.apply(...conditionFor(v.id));
      // Thunderwave: those who fail are thrown back, away from the caster.
      if (!saved && spell.push && standing(r.entity(v.id))) {
        const p = r.entity(v.id).position;
        r.apply({ type: 'push', entityId: v.id, dx: Math.sign(p.x - caster.position.x), dy: Math.sign(p.y - caster.position.y), distance: spell.push });
      }
    }
    return;
  }
  if (spell.heal) {
    for (const v of victims) {
      heal(r, v.id, healAmount(caster, spell, slot, r.rng));
      // Blessed Healer (level 6): healing others heals the cleric too.
      if (v.id !== casterId && hasFeature(caster, 'blessed_healer')) heal(r, casterId, 2 + slot);
    }
    return;
  }
  for (const v of victims) r.apply(...conditionFor(v.id));
}
