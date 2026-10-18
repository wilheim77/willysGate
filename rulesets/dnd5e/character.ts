import { type Entity, type Resource, type Vec2, hasTag, stat, tagValue } from '../../engine';
import { ABILITIES, type Ability, abilityModifier, proficiencyBonus } from './abilities';
import { ARMOR, CLASSES, MONSTER_ACTIONS, MONSTERS, type MonsterData, RACES, SPELL_SLOTS } from './data';

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
    // Every playable SRD race is humanoid (Hold Person can target them).
    'type:humanoid',
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
  const resources: Record<string, Resource> = { hp: pool(m.hp), ...actionEconomy() };
  const stats: Record<string, number> = { ...m.abilities, level: 1, speed: m.speed, ac: m.ac, prof: m.prof, multiattack: m.multiattack };
  const tags = [`monster:${spec.monsterId}`, ...m.weapons.map((w) => `weapon:${w}`), ...m.tags];
  const sc = m.spellcasting;
  if (sc) {
    stats.caster_level = sc.level;
    tags.push(`casting:${sc.ability}`, ...sc.spells.map((s) => `spell:${s}`), ...Object.keys(sc.innate ?? {}).map((s) => `spell:${s}`));
    (sc.slots ?? []).forEach((n, i) => {
      if (n > 0) resources[`spell_slot_${i + 1}`] = pool(n);
    });
    for (const [s, n] of Object.entries(sc.innate ?? {})) resources[`innate_${s}`] = pool(n);
  }
  for (const a of m.actions ?? []) {
    if (!MONSTER_ACTIONS[a]) throw new Error(`dnd5e: monster "${spec.monsterId}" has unknown action "${a}"`);
    tags.push(`action:${a}`);
    resources[`use_${a}`] = pool(MONSTER_ACTIONS[a]!.perDay ?? 1);
  }
  if (m.keepAway) stats.keep_away = m.keepAway;
  return {
    id: spec.id,
    name: spec.name ?? m.label,
    controllerId: spec.controllerId,
    factionId: spec.factionId,
    position: spec.position,
    spriteId: spec.spriteId,
    stats,
    resources,
    conditions: (m.startConditions ?? []).map((id) => ({ id })),
    tags: [...new Set([...tags, ...(spec.extraTags ?? [])])],
  };
}

/** The SRD stat block an entity was built from, if it is a monster. */
export function monsterOf(e: Entity): MonsterData | undefined {
  return MONSTERS[tagValue(e, 'monster') ?? ''];
}

// --- Derived values ------------------------------------------------------------

export function profBonus(e: Entity): number {
  return e.stats.prof ?? proficiencyBonus(stat(e, 'level', 1));
}

export function mod(e: Entity, a: Ability): number {
  return abilityModifier(stat(e, a, 10));
}

/** Armour class including active conditions (Shield, Shield of Faith, Mage Armor). */
export function armorClass(e: Entity): number {
  let ac = stat(e, 'ac', 10);
  if (e.conditions.some((c) => c.id === 'mage_armor') && tagValue(e, 'armor') === 'none') ac = Math.max(ac, 13 + mod(e, 'dex'));
  if (e.conditions.some((c) => c.id === 'shield_of_faith')) ac += 2;
  if (e.conditions.some((c) => c.id === 'shielded')) ac += 5;
  return ac;
}

export function castingAbility(e: Entity): Ability | undefined {
  return CLASSES[tagValue(e, 'class') ?? '']?.spellcasting?.ability ?? (tagValue(e, 'casting') as Ability | undefined);
}

export function hasFeature(e: Entity, f: string): boolean {
  return hasTag(e, `feature:${f}`);
}

export function tagValues(e: Entity, prefix: string): string[] {
  return e.tags.filter((t) => t.startsWith(`${prefix}:`)).map((t) => t.slice(prefix.length + 1));
}
