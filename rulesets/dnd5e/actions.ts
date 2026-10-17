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
  hasTag,
  isHostile,
  stat,
  tagValue,
} from '../../engine';
import { ABILITY_LABELS, type Ability } from './abilities';
import { castingAbility, hasFeature, mod, profBonus, tagValues } from './character';
import { SPELLS, type SpellData, WEAPONS } from './data';
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
  heal,
  resolveAttack,
  rollSave,
  saveBonus,
  saveMode,
  spellAttackBonus,
  spellDc,
  standing,
} from './resolve';

/**
 * Action ids: "attack:<weapon>", "spell:<id>", "feature:<id>", "basic:<id>".
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
      description: `${weapon.damage} de daño ${DAMAGE_LABELS[weapon.type] ?? weapon.type}${attacksPerAction(e) > 1 ? ` · ${attacksPerAction(e)} ataques` : ''}.`,
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
    if (spell.level > 0) cost[`spell_slot_${slot ?? spell.level}`] = 1;
    actions.push({
      id: `spell:${id}`,
      label: spell.label,
      description: spell.text,
      cost,
      target: { kind: spell.target, range: spell.range, ...(spell.filter ? { filter: spell.filter } : {}) },
      tags: ['spell', spell.level === 0 ? 'cantrip' : `level${spell.level}`, ...(spell.damage ? ['damage'] : []), ...(spell.heal ? ['heal'] : []), ...(spell.area ? ['area'] : [])],
    });
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
    { id: 'basic:stabilize', label: 'Estabilizar', description: 'Prueba de Medicina (CD 10) para que un aliado caído deje de desangrarse.', cost: main, target: { kind: 'creature', range: 1, filter: 'ally' }, tags: ['support'] },
  );
  return actions;
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

// --- Weapon attacks ----------------------------------------------------------------

function weaponAttackSpec(state: GameState, attacker: Entity, weaponId: string, targetId: string, sneak: boolean): AttackSpec {
  const weapon = WEAPONS[weaponId]!;
  const ranged = weapon.properties.includes('ranged');
  const ability: Ability = ranged ? 'dex' : weapon.properties.includes('finesse') && mod(attacker, 'dex') > mod(attacker, 'str') ? 'dex' : 'str';
  const damage = parseDice(weapon.damage);
  const abilityMod = mod(attacker, ability);
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
    damage: { ...damage, bonus: damage.bonus + abilityMod },
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
  if (!hasFeature(attacker, 'sneak_attack') || (attacker.resources.sneak_attack?.current ?? 0) < 1) return false;
  if (!weapon.properties.includes('finesse') && !weapon.properties.includes('ranged')) return false;
  const { mode } = attackMode(state, attacker, target, !weapon.properties.includes('ranged'));
  if (mode === 'disadvantage') return false;
  if (mode === 'advantage') return true;
  return Object.values(state.entities).some((e) => e.id !== attacker.id && !isHostile(e, attacker) && standing(e) && gridDistance(e.position, target.position) === 1);
}

// --- Spells -------------------------------------------------------------------------

function spellDamage(caster: Entity, spell: SpellData): DiceExpr | null {
  if (!spell.damage) return null;
  const d = parseDice(spell.damage.dice);
  const level = stat(caster, 'level', 1);
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
    if (spell.area!.shape !== 'sphere' && e.id === caster.id) return false;
    // Evocation wizards carve safe pockets for their friends.
    if (sculpt && !isHostile(caster, e)) return false;
    return true;
  });
}

/** Creatures a targeted spell affects: the chosen one, plus the most wounded allies in range for multi-target spells. */
function spellTargets(state: GameState, caster: Entity, spell: SpellData, target: ActionTarget): Entity[] {
  if (spell.area) return areaVictims(state, caster, spell, target);
  if (spell.target === 'self') return [caster];
  const chosen = target.entityId ? state.entities[target.entityId] : undefined;
  if (!chosen) return [];
  if (!spell.maxTargets || spell.maxTargets <= 1) return [chosen];
  const missing = (e: Entity) => (e.resources.hp ? e.resources.hp.max - e.resources.hp.current : 0);
  const others = Object.values(state.entities)
    .filter((e) => e.id !== chosen.id && standing(e) && !isHostile(e, caster) && gridDistance(e.position, caster.position) <= spell.range)
    .sort((a, b) => missing(b) - missing(a) || a.id.localeCompare(b.id));
  return [chosen, ...others].slice(0, spell.maxTargets);
}

function spellAttackSpec(caster: Entity, spell: SpellData, targetId: string): AttackSpec {
  const ability = castingAbility(caster) ?? 'int';
  return {
    attackerId: caster.id,
    targetId,
    label: spell.label,
    modifiers: [
      { label: ABILITY_LABELS[ability], value: mod(caster, ability) },
      { label: 'Competencia', value: profBonus(caster), term: 'proficiency' },
    ],
    damage: spellDamage(caster, spell)!,
    damageType: spell.damage!.type,
    melee: spell.attack === 'melee',
    critOn: 20,
  };
}

// --- Preview ---------------------------------------------------------------------------

export function previewAction(state: GameState, actorId: string, actionId: string, target: ActionTarget): ActionPreview {
  const e = state.entities[actorId]!;
  const [kind, id] = actionId.split(':') as [string, string];
  const targetEntity = target.entityId ? state.entities[target.entityId] : undefined;

  if (kind === 'attack') {
    if (!targetEntity || !standing(targetEntity)) return { valid: false, reason: 'No hay a quién atacar ahí.' };
    const sneak = sneakApplies(state, e, id, targetEntity);
    const p = attackPreview(state, weaponAttackSpec(state, e, id, targetEntity.id, sneak));
    const n = attacksPerAction(e);
    return {
      valid: true,
      chance: p.chance,
      expectedDamage: p.expected * n,
      breakdown: attackBreakdown(p, n, sneak),
    };
  }

  if (kind === 'spell') {
    const spell = SPELLS[id]!;
    const ability = castingAbility(e) ?? 'int';
    if (spell.requiresTag && targetEntity && !hasTag(targetEntity, spell.requiresTag)) return { valid: false, reason: 'Este conjuro no afecta a esa criatura.' };
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

    const victims = spellTargets(state, e, spell, target);
    if (spell.attack && targetEntity) {
      const p = attackPreview(state, spellAttackSpec(e, spell, targetEntity.id));
      const n = spell.multi ?? 1;
      return { valid: true, chance: p.chance, expectedDamage: p.expected * n, breakdown: attackBreakdown(p, n, false) };
    }
    if (spell.autoHit && spell.damage) {
      const d = spellDamage(e, spell)!;
      return { valid: true, chance: 1, expectedDamage: averageOf(d) * (spell.multi ?? 1), breakdown: [{ label: 'Impacta siempre', value: '100 %', term: 'hit_chance' }] };
    }
    if (spell.save) {
      const dc = spellDc(e, ability);
      const dmg = spellDamage(e, spell);
      let expected = 0;
      let chance = 0;
      for (const v of victims) {
        const fail = 1 - chanceToSucceed(saveBonus(v, spell.save.ability) + (hasCondition(v, 'blessed') ? 2.5 : 0), dc, saveMode(v, spell.save.ability));
        chance = Math.max(chance, fail);
        if (dmg) {
          const avg = averageOf(dmg);
          const value = fail * avg + (1 - fail) * (spell.save.half ? avg / 2 : hasFeature(e, 'potent_cantrip') && spell.level === 0 ? avg / 2 : 0);
          // Friendly fire counts against the plan.
          expected += isHostile(e, v) ? value : -value * 1.5;
        }
      }
      const affectedTiles = spell.area ? areaTiles(state, e, spell, target.tile ?? targetEntity?.position ?? e.position) : undefined;
      if (spell.area && victims.filter((v) => isHostile(e, v)).length === 0) {
        return { valid: true, chance: 0, expectedDamage: 0, breakdown: [{ label: 'No alcanza a ningún enemigo' }], ...(affectedTiles ? { affectedTiles } : {}) };
      }
      return {
        ...(affectedTiles ? { affectedTiles } : {}),
        valid: true,
        chance,
        expectedDamage: Math.max(0, expected),
        breakdown: [
          { label: `CD ${dc} (${ABILITY_LABELS[spell.save.ability]})`, term: 'dc' },
          { label: 'Probabilidad de que falle la salvación', value: pct(chance), term: 'saving_throw' },
          ...(spell.area ? [{ label: `Afecta a ${victims.length} criatura(s)` }] : []),
        ],
      };
    }
    if (spell.heal) {
      const slot = spell.level === 0 ? 0 : (lowestSlot(e, spell.level) ?? spell.level);
      const amount = healAmount(e, spell, slot);
      return { valid: true, chance: 1, expectedHealing: amount * victims.length, breakdown: [{ label: `Cura ~${amount} por objetivo` }] };
    }
    return { valid: true, chance: 1 };
  }

  if (kind === 'feature' || kind === 'basic') {
    if (id === 'second_wind') return { valid: true, chance: 1, expectedHealing: 5.5 + stat(e, 'level', 1) };
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

function pct(p: number): string {
  return `${Math.round(p * 100)} %`;
}

function attackBreakdown(p: ReturnType<typeof attackPreview>, attacks: number, sneak: boolean): ActionPreview['breakdown'] {
  return [
    { label: 'Probabilidad de acierto', value: pct(p.chance), term: 'hit_chance' },
    { label: 'Bonificador de ataque', value: `${p.bonus >= 0 ? '+' : ''}${p.bonus}`, term: 'attack_bonus' },
    { label: 'CA del objetivo', value: String(p.ac), term: 'ac' },
    ...(p.mode !== 'normal' ? [{ label: p.mode === 'advantage' ? 'Ventaja' : 'Desventaja', value: p.reasons.join(', '), term: p.mode }] : []),
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
    for (let i = 0; i < attacksPerAction(e); i++) {
      const t = r.entity(targetId!);
      if (!standing(t)) break;
      const sneak = sneakApplies(r.state, r.entity(actorId), id, t);
      const { hit } = resolveAttack(r, weaponAttackSpec(r.state, r.entity(actorId), id, t.id, sneak));
      if (hit && sneak) r.apply({ type: 'modifyResource', entityId: actorId, resource: 'sneak_attack', delta: -1 });
    }
    return r.outcome();
  }

  if (kind === 'spell') {
    castSpell(r, actorId, SPELLS[id]!, id, target);
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

function castSpell(r: Resolver, casterId: string, spell: SpellData, spellId: string, target: ActionTarget): void {
  const caster = r.entity(casterId);
  const ability = castingAbility(caster) ?? 'int';
  const slot = spell.level === 0 ? 0 : (lowestSlot(caster, spell.level) ?? spell.level);
  r.emit({ type: 'spellCast', casterId, spellId, target } as never);

  if (spell.concentration) {
    endConcentration(r, casterId);
    r.apply({ type: 'applyCondition', entityId: casterId, condition: 'concentrating' });
  }
  const conditionFor = (id: string) =>
    spell.condition
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

  const victims = spellTargets(r.state, caster, spell, target);
  if (spell.attack) {
    for (let i = 0; i < (spell.multi ?? 1); i++) {
      const t = r.entity(target.entityId!);
      if (!standing(t)) break;
      const { hit } = resolveAttack(r, spellAttackSpec(r.entity(casterId), spell, t.id));
      if (hit) r.apply(...conditionFor(t.id));
    }
    return;
  }
  if (spell.autoHit && spell.damage) {
    const d = spellDamage(caster, spell)!;
    for (let i = 0; i < (spell.multi ?? 1); i++) dealDamage(r, target.entityId!, sum(rollDice(r.rng, d.count, d.sides)) + d.bonus, spell.damage.type);
    return;
  }
  if (spell.save) {
    const dc = spellDc(caster, ability);
    const d = spellDamage(caster, spell);
    const damage = d ? sum(rollDice(r.rng, d.count, d.sides)) + d.bonus : 0;
    for (const v of victims) {
      const saved = rollSave(r, v.id, spell.save.ability, dc, spell.damage?.type);
      if (d) {
        const half = spell.save.half || (spell.level === 0 && hasFeature(caster, 'potent_cantrip'));
        const amount = saved ? (half ? Math.floor(damage / 2) : 0) : damage;
        if (amount > 0) dealDamage(r, v.id, amount, spell.damage!.type);
      }
      if (!saved) r.apply(...conditionFor(v.id));
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
