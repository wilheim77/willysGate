import { type Entity, type Vec2, hasCondition, hasTag, stat, tagValue } from '../../engine';
import { type Attr, CLASSES, SKILL_THRESHOLDS, WILLY, abilityData, allAbilityIds } from './data';

/**
 * Entity conventions for the Willy ruleset:
 * - stats: fue, agi, man, agu, car, sue (visible numbers), nivel, armadura
 * - resources: vida (health), energia, acciones (2 per turn), fichas, xp, uso:<ability> (use counters)
 * - tags: pc, clase:<id>, rasgo:<id>, arma:<dice>, alcance:<n>, distancia (ranged weapon),
 *   jefe, tamano:grande|enorme, redondo, inmune:<condition|element|empuje>
 */

export const ATTRS: Attr[] = ['fue', 'agi', 'man', 'agu', 'car', 'sue'];
export const ATTR_LABELS: Record<Attr, string> = { fue: 'Fuerza', agi: 'Agilidad', man: 'Maña', agu: 'Aguante', car: 'Carisma', sue: 'Suerte' };
export const ATTR_SHORT: Record<Attr, string> = { fue: 'FUE', agi: 'AGI', man: 'MAÑ', agu: 'AGU', car: 'CAR', sue: 'SUE' };

export const attr = (e: Entity, a: Attr): number => stat(e, a, 5);
export const level = (e: Entity): number => stat(e, 'nivel', 1);
export const classOf = (e: Entity): string | undefined => tagValue(e, 'clase');
export const hasTrait = (e: Entity, id: string): boolean => hasTag(e, `rasgo:${id}`);

/** Health: 10 + 2 × AGU + 3 per level after the first. */
export function maxHealth(attrs: Record<Attr, number>, lvl: number, bonus = 0): number {
  return 10 + 2 * attrs.agu + 3 * (lvl - 1) + bonus;
}

/** Energy: 3 + MAÑ ÷ 3. */
export function maxEnergy(attrs: Record<Attr, number>): number {
  return 3 + Math.floor(attrs.man / 3);
}

/** Defence: 10 + AGI ÷ 2 + armour (+ the Esquivar skill). */
export function defence(e: Entity): number {
  return 10 + Math.floor(attr(e, 'agi') / 2) + stat(e, 'armadura', 0) + Math.max(0, skillLevel(e, 'esquivar') - 1);
}

/** Damage bonus: FUE ÷ 3 in melee, AGI ÷ 3 at range. */
export function damageBonus(e: Entity, melee: boolean): number {
  const buff = hasCondition(e, 'animado') ? 1 : 0;
  // Creatures' damage dice already include their strength.
  if (hasTag(e, 'criatura')) return buff;
  return Math.floor(attr(e, melee ? 'fue' : 'agi') / 3) + buff;
}

/** Base movement in tiles: 4 + AGI ÷ 4. */
export function baseMovement(e: Entity): number {
  return stat(e, 'movimiento', 4 + Math.floor(attr(e, 'agi') / 4));
}

// --- Skills that level with use ---------------------------------------------------

export const useResource = (abilityId: string) => `uso:${abilityId}`;

export function abilityUses(e: Entity, abilityId: string): number {
  return e.resources[useResource(abilityId)]?.current ?? 0;
}

function thresholdsFor(e: Entity, abilityId: string): number[] {
  return abilityData(classOf(e), abilityId)?.subidaPorUso?.umbrales ?? SKILL_THRESHOLDS;
}

/** 1..5 (1..6 for abilities with their own thresholds), from the use counter. */
export function skillLevel(e: Entity, abilityId: string): number {
  const uses = abilityUses(e, abilityId);
  return thresholdsFor(e, abilityId).filter((t) => uses >= t).length;
}

/** The level an ability reaches after `uses` uses. */
export function levelAfter(e: Entity, abilityId: string, uses: number): number {
  return thresholdsFor(e, abilityId).filter((t) => uses >= t).length;
}

// --- Builders ----------------------------------------------------------------------

const BIG_RESOURCE = 99999;

function useCounters(): Entity['resources'] {
  return Object.fromEntries(allAbilityIds().map((id) => [useResource(id), { current: 0, max: BIG_RESOURCE }]));
}

export interface WillySpec {
  id: string;
  controllerId: string;
  factionId: string;
  position: Vec2;
  spriteId: string;
  classId: string;
  /** Free points spent on top of base + origin + class (3 at creation). */
  points?: Partial<Record<Attr, number>>;
  level?: number;
  name?: string;
  weapon?: string;
  reach?: number;
  extraTags?: string[];
}

/** Willy: always human (castreño); his class decides the rest. */
export function createWilly(spec: WillySpec): Entity {
  const cls = CLASSES[spec.classId];
  if (!cls) throw new Error(`willy: unknown class "${spec.classId}"`);
  const lvl = spec.level ?? 1;
  const attrs = Object.fromEntries(
    ATTRS.map((a) => [a, WILLY.atributosBase[a] + (WILLY.atributosOrigen[a] ?? 0) + (cls.atributos[a] ?? 0) + (spec.points?.[a] ?? 0)]),
  ) as Record<Attr, number>;
  const vida = maxHealth(attrs, lvl);
  const energia = maxEnergy(attrs);
  const traits = [...WILLY.ventajas.map((v) => v.id), WILLY.desventaja.id, cls.desventaja.id];
  const passives = cls.habilidades.filter((h) => h.pasiva && h.nivelPersonaje <= lvl).map((h) => h.id);
  const reach = spec.reach ?? (passives.includes('dos-metros-cuatro') ? 2 : 1);
  return {
    id: spec.id,
    name: spec.name ?? 'Willy',
    controllerId: spec.controllerId,
    factionId: spec.factionId,
    position: spec.position,
    spriteId: spec.spriteId,
    stats: { ...attrs, nivel: lvl, armadura: 0 },
    resources: {
      vida: { current: vida, max: vida },
      energia: { current: energia, max: energia },
      acciones: { current: 2, max: 2 },
      fichas: { current: 0, max: BIG_RESOURCE },
      xp: { current: 0, max: BIG_RESOURCE },
      ...useCounters(),
    },
    conditions: [],
    tags: [
      'pc',
      'humano',
      `clase:${cls.id}`,
      ...traits.map((t) => `rasgo:${t}`),
      ...passives.map((p) => `rasgo:${p}`),
      `arma:${spec.weapon ?? '1d6'}`,
      `alcance:${reach}`,
      ...(spec.extraTags ?? []),
    ],
  };
}

export interface CreatureSpec {
  id: string;
  name: string;
  controllerId: string;
  factionId: string;
  position: Vec2;
  spriteId: string;
  /** Fixed numbers from floors.json / rivals: vida, def, ataque (to-hit bonus), daño, movimiento. */
  vida: number;
  def: number;
  ataque: number;
  dano: string;
  movimiento: number;
  alcance?: number;
  distancia?: boolean;
  tags?: string[];
}

/** Monsters, bosses and rivals: fixed numbers instead of attributes. */
export function createCreature(spec: CreatureSpec): Entity {
  return {
    id: spec.id,
    name: spec.name,
    controllerId: spec.controllerId,
    factionId: spec.factionId,
    position: spec.position,
    spriteId: spec.spriteId,
    // DEF and to-hit come straight from the data: stats are chosen so the formulas give them.
    stats: { fue: 5, agi: 0, man: 5, agu: 5, car: 5, sue: 5, nivel: 1, armadura: spec.def - 10, ataque: spec.ataque, movimiento: spec.movimiento },
    resources: { vida: { current: spec.vida, max: spec.vida }, acciones: { current: 2, max: 2 } },
    conditions: [],
    tags: ['criatura', `arma:${spec.dano}`, `alcance:${spec.alcance ?? 1}`, ...(spec.distancia ? ['distancia'] : []), ...(spec.tags ?? [])],
  };
}

/** Attack bonus: creatures use their `ataque` number; Willy uses FUE (melee) or AGI (ranged). */
export function attackAttr(e: Entity, melee: boolean): { label: string; value: number } {
  if (e.stats.ataque !== undefined) return { label: 'Ataque', value: stat(e, 'ataque') };
  const a: Attr = melee ? 'fue' : 'agi';
  return { label: ATTR_LABELS[a], value: attr(e, a) };
}

export function isBoss(e: Entity): boolean {
  return hasTag(e, 'jefe');
}

export function isBig(e: Entity): boolean {
  return hasTag(e, 'tamano:grande') || hasTag(e, 'tamano:enorme') || isBoss(e);
}
