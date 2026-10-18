import { type CreationChoices, type CreationSpec, type CreationStep, type Entity, type Vec2, pointsSpent } from '../../engine';
import { ABILITIES, ABILITY_LABELS, type Ability } from './abilities';
import { createCharacter } from './character';
import { CLASSES, RACES } from './data';

/** SRD point buy: 27 points, scores 8–15 before racial bonuses. */
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

/** A sound spread per class (27 points), best ability first. */
const RECOMMENDED: Record<string, Record<Ability, number>> = {
  fighter: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  rogue: { str: 8, dex: 15, con: 14, int: 12, wis: 13, cha: 10 },
  wizard: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 8 },
  cleric: { str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 },
};

const RACE_TEXT: Record<string, string> = {
  human: 'La mayoría. Nadie se fija en ti. +1 a todo.',
  elf: 'Pocos, viejos y ricos por interés compuesto. Los enanos te odian. Destreza e Inteligencia, visión en la oscuridad, Percepción.',
  dwarf: 'Mineros de oficio, respetados en la mina y vigilados fuera. Odian a los elfos. Constitución y Sabiduría, duros, visión en la oscuridad.',
  halfling: 'Siempre subestimado: unas veces sale caro y otras barato. Destreza y Carisma, suertudo y valiente.',
  half_orc: 'Recelo en todas partes, y ningún respeto que lo compense. Fuerza y Constitución, aguante incansable, críticos salvajes.',
};

const CLASS_TEXT: Record<string, string> = {
  fighter: 'Armadura, espada y aguante. Resuelve lo que los demás discuten.',
  rogue: 'Golpes por la espalda, cerraduras y trampas. Ataque furtivo.',
  wizard: 'Magia de libro: fuego, empujones y escudos. Frágil y decisivo.',
  cleric: 'Cura, bendice y aguanta. Alguien contesta a sus oraciones; mejor no preguntar quién.',
};

const POINTS: Extract<CreationStep, { kind: 'points' }> = {
  id: 'abilities',
  kind: 'points',
  label: 'Características',
  help: 'Reparte 27 puntos. Subir una característica alta cuesta más. Tu raza suma después.',
  stats: ABILITIES.map((a) => ({ id: a, label: ABILITY_LABELS[a] })),
  min: 8,
  max: 15,
  budget: 27,
  cost: POINT_COST,
  recommended: (choices) => ({ ...RECOMMENDED[String(choices.class)] ?? RECOMMENDED.fighter! }),
  bonuses: (choices) => ({ ...(RACES[String(choices.race)]?.abilityBonus ?? {}) }) as Record<string, number>,
};

/** The protagonist's creation steps: name, race, class, then abilities. */
export const DND5E_CREATION: CreationSpec = {
  steps: [
    { id: 'name', kind: 'text', label: 'Nombre', default: 'Cobrador', maxLength: 18 },
    { id: 'race', kind: 'pick', label: 'Raza', options: Object.entries(RACES).map(([id, r]) => ({ id, label: r.label, text: RACE_TEXT[id] ?? '' })) },
    { id: 'class', kind: 'pick', label: 'Clase', options: Object.entries(CLASSES).filter(([, c]) => c.label).map(([id, c]) => ({ id, label: c.label, text: CLASS_TEXT[id] ?? '' })) },
    POINTS,
  ],
};

/** Default answers: what "Partida rápida" uses. */
export function defaultCreation(): CreationChoices {
  return { name: 'Cobrador', race: 'human', class: 'wizard', abilities: { ...RECOMMENDED.wizard! } };
}

/** Builds the protagonist from the answers; throws on invalid point spreads. */
export function buildProtagonist(
  choices: CreationChoices,
  base: { id: string; controllerId: string; factionId: string; position: Vec2; spriteId: string; level: number; extraTags?: string[] },
): Entity {
  // Exactly the six abilities: missing ones default to the minimum, extra keys are ignored.
  const given = (choices.abilities ?? {}) as Record<string, number>;
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, Number.isFinite(given[a]) ? given[a]! : POINTS.min])) as Record<Ability, number>;
  const spent = pointsSpent(POINTS, abilities);
  if (spent === null || spent > POINTS.budget) throw new Error(`dnd5e: invalid point buy (${spent})`);
  const raceId = String(choices.race);
  const classId = String(choices.class);
  if (!RACES[raceId] || !CLASSES[classId]) throw new Error(`dnd5e: unknown race/class ${raceId}/${classId}`);
  const name = String(choices.name ?? '').trim().slice(0, 18) || 'Cobrador';
  return createCharacter({ ...base, name, raceId, classId, abilities: { ...abilities } });
}

export type { CreationChoices };

/** Tags createCharacter derives from class, race and level; everything else is the story's and is kept. */
const DERIVED_TAG = /^(pc|class:|race:|armor:|shield$|subclass:|feature:|weapon:|prof:|expert:|spell:)/;

/**
 * The same character at a new level: rebuilt from its class and race with its base
 * abilities, keeping its story tags, conditions, wounds and position.
 */
export function levelUpCharacter(e: Entity, level: number): Entity {
  const classId = e.tags.find((t) => t.startsWith('class:'))?.slice(6);
  const raceId = e.tags.find((t) => t.startsWith('race:'))?.slice(5);
  if (!classId || !raceId || !RACES[raceId] || !CLASSES[classId]) return e;
  const bonus = RACES[raceId]!.abilityBonus;
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, (e.stats[a] ?? 10) - (bonus[a] ?? 0)])) as Record<Ability, number>;
  const weapons = e.tags.filter((t) => t.startsWith('weapon:')).map((t) => t.slice(7));
  const rebuilt = createCharacter({
    id: e.id,
    name: e.name,
    controllerId: e.controllerId,
    factionId: e.factionId,
    position: e.position,
    spriteId: e.spriteId,
    classId,
    raceId,
    level,
    abilities,
    ...(weapons.length ? { weapons } : {}),
    extraTags: e.tags.filter((t) => !DERIVED_TAG.test(t)),
  });
  // Wounds stay wounds; the new hit points are on top.
  const oldHp = e.resources.hp;
  const hp = rebuilt.resources.hp!;
  if (oldHp) hp.current = Math.max(1, Math.min(hp.max, hp.max - (oldHp.max - oldHp.current)));
  // One more hit die per level; the ones already spent stay spent until a long rest.
  const oldDice = e.resources.hit_dice;
  const dice = rebuilt.resources.hit_dice;
  if (oldDice && dice) dice.current = Math.max(0, Math.min(dice.max, dice.max - (oldDice.max - oldDice.current)));
  return { ...rebuilt, conditions: e.conditions };
}
