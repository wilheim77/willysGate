import type { GameState } from '../../../engine';
import type { Pattern } from './patterns';

/**
 * The show's rules data (audience, sponsors, deals, milestone boxes) lives in
 * content/willy/data/*.json; the game hands it to the ruleset once at start-up with
 * `configureShow` (content/willy/show.ts). Until then the show does nothing, so the ruleset's
 * own tests run without it.
 */

export interface AudienceRule {
  id: string;
  patron: Pattern;
  base?: number;
  porCampo?: Record<string, number>;
  multiplicador?: number;
  decrecientePorCombate?: number;
  pct?: number;
}

export interface AudienceData {
  inicial: number;
  maximo: number;
  porPlanta: Record<string, { mult: number; minimo: number }>;
  novedad: { primeraVezEnPartida: number; repeticionesRecientes: { ventanaTurnos: number; multiplicadores: number[] } };
  ganancias: AudienceRule[];
  perdidas: AudienceRule[];
  aburrimiento: { segundosDeReloj: number; pct: number };
  expectacionAlEntrarEnPlanta: { pct: number };
  tramos: { desde: number; nombre: string }[];
  /** Milestone boxes (loot-tables.json → recompensas.hitosAudiencia). */
  hitos: { espectadores: number; caja: string }[];
  /** End-of-planta bonus box by audience (loot-tables.json → recompensas.primaFinDePlanta). */
  prima: { audienciaMin: number; caja: string }[];
  /** Run multiplier for Sin repetición (DESIGN.md §12). */
  multSinRepeticion: number;
}

export interface SponsorLine {
  id: string;
  texto: string;
}

export interface SponsorGift {
  item?: string;
  caja?: string;
  peso?: number;
}

export interface SponsorDeal {
  id: string;
  /** What the sponsor asks, in its voice. */
  texto: string;
  /** Events that count towards it (any of them). */
  cuenta: Pattern[];
  /** How many by the end of the next floor. */
  cantidad: number;
  /** Events that break it on the spot (optional). */
  rompe?: Pattern[];
  recompensa: SponsorGift & { fichas?: number };
  /** Coins taken when it is broken or missed («penalización por incumplimiento»). */
  multa: number;
  mensajes: { oferta: SponsorLine[]; cumplido: SponsorLine[]; roto: SponsorLine[] };
}

export interface SponsorData {
  id: string;
  nombre: string;
  lema: string;
  color: string;
  retrato: string;
  audienciaMinima: number;
  gusta: { patron: Pattern; afinidad: number }[];
  disgusta: { patron: Pattern; afinidad: number }[];
  regalos: SponsorGift[];
  regaloGrande: SponsorGift;
  mensajes: Record<'interes' | 'regalo' | 'aviso' | 'retirada' | 'vuelta', SponsorLine[]>;
  contratos?: SponsorDeal[];
}

export interface SponsorRules {
  afinidad: { min: number; max: number; inicial: number };
  estados: { id: string; desde: number }[];
  retirada: { umbral: number };
  vuelta: { umbral: number };
  regalos: { cadaAfinidadExtra: number; maxPorPlanta: number };
}

export interface ShareConfig {
  /** The boss whose Share it is. */
  jefeId: string;
  inicial: number;
  max: number;
  /** He heals Share ÷ this at the start of his turn. */
  curacionDivisor: number;
  /** Share he wins each time Willy loses audience. */
  subePorPerdida: number;
  /** Share he wins each time he hits Willy. */
  subePorGolpe: number;
}

export interface ShowConfig {
  audience: AudienceData;
  share: ShareConfig;
  sponsors: { reglas: SponsorRules; patrocinadores: SponsorData[] };
}

let config: ShowConfig | undefined;

export function configureShow(c: ShowConfig): void {
  config = c;
}

export function showConfig(): ShowConfig | undefined {
  return config;
}

/** The planta (biome, 1-5) Willy is on: two floors per planta (floors.json → pisos). */
export function currentPlanta(state: GameState): number {
  const p = state.systems.planta as unknown as { bioma?: number } | undefined;
  return Math.max(1, Math.min(5, Number(p?.bioma ?? 1)));
}

/** Floor number (1-10) if Willy is on a floor, else undefined (Camerino, test maps). */
export function currentFloor(state: GameState): number | undefined {
  const m = /^planta-(\d+)$/.exec(state.map.id);
  return m ? Number(m[1]) : undefined;
}

/** The contestant the show is about. */
export const WILLY_ID = 'willy';

/** Deep copy of a JSON value (show bookkeeping is plain data). */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
