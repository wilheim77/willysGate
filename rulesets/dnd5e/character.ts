import { type Entity, type Resource, type Vec2, hasTag, stat, tagValue } from '../../engine';
import { ABILITIES, type Ability, abilityModifier, proficiencyBonus } from './abilities';
import { ARMOR, CLASSES, ITEMS, MONSTERS, RACES, SPELL_SLOTS } from './data';

/**
 * Builds 5e entities from data. Everything the rules need later lives on the entity as
 * generic stats, resources and tags (see the conventions in index.ts).
 */

export interface CharacterSpec {
  id: string;
  name: string;
  controllerId: string;
  factionId: string;
  position: Vec2;
  spriteId: string;
  classId: string;
  raceId: string;
  level: number;
  /** Scores before racial bonuses (point buy, standard array...). */
  abilities: Record<Ability, number>;
  /** Override the class defaults. */
  weapons?: string[];
  spells?: string[];
  extraTags?: string[];
}

export interface MonsterSpec {
  id: string;
  name?: string;
  monsterId: string;
  controllerId: string;
  factionId: string;
  position: Vec2;
  spriteId: string;
  extraTags?: string[];
}

const pool = (n: number): Resource => ({ current: n, max: n });

/** Per-turn action economy shared by everyone. */
function actionEconomy(): Record<string, Resource> {
  return { action: pool(1), bonus_action: pool(1), reaction: pool(1) };
}

/** Value of a level-indexed table: the entry for the highest level <= `level`. */
export function atLevel<T>(table: Record<string, T> | undefined, level: number): T | undefined {
  if (!table) return undefined;
  let best: T | undefined;
  for (const [l, v] of Object.entries(table)) if (Number(l) <= level) best = v;
  return best;
}

export function createCharacter(spec: CharacterSpec): Entity {
  const cls = CLASSES[spec.classId];
  const race = RACES[spec.raceId];
  if (!cls) throw new Error(`dnd5e: unknown class "${spec.classId}"`);
  if (!race) throw new Error(`dnd5e: unknown race "${spec.raceId}"`);
  const level = spec.level;

  const abilities = { ...spec.abilities };
  for (const a of ABILITIES) abilities[a] += race.abilityBonus[a] ?? 0;
  const mod = (a: Ability) => abilityModifier(abilities[a]);

  const features: string[] = [];
  for (const [l, f] of Object.entries(cls.features)) if (Number(l) <= level) features.push(...f);
  features.push(...race.traits);

  // Hit points: max at level 1, average afterwards (SRD fixed value), + CON per level.
  const hpPerLevel = cls.hitDie / 2 + 1;
  let hp = cls.hitDie + mod('con') + (level - 1) * (hpPerLevel + mod('con'));
  if (features.includes('dwarven_toughness')) hp += level;

  const armor = ARMOR[cls.armor]!;
  const dexToAc = armor.maxDex === null ? mod('dex') : Math.min(mod('dex'), armor.maxDex);
  let ac = armor.base + dexToAc + (cls.shield ? 2 : 0);
  if (features.includes('fighting_style_defense') && cls.armor !== 'none') ac += 1;

  const resources: Record<string, Resource> = { hp: pool(hp), ...actionEconomy() };
  for (const [id, table] of Object.entries(cls.resources)) {
    const n = atLevel(table, level);
    if (n) resources[id] = pool(n);
  }
  // Turns left before a downed character dies (set to 3 when they drop).
  resources.bleed = { current: 0, max: 3 };
  if (features.includes('sneak_attack')) resources.sneak_attack = pool(1);
  if (features.includes('relentless_endurance')) resources.relentless = pool(1);
  if (features.includes('action_surge')) resources.extra_action = { current: 0, max: 1 };
  if (cls.spellcasting) {
    (SPELL_SLOTS[String(level)] ?? []).forEach((n, i) => {
      if (n > 0) resources[`spell_slot_${i + 1}`] = pool(n);
    });
  }

  const tags = [
    'pc',
    `class:${spec.classId}`,
    `race:${spec.raceId}`,
    `armor:${cls.armor}`,
    ...(cls.shield ? ['shield'] : []),
    ...(level >= cls.subclass.level ? [`subclass:${cls.subclass.id}`] : []),
    ...features.map((f) => `feature:${f}`),
    ...(spec.weapons ?? cls.weapons).map((w) => `weapon:${w}`),
    ...cls.saves.map((a) => `prof:save:${a}`),
    ...cls.skills.map((s) => `prof:${s}`),
    ...(race.skills ?? []).map((s) => `prof:${s}`),
    ...(race.tags ?? []),
    ...Object.entries(cls.expertise ?? {})
      .filter(([l]) => Number(l) <= level)
      .flatMap(([, skills]) => skills.map((s) => `expert:${s}`)),
    ...defaultSpells(spec.classId, level, spec.spells).map((s) => `spell:${s}`),
    ...(spec.extraTags ?? []),
  ];

  return {
    id: spec.id,
    name: spec.name,
    controllerId: spec.controllerId,
    factionId: spec.factionId,
    position: spec.position,
    spriteId: spec.spriteId,
    stats: { ...abilities, level, speed: race.speed, ac },
    resources,
    conditions: [],
    tags: [...new Set(tags)],
  };
}

function defaultSpells(classId: string, level: number, override?: string[]): string[] {
  if (override) return override;
  const table = CLASSES[classId]?.spellcasting?.defaultSpells ?? {};
  return Object.entries(table)
    .filter(([l]) => Number(l) <= level)
    .flatMap(([, s]) => s);
}

export function createMonster(spec: MonsterSpec): Entity {
  const m = MONSTERS[spec.monsterId];
  if (!m) throw new Error(`dnd5e: unknown monster "${spec.monsterId}"`);
  return {
    id: spec.id,
    name: spec.name ?? m.label,
    controllerId: spec.controllerId,
    factionId: spec.factionId,
    position: spec.position,
    spriteId: spec.spriteId,
    stats: { ...m.abilities, level: 1, speed: m.speed, ac: m.ac, prof: m.prof, multiattack: m.multiattack },
    resources: { hp: pool(m.hp), ...actionEconomy() },
    conditions: [],
    tags: [`monster:${spec.monsterId}`, ...m.weapons.map((w) => `weapon:${w}`), ...m.tags, ...(spec.extraTags ?? [])],
  };
}

// --- Derived values ------------------------------------------------------------

export function profBonus(e: Entity): number {
  return e.stats.prof ?? proficiencyBonus(stat(e, 'level', 1));
}

export function mod(e: Entity, a: Ability): number {
  return abilityModifier(stat(e, a, 10));
}

/** Armour class including active conditions (Shield, Shield of Faith, Mage Armor) and equipped magic gear. */
export function armorClass(e: Entity): number {
  let ac = stat(e, 'ac', 10) + equipmentAcBonus(e);
  if (e.conditions.some((c) => c.id === 'mage_armor') && tagValue(e, 'armor') === 'none') ac = Math.max(ac, 13 + mod(e, 'dex'));
  if (e.conditions.some((c) => c.id === 'shield_of_faith')) ac += 2;
  if (e.conditions.some((c) => c.id === 'shielded')) ac += 5;
  return ac;
}

export function castingAbility(e: Entity): Ability | undefined {
  return CLASSES[tagValue(e, 'class') ?? '']?.spellcasting?.ability;
}

export function hasFeature(e: Entity, f: string): boolean {
  return hasTag(e, `feature:${f}`);
}

export function tagValues(e: Entity, prefix: string): string[] {
  return e.tags.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));
}

// --- Equipment (weapon/armour/ring/cloak items from loot, see loot.ts and data/magic-items.json) ---

/** Mechanical item ids an entity currently has equipped (tag `item:<id>`, see the `equipItem` command). */
export function equippedItems(e: Entity): string[] {
  return tagValues(e, 'item');
}

/** Flat AC bonus from equipped magic armour, rings and cloaks. */
export function equipmentAcBonus(e: Entity): number {
  return equippedItems(e).reduce((sum, id) => sum + (ITEMS[id]?.acBonus ?? 0), 0);
}

/** Flat bonus to every saving throw from equipped rings and cloaks. */
export function equipmentSaveBonus(e: Entity): number {
  return equippedItems(e).reduce((sum, id) => sum + (ITEMS[id]?.saveBonus ?? 0), 0);
}

/** Attack and damage bonus a +N magic weapon gives when it matches the weapon being used. */
export function equippedWeaponBonus(e: Entity, weaponId: string): { attack: number; damage: number } {
  let attack = 0;
  let damage = 0;
  for (const id of equippedItems(e)) {
    const item = ITEMS[id];
    if (item?.kind === 'weapon' && item.baseWeapon === weaponId) {
      attack += item.attackBonus ?? 0;
      damage += item.damageBonus ?? 0;
    }
  }
  return { attack, damage };
}
