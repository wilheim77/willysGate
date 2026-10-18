import armorJson from './data/armor.json';
import classesJson from './data/classes.json';
import monsterActionsJson from './data/monster-actions.json';
import magicItemsJson from './data/magic-items.json';
import monstersJson from './data/monsters.json';
import racesJson from './data/races.json';
import spellsJson from './data/spells.json';
import weaponsJson from './data/weapons.json';
import type { Ability } from './abilities';

/** Typed views over the SRD data files in data/. Entries starting with '$' are comments. */

export interface WeaponData {
  label: string;
  damage: string;
  type: string;
  properties: string[];
  range: number;
}

export interface ArmorData {
  label: string;
  base: number;
  maxDex: number | null;
}

export interface MonsterData {
  label: string;
  abilities: Record<Ability, number>;
  ac: number;
  hp: number;
  speed: number;
  prof: number;
  weapons: string[];
  multiattack: number;
  tags: string[];
  xp: number;
  /** Spellcasting: SRD spells from spells.json, cast with slots or innately (x/day). */
  spellcasting?: MonsterSpellcasting;
  /** Innate or recharge powers from monster-actions.json. */
  actions?: string[];
  /** Effects a weapon adds when it hits (ghoul paralysis, wolf knockdown, life drain). */
  riders?: Record<string, Rider>;
  /** Attack action sequences by weapon, e.g. a wight's Life Drain then a longsword. */
  combos?: Record<string, string[]>;
  /** Conditions it starts with (a mage's Mage Armor). */
  startConditions?: string[];
  /** Tiles the AI keeps between it and the nearest enemy (casters). */
  keepAway?: number;
}

export interface MonsterSpellcasting {
  ability: Ability;
  /** Caster level: scales cantrips. */
  level: number;
  /** Slots per spell level, starting at level 1. */
  slots?: number[];
  spells: string[];
  /** Spells cast without slots, with their uses per day. */
  innate?: Record<string, number>;
}

/** What a weapon does on a hit besides its damage. */
export interface Rider {
  /** Saving throw that avoids it (or halves the extra damage). Without one, it always applies. */
  save?: { ability: Ability; dc: number; half?: boolean };
  condition?: { id: string; turns: number };
  /** Extra damage (a giant spider's poison). */
  damage?: { dice: string; type: string };
  /** On a failed save the hit point maximum drops by the damage taken (until the fight ends). */
  drain?: boolean;
  /** Creatures with any of these tags are unaffected (a ghoul's claws spare elves and undead). */
  immuneTags?: string[];
  label: string;
}

/** A monster's own power, shaped like a spell plus how often it can be used. */
export interface MonsterActionData extends SpellData {
  /** Comes back on a d6 roll of this or more at the start of the monster's turn. */
  recharge?: number;
  /** Uses per day. */
  perDay?: number;
  /** Fixed save DC (SRD stat blocks give one). */
  dc?: number;
  /** Ability for its attack roll. */
  attackAbility?: Ability;
}

export interface RaceData {
  label: string;
  abilityBonus: Partial<Record<Ability, number>>;
  speed: number;
  traits: string[];
  skills?: string[];
  tags?: string[];
}

export interface ClassData {
  label: string;
  subclass: { id: string; label: string; level: number };
  hitDie: number;
  saves: Ability[];
  skills: string[];
  expertise?: Record<string, string[]>;
  armor: string;
  shield: boolean;
  weapons: string[];
  spellcasting?: { ability: Ability; cantrips: Record<string, number>; defaultSpells: Record<string, string[]> };
  features: Record<string, string[]>;
  resources: Record<string, Record<string, number>>;
}

export interface SpellData {
  label: string;
  level: number;
  cast: 'action' | 'bonus_action' | 'reaction';
  range: number;
  target: 'creature' | 'self' | 'tile';
  filter?: 'hostile' | 'ally' | 'any';
  attack?: 'ranged' | 'melee';
  save?: { ability: Ability; half: boolean };
  damage?: { dice: string; type: string; scale?: boolean };
  heal?: { dice: string; addMod?: boolean };
  area?: { shape: 'sphere' | 'cone' | 'line'; size: number };
  condition?: { id: string; turns: number };
  multi?: number;
  autoHit?: boolean;
  maxTargets?: number;
  concentration?: boolean;
  requiresTag?: string;
  special?: string;
  /** Element applied to the tiles it touches (surface reactions). */
  element?: string;
  /** Surface laid over the area. */
  surface?: string;
  /** Tiles a failed save shoves creatures away from the caster. */
  push?: number;
  /** Whom an area affects (everyone by default). */
  areaFilter?: 'hostile' | 'ally';
  text: string;
}

/**
 * Mechanical behaviour for an item id (what inventory.ts tracks). Display label/text is
 * content data (content/<game>/items.json); this is only what the ruleset needs to make
 * it *do* something: a potion heals, a scroll/wand casts a spell, a weapon/armor/ring/cloak
 * gives a bonus once equipped (see character.ts's armorClass, resolve.ts's saveBonus and
 * actions.ts's weaponAttackSpec). 'misc' items (trade goods, ammo) are flavour only.
 */
export interface ItemData {
  kind: 'potion' | 'scroll' | 'wand' | 'weapon' | 'armor' | 'ring' | 'cloak' | 'misc';
  /** potion: dice healed when drunk. */
  heal?: string;
  /** scroll/wand: the spell it casts (by SPELLS id). */
  spell?: string;
  /** weapon: which WEAPONS entry it enhances once equipped, and by how much. */
  baseWeapon?: string;
  attackBonus?: number;
  damageBonus?: number;
  /** armor/ring/cloak: flat bonus to AC once equipped. */
  acBonus?: number;
  /** ring/cloak: flat bonus to every saving throw once equipped. */
  saveBonus?: number;
}

const entries = <T>(json: Record<string, unknown>): Record<string, T> =>
  Object.fromEntries(Object.entries(json).filter(([k]) => !k.startsWith('$'))) as Record<string, T>;

export const WEAPONS = entries<WeaponData>(weaponsJson);
export const ARMOR = entries<ArmorData>(armorJson);
export const MONSTERS = entries<MonsterData>(monstersJson);
export const MONSTER_ACTIONS = entries<MonsterActionData>(monsterActionsJson);
export const RACES = entries<RaceData>(racesJson);
export const SPELLS = entries<SpellData>(spellsJson);
const { spellSlots, ...classes } = entries<unknown>(classesJson) as Record<string, unknown>;
export const CLASSES = classes as Record<string, ClassData>;
export const SPELL_SLOTS = Object.fromEntries(Object.entries(spellSlots as Record<string, unknown>).filter(([k]) => !k.startsWith('$'))) as Record<string, number[]>;
export const ITEMS = entries<ItemData>(magicItemsJson);

/** Equippable/usable items an entity carries, tagged `item:<id>` once equipped (gear) or just counted in the party bag (consumables). */
export const EQUIP_PREFIX = 'item:';
