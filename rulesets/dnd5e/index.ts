import {
  type CheckRequest,
  type ConditionDef,
  type Entity,
  type GameState,
  type ResourceDef,
  type Ruleset,
  type StatDef,
  type Vec2,
  hasCondition,
  hasTag,
  stat,
  tagValue,
} from '../../engine';
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
  hp: { label: 'Puntos de golpe', refresh: 'longRest', visible: true },
  action: { label: 'Acción', refresh: 'turn' },
  bonus_action: { label: 'Acción adicional', refresh: 'turn' },
  reaction: { label: 'Reacción', refresh: 'turn' },
  spell_slot_1: { label: 'Espacios de conjuro (nv. 1)', refresh: 'longRest', visible: true },
  spell_slot_2: { label: 'Espacios de conjuro (nv. 2)', refresh: 'longRest', visible: true },
};

const conditions: Record<string, ConditionDef> = {
  blinded: { label: 'Cegado' },
  charmed: { label: 'Hechizado' },
  frightened: { label: 'Asustado' },
  incapacitated: { label: 'Incapacitado' },
  invisible: { label: 'Invisible' },
  paralyzed: { label: 'Paralizado' },
  poisoned: { label: 'Envenenado', description: 'Desventaja en tiradas de ataque y pruebas de característica.' },
  prone: { label: 'Derribado' },
  restrained: { label: 'Apresado', description: 'Velocidad 0.' },
  stunned: { label: 'Aturdido' },
  unconscious: { label: 'Inconsciente' },
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

  const modifiers = [{ label: ABILITY_LABELS[ability], value: abilityModifier(stat(actor, ability, 10)) }];
  if (proficiencyTag && hasTag(actor, proficiencyTag)) {
    modifiers.push({ label: 'Competencia', value: proficiencyBonus(stat(actor, 'level', 1)) });
  }
  return d20Check(rng, { check: req.check, label, mode: resolveRollMode(advantage, disadvantage), modifiers, target: req.target });
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

export const dnd5e: Ruleset = {
  id: 'dnd5e',
  version: 1,
  stats,
  resources,
  conditions,
  movement: { maxStep: 1, climbCost: 1 },
  movementBudget: (e) => (hasCondition(e, 'restrained') || hasCondition(e, 'paralyzed') ? 0 : stat(e, 'speed', 6)),
  resolveCheck,
  difficulty,
  dialogueConditions: {
    class: (s, id, p) => tagValue(s.entities[id]!, 'class') === p.is,
    race: (s, id, p) => tagValue(s.entities[id]!, 'race') === p.is,
    abilityAtLeast: (s, id, p) => stat(s.entities[id]!, String(p.ability), 10) >= Number(p.min),
    proficient: (s, id, p) => hasTag(s.entities[id]!, `prof:${String(p.skill)}`),
  },
  commands: {},
};

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
export type { Ability } from './abilities';
