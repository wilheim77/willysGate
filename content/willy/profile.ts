import type { GameEvent, GameState, JsonValue } from '../../engine';
import { type ProfileSnapshot, PROFILE_SYSTEM, classOf, counterNodes, metaOf, show } from '../../rulesets/willy';
import { CLASSES } from '../../rulesets/willy/data';
import { META_CONTENT } from './meta-content';

/**
 * The browser's profile (docs/willy/DESIGN.md §12, «Perfil por navegador»): what carries over
 * from one season to the next. Variety, never power: achievements and their lifetime counters,
 * items unlocked for the boxes, the rivals already met (so new ones are new), best marks, and
 * the «en directo» marks of seasons won without repetition. The client keeps it in localStorage
 * (src/game/profile.ts); these are the rules of what goes in it, pure functions.
 */

export interface EnDirecto {
  final: string;
  clase: string;
  nivel: number;
  fecha: string;
}

export interface WillyProfile {
  version: 1;
  logros: string[];
  /** Lifetime counts of «siempre» achievements, by counter key (achievement#node). */
  contadores: Record<string, number>;
  desbloqueos: string[];
  clasesJugadas: string[];
  clasesConVictoria: string[];
  /** The last rivals met, newest last (DESIGN §17: the last 40), as the generator's unique keys. */
  rivalesRecientes: { id: string; claves: string[] }[];
  rivalesVistos: number;
  razasRivales: string[];
  temporadas: { jugadas: number; ganadas: number; caidas: number };
  records: { mejorPlanta: number; mejorPlantaSinRepeticion: number; audienciaMaxima: number; nivelMaximo: number; logrosEnUnaTemporada: number; fichasMaximas: number };
  enDirecto: EnDirecto[];
}

export const RECENT_RIVALS = 40;

export function emptyProfile(): WillyProfile {
  return {
    version: 1,
    logros: [],
    contadores: {},
    desbloqueos: [],
    clasesJugadas: [],
    clasesConVictoria: [],
    rivalesRecientes: [],
    rivalesVistos: 0,
    razasRivales: [],
    temporadas: { jugadas: 0, ganadas: 0, caidas: 0 },
    records: { mejorPlanta: 0, mejorPlantaSinRepeticion: 0, audienciaMaxima: 0, nivelMaximo: 0, logrosEnUnaTemporada: 0, fichasMaximas: 0 },
    enDirecto: [],
  };
}

/** A stored profile made whole (older or damaged ones get defaults for what's missing). */
export function normalizeProfile(raw: unknown): WillyProfile {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<WillyProfile>;
  const base = emptyProfile();
  const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);
  return {
    version: 1,
    logros: arr(p.logros, base.logros),
    contadores: p.contadores && typeof p.contadores === 'object' ? p.contadores : {},
    desbloqueos: arr(p.desbloqueos, base.desbloqueos),
    clasesJugadas: arr(p.clasesJugadas, base.clasesJugadas),
    clasesConVictoria: arr(p.clasesConVictoria, base.clasesConVictoria),
    rivalesRecientes: arr(p.rivalesRecientes, base.rivalesRecientes),
    rivalesVistos: Number(p.rivalesVistos ?? 0) || 0,
    razasRivales: arr(p.razasRivales, base.razasRivales),
    temporadas: { ...base.temporadas, ...(p.temporadas ?? {}) },
    records: { ...base.records, ...(p.records ?? {}) },
    enDirecto: arr(p.enDirecto, base.enDirecto),
  };
}

/** A season starts: the rules get what they need from the profile (state.systems.perfil). */
export function injectProfile(state: GameState, raw: unknown): GameState {
  const p = normalizeProfile(raw);
  const snapshot: ProfileSnapshot = {
    logros: p.logros,
    contadores: p.contadores,
    desbloqueos: p.desbloqueos,
    clasesJugadas: p.clasesJugadas,
    clasesConVictoria: p.clasesConVictoria,
    rivalesVistos: p.rivalesVistos,
    razasRivales: p.razasRivales,
    rivalesRecientes: p.rivalesRecientes.flatMap((r) => r.claves),
  };
  return { ...state, systems: { ...state.systems, [PROFILE_SYSTEM]: snapshot as unknown as JsonValue } };
}

/** Counter keys of «siempre» achievements: they add up across seasons. */
const LIFETIME_KEYS: Set<string> = new Set(
  META_CONTENT.achievements.flatMap((a) => counterNodes(a.condicion).flatMap((n, i) => ('ambito' in n && n.ambito === 'siempre' ? [`${a.id}#${i}`] : []))),
);

const addUnique = <T>(list: T[], ...items: T[]) => {
  for (const i of items) if (!list.includes(i)) list.push(i);
};

/** The unique keys the rival generator checks (gen/rivals.ts → uniqueKeys), from the encounter's fields. */
function rivalKeysOf(e: Record<string, unknown>): string[] {
  const keys: string[] = [];
  if (e.rivalNombre && e.rivalApellido) keys.push(`nombre:${e.rivalNombre} ${e.rivalApellido}`);
  if (e.rivalApodo) keys.push(`apodo:${e.rivalApodo}`);
  return keys;
}

const floorOf = (state: GameState) => Number(/^planta-(\d+)$/.exec(state.map.id)?.[1] ?? 0);

/** The profile after a command: its events, and the best marks the state now shows. */
export function updateProfile(raw: unknown, events: GameEvent[], state: GameState, today: string): WillyProfile {
  const p = normalizeProfile(JSON.parse(JSON.stringify(raw ?? {})));
  const w = state.entities.willy;
  const cls = w ? classOf(w) : undefined;
  const hardcore = state.flags.modoEliminacion === 'sinRepeticion' && !state.flags.repeticionDetectada;
  for (const e of events as unknown as Record<string, unknown>[]) {
    switch (e.type) {
      case 'runStarted':
        p.temporadas.jugadas++;
        if (cls) addUnique(p.clasesJugadas, cls);
        break;
      case 'achievementUnlocked': {
        const id = String(e.logroId);
        addUnique(p.logros, id);
        const def = META_CONTENT.achievements.find((a) => a.id === id);
        for (const r of def?.recompensas ?? []) if ((r.tipo === 'desbloqueo' || r.tipo === 'cosmetico') && r.item) addUnique(p.desbloqueos, r.item);
        break;
      }
      case 'rivalEncountered': {
        const id = String(e.rival ?? '');
        if (!id || p.rivalesRecientes.some((r) => r.id === id && r.claves.length)) break;
        p.rivalesVistos++;
        if (typeof e.rivalRazaId === 'string' && e.rivalRazaId) addUnique(p.razasRivales, e.rivalRazaId);
        if (!e.legendario) p.rivalesRecientes = [...p.rivalesRecientes.filter((r) => r.id !== id), { id, claves: rivalKeysOf(e) }].slice(-RECENT_RIVALS);
        break;
      }
      case 'runEnded':
        if (e.resultado === 'victoria') {
          p.temporadas.ganadas++;
          if (cls) addUnique(p.clasesConVictoria, cls);
          // Won without repetition: the «en directo» mark (STORY.md §4).
          if (e.modoEliminacion === 'sinRepeticion' && hardcore) p.enDirecto.push({ final: String(e.final ?? ''), clase: cls ?? '', nivel: w?.stats.nivel ?? 1, fecha: today });
        } else if (e.resultado === 'eliminado') p.temporadas.caidas++;
        break;
    }
  }
  // Lifetime counters: the run's counts already started from the profile's (achievements.ts).
  for (const [key, c] of Object.entries(metaOf(state).cont)) if (LIFETIME_KEYS.has(key) && c.n > (p.contadores[key] ?? 0)) p.contadores[key] = c.n;
  const r = p.records;
  const floor = floorOf(state);
  r.mejorPlanta = Math.max(r.mejorPlanta, floor);
  if (hardcore) r.mejorPlantaSinRepeticion = Math.max(r.mejorPlantaSinRepeticion, floor);
  const audience = show.audienceOf(state);
  r.audienciaMaxima = Math.max(r.audienciaMaxima, audience?.pico ?? audience?.valor ?? 0);
  r.nivelMaximo = Math.max(r.nivelMaximo, w?.stats.nivel ?? 0);
  r.logrosEnUnaTemporada = Math.max(r.logrosEnUnaTemporada, metaOf(state).logros.length);
  r.fichasMaximas = Math.max(r.fichasMaximas, w?.resources.fichas?.current ?? 0);
  return p;
}

// --- What the client shows ------------------------------------------------------------------------

const FINAL_NAMES: Record<string, string> = { A: '«Nuevo presentador»', B: '«Vuelta a casa»', C: '«Letra pequeña»' };
const className = (id: string) => (CLASSES[id] as { nombre?: string } | undefined)?.nombre ?? id;

function viewers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} millones`;
  return n.toLocaleString('es-ES');
}

/** The title screen's mark: seasons won live, without repetition. */
export function profileBadge(raw: unknown): string | null {
  const n = normalizeProfile(raw).enDirecto.length;
  return n ? `🔴 EN DIRECTO${n > 1 ? ` ×${n}` : ''}` : null;
}

/** «Perfil / Récords». */
export function profileScreen(raw: unknown): { title: string; sections: { title: string; rows: { label: string; value: string }[] }[] } {
  const p = normalizeProfile(raw);
  const total = META_CONTENT.achievements.length;
  const r = p.records;
  return {
    title: 'Perfil y récords',
    sections: [
      {
        title: '🔴 En directo',
        rows: p.enDirecto.length
          ? p.enDirecto.map((d) => ({ label: `${FINAL_NAMES[d.final] ?? d.final} · ${className(d.clase)}`, value: `nivel ${d.nivel} · ${d.fecha}` }))
          : [{ label: 'Gana una temporada Sin repetición para ganarte la marca «en directo».', value: '' }],
      },
      {
        title: 'Temporadas',
        rows: [
          { label: 'Jugadas', value: String(p.temporadas.jugadas) },
          { label: 'Ganadas', value: String(p.temporadas.ganadas) },
          { label: 'Veces eliminado', value: String(p.temporadas.caidas) },
          { label: 'Clases jugadas', value: p.clasesJugadas.length ? p.clasesJugadas.map(className).join(', ') : '—' },
          { label: 'Clases con victoria', value: p.clasesConVictoria.length ? p.clasesConVictoria.map(className).join(', ') : '—' },
        ],
      },
      {
        title: 'Récords',
        rows: [
          { label: 'Planta más profunda', value: String(r.mejorPlanta) },
          { label: 'Planta más profunda sin repetición', value: String(r.mejorPlantaSinRepeticion) },
          { label: 'Audiencia máxima', value: viewers(r.audienciaMaxima) },
          { label: 'Nivel máximo', value: String(r.nivelMaximo) },
          { label: 'Logros en una temporada', value: String(r.logrosEnUnaTemporada) },
          { label: 'Más fichas a la vez', value: String(r.fichasMaximas) },
        ],
      },
      {
        title: 'Colección',
        rows: [
          { label: 'Logros', value: `${p.logros.length}/${total}` },
          { label: 'Objetos desbloqueados para las cajas', value: String(p.desbloqueos.filter((id) => META_CONTENT.items.find((i) => i.id === id)?.tipo !== 'cosmetico').length) },
          { label: 'Cosméticos', value: String(p.desbloqueos.filter((id) => META_CONTENT.items.find((i) => i.id === id)?.tipo === 'cosmetico').length) },
          { label: 'Mazmorreros rivales conocidos', value: String(p.rivalesVistos) },
        ],
      },
    ],
  };
}
