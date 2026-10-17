import { describeEntity } from './sheet';
import {
  type ActionOutcome,
  type CheckRequest,
  type ConditionDef,
  type Entity,
  type GameState,
  type GlossaryEntry,
  type ResourceDef,
  type RngCursor,
  type Ruleset,
  type StatDef,
  type Vec2,
  gridDistance,
  hasCondition,
  hasTag,
  isHostile,
  stat,
  tagValue,
} from '../../engine';
import { listActions, performAction, previewAction } from './actions';
import { SURFACES, SURFACE_REACTIONS, onFall, onSurface } from './environment';
import { setDnd5eRef } from './ref';
import { profBonus } from './character';
import { SPELLS } from './data';
import { parseDice, rollDice, sum } from './dice';
import { Resolver, canReact, chanceToSucceed, dealDamage, die, heal, resolveAttack, rollSave, spellDc, standing } from './resolve';
import { d20Check, resolveRollMode } from '../common/d20';
import { ABILITIES, ABILITY_LABELS, type Ability, SKILLS, abilityModifier, proficiencyBonus } from './abilities';

/**
 * Simplified D&D 5e (SRD 5.1, CC-BY 4.0) as an engine ruleset.
 *
 * Entity conventions:
 * - stats: str, dex, con, int, wis, cha, level, speed (tiles), ac
 * - resources: hp, action, bonus_action, reaction, spell_slot_1, spell_slot_2
 * - tags: class:<id>, race:<id>, prof:<skill>, prof:save:<ability>
 */

const stats: Record<string, StatDef> = {
  ...Object.fromEntries(ABILITIES.map((a) => [a, { label: ABILITY_LABELS[a] }])),
  level: { label: 'Nivel' },
  speed: { label: 'Velocidad' },
  ac: { label: 'CA' },
};

const resources: Record<string, ResourceDef> = {
  hp: { label: 'Puntos de golpe', refresh: 'longRest', visible: true, role: 'health' },
  action: { label: 'Acción', refresh: 'turn' },
  bonus_action: { label: 'Acción adicional', refresh: 'turn' },
  reaction: { label: 'Reacción', refresh: 'turn' },
  extra_action: { label: 'Acción extra (oleada)', refresh: 'never' },
  sneak_attack: { label: 'Ataque furtivo', refresh: 'turn' },
  spell_slot_1: { label: 'Espacios de conjuro (nv. 1)', refresh: 'longRest', visible: true },
  spell_slot_2: { label: 'Espacios de conjuro (nv. 2)', refresh: 'longRest', visible: true },
  spell_slot_3: { label: 'Espacios de conjuro (nv. 3)', refresh: 'longRest', visible: true },
  second_wind: { label: 'Tomar aliento', refresh: 'shortRest' },
  action_surge: { label: 'Oleada de acción', refresh: 'shortRest' },
  channel_divinity: { label: 'Canalizar divinidad', refresh: 'shortRest' },
  relentless: { label: 'Aguante incansable', refresh: 'longRest' },
  bleed: { label: 'Turnos antes de morir', refresh: 'never' },
};

const conditions: Record<string, ConditionDef> = {
  blinded: { label: 'Cegado' },
  charmed: { label: 'Hechizado' },
  frightened: { label: 'Asustado' },
  incapacitated: { label: 'Incapacitado' },
  invisible: { label: 'Invisible' },
  paralyzed: { label: 'Paralizado', description: 'No puede moverse ni actuar. Los ataques cuerpo a cuerpo contra él son críticos.' },
  poisoned: { label: 'Envenenado', description: 'Desventaja en tiradas de ataque y pruebas de característica.' },
  prone: { label: 'Derribado' },
  restrained: { label: 'Apresado', description: 'Velocidad 0.' },
  stunned: { label: 'Aturdido' },
  unconscious: { label: 'Inconsciente' },
  deafened: { label: 'Ensordecido' },
  downed: { label: 'Caído', description: 'A 0 puntos de golpe: se desangra. Si nadie lo cura o estabiliza en 3 turnos, muere.' },
  stable: { label: 'Estabilizado', description: 'Sigue inconsciente, pero ya no se desangra.' },
  dead: { label: 'Muerto' },
  concentrating: { label: 'Concentrado', description: 'Mantiene un conjuro. Si recibe daño, puede perderlo.' },
  blessed: { label: 'Bendecido', description: '+1d4 a ataques y salvaciones.' },
  guided: { label: 'Marcado por la saeta', description: 'El siguiente ataque contra él tiene ventaja.' },
  guided_check: { label: 'Orientado', description: '+1d4 a la siguiente prueba.' },
  shield_of_faith: { label: 'Escudo de fe', description: '+2 a la CA.' },
  shielded: { label: 'Escudo', description: '+5 a la CA hasta su siguiente turno.' },
  mage_armor: { label: 'Armadura de mago', description: 'CA 13 + Destreza.' },
  slowed: { label: 'Ralentizado', description: '2 casillas menos de movimiento.' },
  no_reactions: { label: 'Aturdido por la descarga', description: 'No puede usar reacciones.' },
  dodging: { label: 'Esquivando', description: 'Los ataques contra él tienen desventaja.' },
  dashing: { label: 'Corriendo', description: 'Movimiento doble este turno.' },
  disengaged: { label: 'Retirándose', description: 'No provoca ataques de oportunidad.' },
  turned: { label: 'Expulsado', description: 'Se acobarda y pierde sus turnos hasta que algo le hace daño.' },
  spirit_guardians: { label: 'Espíritus guardianes', description: 'Los enemigos que empiezan su turno cerca reciben daño radiante.' },
};

const glossary: Record<string, GlossaryEntry> = {
  ac: { label: 'CA (clase de armadura)', text: 'Lo difícil que es acertarte. Un ataque acierta si el dado más sus bonificadores iguala o supera la CA.' },
  dc: { label: 'CD (clase de dificultad)', text: 'El número que hay que igualar o superar con el dado más tus bonificadores para que algo salga bien.' },
  advantage: { label: 'Ventaja', text: 'Tiras dos dados de 20 y te quedas con el mayor. Pasa al atacar desde arriba o contra alguien indefenso.' },
  disadvantage: { label: 'Desventaja', text: 'Tiras dos dados de 20 y te quedas con el menor. Si tienes ventaja y desventaja a la vez, se anulan.' },
  saving_throw: { label: 'Tirada de salvación', text: 'Una tirada para resistir algo que te hacen: una bola de fuego, un veneno, un hechizo. Si sale bien, te libras o sufres menos.' },
  hit_chance: { label: 'Probabilidad de acierto', text: 'Lo que calcula el juego antes de que tires: cuántas veces de cada cien acertarías.' },
  attack_bonus: { label: 'Bonificador de ataque', text: 'Lo que se suma al dado de 20 al atacar: tu característica más tu competencia.' },
  proficiency: { label: 'Competencia', text: 'Un extra por saber hacer algo (un arma, una habilidad). Crece con el nivel.' },
  critical: { label: 'Crítico', text: 'Un 20 natural en el dado: acierto seguro y el doble de dados de daño.' },
  spell_slot: { label: 'Espacio de conjuro', text: 'Las «balas» de magia. Cada conjuro de nivel 1 o más gasta uno; se recuperan al descansar.' },
  concentration: { label: 'Concentración', text: 'Algunos conjuros duran mientras te concentras. Solo puedes mantener uno, y si te hieren puedes perderlo.' },
  action: { label: 'Acción', text: 'Lo principal que haces en tu turno: atacar, lanzar un conjuro, esquivar…' },
  bonus_action: { label: 'Acción adicional', text: 'Algo rápido además de tu acción, solo si una habilidad lo permite.' },
  reaction: { label: 'Reacción', text: 'Una respuesta fuera de tu turno, como el ataque de oportunidad. Una por ronda.' },
  opportunity_attack: { label: 'Ataque de oportunidad', text: 'Si te alejas de un enemigo que está pegado a ti, te ataca gratis. Retirarse lo evita.' },
  downed: { label: 'Caído', text: 'A 0 puntos de golpe un compañero cae y se desangra: tienes 3 turnos para curarlo o estabilizarlo.' },
  high_ground: { label: 'Desde arriba', text: 'Atacar desde un terreno más alto da ventaja.' },
  sneak_attack: { label: 'Ataque furtivo', text: 'El pícaro hace daño extra una vez por turno si tiene ventaja o un aliado junto al objetivo.' },
  bless: { label: 'Bendición', text: 'Suma 1d4 a ataques y salvaciones mientras dure.' },
  resistance: { label: 'Resistencia', text: 'Recibe la mitad de daño de ese tipo. Vulnerable: el doble. Inmune: nada.' },
  cover: { label: 'Cobertura', text: 'Si hay cajas, barriles o columnas entre tú y el objetivo, es más difícil acertarle: +2 a su CA con un obstáculo, +5 con dos.' },
  contest: { label: 'Tirada enfrentada', text: 'Los dos tiráis un dado de 20 y sumáis vuestra habilidad; gana el más alto (los empates, quien empuja).' },
  surface: { label: 'Superficie', text: 'Lo que cubre el suelo. El aceite y la grasa arden, el agua conduce el rayo y se congela, el hielo y la sangre hacen resbalar, el fuego quema.' },
  fall: { label: 'Caída', text: 'Bajar un nivel andando no hace daño. Si te empujan desde más alto, recibes 1d6 por cada nivel de más y caes derribado.' },
};

/** Spellcasting ability by class. */
const CASTING_ABILITY: Record<string, Ability> = { wizard: 'int', cleric: 'wis' };

/** Situational tags (from the map, dialogue or rules) that grant advantage or disadvantage. */
const ADVANTAGE_TAGS = new Set(['advantage', 'high_ground', 'help']);
const DISADVANTAGE_TAGS = new Set(['disadvantage', 'darkness']);

function parseCheck(check: string): { label: string; ability: Ability; proficiencyTag: string } {
  const skill = SKILLS[check];
  if (skill) return { label: skill.label, ability: skill.ability, proficiencyTag: `prof:${check}` };
  const [kind, ability] = check.split(':') as [string, Ability];
  if (ABILITIES.includes(ability) && (kind === 'save' || kind === 'ability')) {
    const label = kind === 'save' ? `Salvación de ${ABILITY_LABELS[ability]}` : ABILITY_LABELS[ability];
    return { label, ability, proficiencyTag: kind === 'save' ? `prof:save:${ability}` : '' };
  }
  throw new Error(`dnd5e: unknown check "${check}"`);
}

function resolveCheck(state: GameState, req: CheckRequest, rng: Parameters<Ruleset['resolveCheck']>[2]) {
  const actor = state.entities[req.actorId]!;
  const { label, ability, proficiencyTag } = parseCheck(req.check);
  const situational = req.situational ?? [];
  const isSave = req.check.startsWith('save:');

  const advantage = situational.some((t) => ADVANTAGE_TAGS.has(t));
  const disadvantage = situational.some((t) => DISADVANTAGE_TAGS.has(t)) || (!isSave && hasCondition(actor, 'poisoned'));

  const modifiers: { label: string; value: number; term?: string }[] = [{ label: ABILITY_LABELS[ability], value: abilityModifier(stat(actor, ability, 10)) }];
  if (proficiencyTag && hasTag(actor, proficiencyTag)) {
    const expert = hasTag(actor, proficiencyTag.replace('prof:', 'expert:'));
    modifiers.push({ label: expert ? 'Pericia' : 'Competencia', value: profBonus(actor) * (expert ? 2 : 1), term: 'proficiency' } as never);
  }
  // Guidance: +1d4 to ability checks while it lasts (not to saving throws).
  if (!isSave && hasCondition(actor, 'guided_check')) modifiers.push({ label: 'Orientación divina', value: rng.die(4), term: 'bless' });
  const result = d20Check(rng, { check: req.check, label, mode: resolveRollMode(advantage, disadvantage), modifiers, target: req.target });
  result.targetTerm = 'dc';
  return result;
}

/** The odds of resolveCheck, without rolling (Guidance counts as its average). */
function describeCheck(state: GameState, req: CheckRequest): { label: string; chance: number } {
  const actor = state.entities[req.actorId]!;
  const { label, ability, proficiencyTag } = parseCheck(req.check);
  const situational = req.situational ?? [];
  const isSave = req.check.startsWith('save:');
  const advantage = situational.some((t) => ADVANTAGE_TAGS.has(t));
  const disadvantage = situational.some((t) => DISADVANTAGE_TAGS.has(t)) || (!isSave && hasCondition(actor, 'poisoned'));
  let bonus = abilityModifier(stat(actor, ability, 10));
  if (proficiencyTag && hasTag(actor, proficiencyTag)) bonus += profBonus(actor) * (hasTag(actor, proficiencyTag.replace('prof:', 'expert:')) ? 2 : 1);
  if (!isSave && hasCondition(actor, 'guided_check')) bonus += 2.5;
  return { label, chance: chanceToSucceed(bonus, req.target, resolveRollMode(advantage, disadvantage)) };
}

function difficulty(state: GameState, entityId: string, source: string): number {
  const e = state.entities[entityId];
  if (!e) throw new Error(`dnd5e: unknown entity "${entityId}"`);
  if (source === 'spell') {
    const ability = CASTING_ABILITY[tagValue(e, 'class') ?? ''];
    if (!ability) return 10;
    return 8 + proficiencyBonus(stat(e, 'level', 1)) + abilityModifier(stat(e, ability, 10));
  }
  throw new Error(`dnd5e: unknown difficulty source "${source}"`);
}

const isAlive = (e: Entity) => !hasCondition(e, 'dead');

/** Start of turn: bleeding out, and damage from enemies' Spirit Guardians. */
function onTurnStart(ruleset: Ruleset, state: GameState, id: string, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id]!;
  if (hasCondition(e, 'downed') && !hasCondition(e, 'stable')) {
    r.apply({ type: 'modifyResource', entityId: id, resource: 'bleed', delta: -1 });
    const left = (e.resources.bleed?.current ?? 1) - 1;
    if (left <= 0) die(r, id);
    else r.emit({ type: 'bleeding', entityId: id, detail: String(left) } as never);
    return r.outcome();
  }
  if (standing(e)) {
    for (const guardian of Object.values(state.entities)) {
      if (!hasCondition(guardian, 'spirit_guardians') || !isHostile(guardian, e) || gridDistance(guardian.position, e.position) > 3) continue;
      const spell = SPELLS.spirit_guardians!;
      const damage = parseDice(spell.damage!.dice);
      const total = sum(rollDice(rng, damage.count, damage.sides));
      const saved = rollSave(r, id, 'wis', spellDc(guardian, 'wis'));
      dealDamage(r, id, saved ? Math.floor(total / 2) : total, 'radiant');
    }
  }
  return r.outcome();
}

/** Opportunity attack with the first melee weapon, unless the mover disengaged. */
function onLeaveReach(ruleset: Ruleset, state: GameState, reactorId: string, moverId: string, rng: RngCursor): ActionOutcome | null {
  const reactor = state.entities[reactorId]!;
  const mover = state.entities[moverId]!;
  if (!canReact(reactor) || hasCondition(mover, 'disengaged')) return null;
  const melee = listActions(state, reactorId).find((a) => a.tags.includes('weapon') && a.tags.includes('melee'));
  if (!melee) return null;
  const r = new Resolver(ruleset, state, rng);
  r.apply({ type: 'modifyResource', entityId: reactorId, resource: 'reaction', delta: -1 });
  r.emit({ type: 'reactionUsed', entityId: reactorId, detail: 'Ataque de oportunidad' } as never);
  const preview = previewAction(state, reactorId, melee.id, { entityId: moverId });
  if (preview.valid) {
    const outcome = performActionOnce(ruleset, r.state, reactorId, melee.id, moverId, rng);
    r.apply(...outcome.effects);
    for (const ev of outcome.events) r.emit(ev);
  }
  return r.outcome();
}

/** A single weapon attack (reactions never get Extra Attack). */
function performActionOnce(ruleset: Ruleset, state: GameState, attackerId: string, actionId: string, targetId: string, rng: RngCursor): ActionOutcome {
  const attacker = state.entities[attackerId]!;
  const once = { ...attacker, stats: { ...attacker.stats, multiattack: 1 }, tags: attacker.tags.filter((t) => t !== 'feature:extra_attack') };
  return performAction(ruleset, { ...state, entities: { ...state.entities, [attackerId]: once } }, attackerId, actionId, { entityId: targetId }, rng);
}

/** After a fight the winners' fallen get back up with 1 hit point; nobody keeps an unspent surge. */
function onCombatEnd(ruleset: Ruleset, state: GameState, winner: string | null): ActionOutcome {
  const r = new Resolver(ruleset, state, null as never);
  for (const e of Object.values(state.entities)) {
    if (e.factionId === winner && hasCondition(e, 'downed')) heal(r, e.id, 1);
    if ((e.resources.extra_action?.current ?? 0) > 0) r.apply({ type: 'modifyResource', entityId: e.id, resource: 'extra_action', delta: -1 });
  }
  return r.outcome();
}

export const dnd5e: Ruleset = {
  id: 'dnd5e',
  version: 1,
  stats,
  resources,
  conditions,
  glossary,
  movement: { maxStep: 1, climbCost: 1 },
  movementBudget: (e) => {
    if (['restrained', 'paralyzed', 'stunned', 'downed', 'dead'].some((c) => hasCondition(e, c))) return 0;
    const base = stat(e, 'speed', 6);
    const speed = base * (hasCondition(e, 'dashing') ? 2 : 1);
    // Getting up from prone costs half your speed.
    const standUp = hasCondition(e, 'prone') ? Math.ceil(base / 2) : 0;
    return Math.max(0, speed - standUp - (hasCondition(e, 'slowed') ? 2 : 0));
  },
  resolveCheck,
  describeCheck,
  difficulty,
  dialogueConditions: {
    class: (s, id, p) => tagValue(s.entities[id]!, 'class') === p.is,
    race: (s, id, p) => tagValue(s.entities[id]!, 'race') === p.is,
    abilityAtLeast: (s, id, p) => stat(s.entities[id]!, String(p.ability), 10) >= Number(p.min),
    proficient: (s, id, p) => hasTag(s.entities[id]!, `prof:${String(p.skill)}`),
  },
  commands: {},

  rollInitiative: (state, id, rng) => {
    const e = state.entities[id]!;
    const dex = abilityModifier(stat(e, 'dex', 10));
    return rng.die(20) + dex + stat(e, 'dex', 10) / 100;
  },
  // Turned undead cower (simplified: they lose their turns until something hurts them).
  canAct: (e) => standing(e) && !['paralyzed', 'stunned', 'unconscious', 'incapacitated', 'turned'].some((c) => hasCondition(e, c)),
  isStanding: (e) => standing(e) && isAlive(e),
  // A fallen companion still lies there; only the dead and smashed scenery free the tile.
  occupiesTile: (e) => !hasCondition(e, 'dead') && (e.tags.includes('object') ? standing(e) : true),
  onTurnStart: (state, id, rng) => onTurnStart(dnd5e, state, id, rng),
  listActions,
  previewAction,
  performAction: (state, actorId, actionId, target, rng) => performAction(dnd5e, state, actorId, actionId, target, rng),
  onLeaveReach: (state, reactorId, moverId, rng) => onLeaveReach(dnd5e, state, reactorId, moverId, rng),
  onCombatEnd: (state, winner) => onCombatEnd(dnd5e, state, winner),
  surfaces: SURFACES,
  surfaceReactions: SURFACE_REACTIONS,
  onSurface: (state, id, surface, trigger, rng) => onSurface(dnd5e, state, id, surface, trigger, rng),
  onFall: (state, id, levels, rng) => onFall(dnd5e, state, id, levels, rng),
  describeEntity: (state, id) => describeEntity(state, id, { resources, conditions }),
};
setDnd5eRef(dnd5e);

export interface CreatureSpec {
  id: string;
  name: string;
  controllerId: string;
  factionId: string;
  position: Vec2;
  spriteId: string;
  abilities: Record<Ability, number>;
  level?: number;
  /** In tiles (5 ft each). */
  speed?: number;
  ac: number;
  hp: number;
  tags?: string[];
}

/** Builds a 5e entity with the standard stats and per-turn resources. */
export function createCreature(spec: CreatureSpec): Entity {
  return {
    id: spec.id,
    name: spec.name,
    controllerId: spec.controllerId,
    factionId: spec.factionId,
    position: spec.position,
    spriteId: spec.spriteId,
    stats: { ...spec.abilities, level: spec.level ?? 1, speed: spec.speed ?? 6, ac: spec.ac },
    resources: {
      hp: { current: spec.hp, max: spec.hp },
      action: { current: 1, max: 1 },
      bonus_action: { current: 1, max: 1 },
      reaction: { current: 1, max: 1 },
    },
    conditions: [],
    tags: spec.tags ?? [],
  };
}

export { ABILITIES, ABILITY_LABELS, SKILLS, abilityModifier, proficiencyBonus } from './abilities';
export { createCharacter, createMonster, armorClass, type CharacterSpec, type MonsterSpec } from './character';
export { CLASSES, MONSTERS, RACES, SPELLS, WEAPONS } from './data';
export { areaTiles, DAMAGE_LABELS } from './actions';
export { createProp, SURFACES, type PropSpec } from './environment';
export { coverBetween } from './cover';
export { FEATURES } from './sheet';
export type { AttackRolledEvent, DamageDealtEvent, FateEvent, HealedEvent, SaveRolledEvent } from './resolve';
export type { Ability } from './abilities';
