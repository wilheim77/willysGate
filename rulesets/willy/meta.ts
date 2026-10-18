import type { Effect, GameState, JsonValue } from '../../engine';

/**
 * The show's meta layer (achievements, loot boxes, items) needs the game's data, which lives
 * in content/willy (the ruleset never imports content/). The game hands it over once at start
 * with configureWillyContent(); without it these systems simply stay off (tests, the balance sim).
 */

export type Rarity = 'bronce' | 'plata' | 'oro' | 'legendaria';
export const RARITIES: Rarity[] = ['bronce', 'plata', 'oro', 'legendaria'];

export interface ItemEffect {
  type: string;
  [key: string]: JsonValue | undefined;
}

export interface ItemUse {
  objetivo: 'self' | 'aliado' | 'enemigo' | 'casilla' | 'area' | 'cono' | 'linea';
  alcance?: number;
  radio?: number;
  centro?: string;
  filtro?: 'enemigos' | 'todos' | 'aliados';
  lineaDeVision?: boolean;
  coste: Record<string, number>;
  efectos: ItemEffect[];
  unaVezPor?: string;
}

export interface ItemDef {
  id: string;
  nombre: string;
  rareza: Rarity;
  tipo: 'consumible' | 'herramienta' | 'equipo' | 'aviso' | 'cosmetico' | 'chatarra';
  ranura?: string;
  inicial?: boolean;
  unico?: boolean;
  maldito?: boolean;
  usos?: number;
  descripcion: string;
  regla: string;
  usar?: ItemUse;
  pasivo?: { stat: string; delta: number }[];
  inmunidades?: { condicion?: string; origen?: string; efecto?: string }[];
  disparadores?: { al: string; probabilidad?: number; unaVezPor?: string; efectos?: ItemEffect[] }[];
  etiquetas?: string[];
  desbloqueo?: string;
  patrocinador?: string;
  valor: number;
}

export interface BoxDef {
  nombre: string;
  descripcion: string;
  objetos: number;
  garantia: Rarity | null;
  pesosRareza: Record<Rarity, number>;
  fichas: [number, number];
  tabla: string;
}

export interface LootData {
  rarezas: Record<Rarity, { nombre: string; color: string; orden: number }>;
  cajas: Record<Rarity, BoxDef>;
  piedad: { oro: { cajasSin: number }; legendaria: { cajasSin: number }; maxCopiasPorPartida: Record<string, number> };
  fuentes: { jefes: Record<string, Rarity> };
  tablas: Record<string, { entradas: ({ tabla: string; peso: number } | { item: string; peso: number })[] }>;
  enemigos: Record<'normal' | 'elite' | 'jefe', { fichas: [number, number]; consumible: number; magico?: number; pesosRareza?: Partial<Record<Rarity, number>> }>;
  /** Items kept out of boxes until the systems they need exist (fog of war, mimics, audience...). */
  fueraDeCajas?: string[];
  /** Boxes won by fights (not achievements): elites, rivals, a floor cleared. */
  combates?: { elite?: Rarity; rival?: Rarity; plantaLimpia?: Rarity };
}

export type Match = string | number | boolean | { min?: number; max?: number } | { en: (string | number)[] } | { tiene: string } | { existe: boolean };
export interface EventPattern {
  evento: string;
  donde?: Record<string, Match>;
}
export type Scope = 'siempre' | 'partida' | 'planta' | 'combate' | 'turno';
export type Condition =
  | { contar: EventPattern; min: number; ambito: Scope }
  | { sumar: EventPattern; campo: string; min: number; ambito: Scope }
  | { al: string; si: Condition }
  | { dato: string; min?: number; max?: number; igual?: JsonValue }
  | { todas: Condition[] }
  | { alguna: Condition[] }
  | { no: Condition };

export interface Reward {
  tipo: 'caja' | 'xp' | 'cosmetico' | 'desbloqueo';
  nivel?: Rarity;
  item?: string;
  cantidad?: number;
}

export interface AchievementDef {
  id: string;
  nombre: string;
  categoria: string;
  oculto: boolean;
  pista?: string;
  descripcion: string;
  condicion: Condition;
  narrador: string;
  recompensas: Reward[];
}

export interface WillyContent {
  items: ItemDef[];
  loot: LootData;
  achievements: AchievementDef[];
  categories: Record<string, string>;
}

let CONTENT: WillyContent | null = null;
const configureHooks: ((c: WillyContent) => void)[] = [];

export function configureWillyContent(content: WillyContent): void {
  if (CONTENT === content) return;
  CONTENT = content;
  for (const hook of configureHooks) hook(content);
}

export function willyContent(): WillyContent | null {
  return CONTENT;
}

/** Run when the game hands over its content (items register their actions). */
export function onConfigure(hook: (c: WillyContent) => void): void {
  configureHooks.push(hook);
  if (CONTENT) hook(CONTENT);
}

export function itemDef(id: string): ItemDef | undefined {
  return CONTENT?.items.find((i) => i.id === id);
}

// --- Per-run state (state.systems.willyMeta) -------------------------------------------------

export interface PendingBox {
  id: string;
  nivel: Rarity;
  /** Where it came from: 'logro', 'jefe', 'combate', 'planta'. */
  origen: string;
  motivo?: string;
}

export interface CombatStats {
  enemigos: number;
  vidaInicial: number;
  vidaPerdida: number;
  eliminaciones: number;
  eliminacionesEntorno: number;
  ataquesConArmaDeWilly: number;
  criticos: number;
  fallosSeguidos: number;
  vidaMinimaPct: number;
  jefe?: string;
  elite: boolean;
  rival: boolean;
}

export interface MetaState {
  /** The run has started being tracked (the first command after the casting). */
  iniciado: boolean;
  /** Unlocked achievement ids, in unlock order. */
  logros: string[];
  /** Event counters per achievement, for its current scope key. */
  cont: Record<string, { k: string; n: number }>;
  /** Boxes waiting to be opened. */
  cajas: PendingBox[];
  cajasEntregadas: number;
  cajasAbiertas: number;
  piedad: { oro: number; legendaria: number };
  /** Equipped items: entity id → slot → item id. */
  equipo: Record<string, Record<string, string>>;
  /** Copies of each item obtained this run (unique items, max copies). */
  obtenidos: Record<string, number>;
  /** Items unlocked for the boxes by achievements this run. */
  desbloqueos: string[];
  combate: CombatStats | null;
  combates: number;
  /** Steps walked out of combat not yet turned into health. */
  pasos: number;
  pasosTotales: number;
  consumiblesCuracionUsados: number;
  /** Abilities Willy has used this run. */
  habilidadesUsadas: string[];
  /** Once-per-floor item triggers already spent, as "<item>@<map>". */
  gastados: string[];
  /** Floors cleared (every enemy down), by map id. */
  plantasLimpias: string[];
}

export const META = 'willyMeta';

export function emptyMeta(): MetaState {
  return {
    iniciado: false,
    logros: [],
    cont: {},
    cajas: [],
    cajasEntregadas: 0,
    cajasAbiertas: 0,
    piedad: { oro: 0, legendaria: 0 },
    equipo: {},
    obtenidos: {},
    desbloqueos: [],
    combate: null,
    combates: 0,
    pasos: 0,
    pasosTotales: 0,
    consumiblesCuracionUsados: 0,
    habilidadesUsadas: [],
    gastados: [],
    plantasLimpias: [],
  };
}

export function metaOf(state: GameState): MetaState {
  const m = state.systems[META] as unknown as Partial<MetaState> | undefined;
  return m ? { ...emptyMeta(), ...m } : emptyMeta();
}

/** A deep copy to edit (the meta state is plain JSON). */
export function cloneMeta<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function hasMeta(state: GameState): boolean {
  return state.systems[META] !== undefined;
}

export function setMeta(meta: MetaState): Effect {
  return { type: 'setSystem', system: META, value: meta as unknown as JsonValue };
}

export function equippedOf(state: GameState, entityId: string): Record<string, string> {
  return metaOf(state).equipo[entityId] ?? {};
}

export function hasEquipped(state: GameState, entityId: string, itemId: string): boolean {
  return Object.values(equippedOf(state, entityId)).includes(itemId);
}
