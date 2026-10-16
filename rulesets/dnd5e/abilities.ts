export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<Ability, string> = {
  str: 'Fuerza',
  dex: 'Destreza',
  con: 'Constitución',
  int: 'Inteligencia',
  wis: 'Sabiduría',
  cha: 'Carisma',
};

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** SRD proficiency bonus by character level. */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export interface Skill {
  ability: Ability;
  label: string;
}

export const SKILLS: Record<string, Skill> = {
  acrobatics: { ability: 'dex', label: 'Acrobacias' },
  animal_handling: { ability: 'wis', label: 'Trato con animales' },
  arcana: { ability: 'int', label: 'Arcanos' },
  athletics: { ability: 'str', label: 'Atletismo' },
  deception: { ability: 'cha', label: 'Engaño' },
  history: { ability: 'int', label: 'Historia' },
  insight: { ability: 'wis', label: 'Perspicacia' },
  intimidation: { ability: 'cha', label: 'Intimidación' },
  investigation: { ability: 'int', label: 'Investigación' },
  medicine: { ability: 'wis', label: 'Medicina' },
  nature: { ability: 'int', label: 'Naturaleza' },
  perception: { ability: 'wis', label: 'Percepción' },
  performance: { ability: 'cha', label: 'Interpretación' },
  persuasion: { ability: 'cha', label: 'Persuasión' },
  religion: { ability: 'int', label: 'Religión' },
  sleight_of_hand: { ability: 'dex', label: 'Juego de manos' },
  stealth: { ability: 'dex', label: 'Sigilo' },
  survival: { ability: 'wis', label: 'Supervivencia' },
};
