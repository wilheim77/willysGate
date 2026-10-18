import classesJson from './data/classes.json';
import willyJson from './data/willy.json';

/** Typed views over the Willy rules data in data/ (classes, abilities, Willy's fixed human traits). */

export type Attr = 'fue' | 'agi' | 'man' | 'agu' | 'car' | 'sue';

export interface AbilityData {
  id: string;
  nombre: string;
  nivelPersonaje: number;
  coste?: { acciones?: number; energia?: number };
  pasiva?: boolean;
  texto: string;
  niveles?: Record<string, unknown>;
  /** Own use thresholds (the 5G line has 6 levels). */
  subidaPorUso?: { umbrales: number[] };
  nombresPorNivel?: Record<string, string>;
  /** Shown until the first use (the 5G pretends to be useful until you try it). */
  textoSinEstrenar?: string;
}

export interface ClassData {
  id: string;
  nombre: string;
  resumen: string;
  descripcion: string;
  atributos: Partial<Record<Attr, number>>;
  objetosIniciales: string[];
  habilidades: AbilityData[];
  desventaja: { id: string; nombre: string; texto: string };
  ventajas: string[];
}

export interface BasicSkillData {
  id: string;
  nombre: string;
  texto: string;
  pasiva?: boolean;
  coste?: { acciones?: number };
}

interface ClassesFile {
  umbralesHabilidad: number[];
  habilidadesBasicas: BasicSkillData[];
  clases: ClassData[];
  ventajas: { generales: { id: string; nombre: string; texto: string }[]; deClase: Record<string, string> };
}

export const CLASSES_FILE = classesJson as unknown as ClassesFile;
export const CLASSES: Record<string, ClassData> = Object.fromEntries(CLASSES_FILE.clases.map((c) => [c.id, c]));
export const BASIC_SKILLS: BasicSkillData[] = CLASSES_FILE.habilidadesBasicas;
export const SKILL_THRESHOLDS: number[] = CLASSES_FILE.umbralesHabilidad;

export interface WillyTraits {
  atributosBase: Record<Attr, number>;
  atributosOrigen: Record<Attr, number>;
  puntosLibres: number;
  ventajas: { id: string; nombre: string; texto: string }[];
  desventaja: { id: string; nombre: string; texto: string };
  /** Health back at the end of each fight, as a share of the maximum (balance lever). */
  pausaPublicitaria: { vida: number };
}
export const WILLY = willyJson as unknown as WillyTraits;

/** Every ability id with a use counter (class abilities + basic skills). */
export function allAbilityIds(): string[] {
  const ids = new Set<string>(BASIC_SKILLS.map((s) => s.id));
  for (const c of CLASSES_FILE.clases) for (const h of c.habilidades) ids.add(h.id);
  return [...ids];
}

export function abilityData(classId: string | undefined, abilityId: string): AbilityData | undefined {
  return classId ? CLASSES[classId]?.habilidades.find((h) => h.id === abilityId) : undefined;
}
