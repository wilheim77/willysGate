import type { GameState } from '../../engine';
import { FINAL_FLAG, RESULT_FLAG, metaOf, show } from '../../rulesets/willy';
import { ATTEMPT_FLAG } from './setup';

/**
 * Difficulty and elimination mode (docs/willy/DESIGN.md §12), chosen before the casting and fixed
 * for the run. They live in the state's flags (`dificultad`, `modoEliminacion`) so the rules, the
 * narrator and the show read them like anything else. The save policy is the client's business.
 * Shapes match GameDefinition.newGameSetup / savePolicy / defeat (no client imports here, so the
 * tests can load this file).
 */

interface SetupOption { id: string; label: string; text: string; recommended?: boolean; warning?: string; unavailableIf?: { question: string; is: string[]; reason: string } }
interface DefeatPolicy { text: string; retry?: { label: string; prepare?(checkpoint: GameState): GameState }; summary?: { title: string; lines: string[]; button: string } }

export const DIFFICULTY_FLAG = 'dificultad';
export const MODE_FLAG = 'modoEliminacion';

export const newGameSetup: { questions: { id: string; title: string; options: SetupOption[] }[]; apply(state: GameState, answers: Record<string, string>): GameState } = {
  questions: [
    {
      id: 'dificultad',
      title: 'Dificultad',
      options: [
        { id: 'turista', label: 'Turista', text: 'Reloj ×1,5 y los enemigos te hacen menos daño. Para ver el programa sin sudar la camiseta.', recommended: true },
        { id: 'concursante', label: 'Concursante', text: 'El concurso tal y como lo emite Canal Abismo.' },
        { id: 'primetime', label: 'Prime time', text: 'Reloj ×0,8 y los enemigos aguantan más golpes. Para los que ya se saben las trampas.' },
      ],
    },
    {
      id: 'modo',
      title: '¿Y si caes?',
      options: [
        { id: 'repeticion', label: 'Con repetición', text: 'Si caes, vuelves al último Camerino y la planta se recoloca. Pierdes lo de después, no la temporada.', recommended: true },
        {
          id: 'sinRepeticion',
          label: 'Sin repetición',
          text: 'Una sola vida. Si caes, se acaba la temporada.',
          warning: 'Una sola vida. Se guarda solo y no se puede volver atrás.',
          unavailableIf: { question: 'dificultad', is: ['turista'], reason: '(No disponible en Turista: elige Concursante o Prime time.)' },
        },
      ],
    },
  ],
  apply: (state, answers) => ({
    ...state,
    flags: { ...state.flags, [DIFFICULTY_FLAG]: answers.dificultad ?? 'concursante', [MODE_FLAG]: answers.modo === 'sinRepeticion' && answers.dificultad !== 'turista' ? 'sinRepeticion' : 'repeticion' },
  }),
};

const hardcore = (state: GameState) => state.flags[MODE_FLAG] === 'sinRepeticion' && !state.flags.repeticionDetectada;

export const savePolicy = (state: GameState): 'free' | 'permadeath' => (hardcore(state) ? 'permadeath' : 'free');

/** An older copy of a hardcore run was put back: it carries on, Con repetición (no punishment). */
export const onRestoredCopy = (state: GameState): GameState => ({ ...state, flags: { ...state.flags, [MODE_FLAG]: 'repeticion', repeticionDetectada: true } });

function floorReached(state: GameState): number {
  const ids = [state.map.id, ...Object.keys(((state.systems.world as { stashed?: Record<string, unknown> } | undefined)?.stashed) ?? {})];
  return Math.max(0, ...ids.map((id) => Number(/^planta-(\d+)$/.exec(id)?.[1] ?? 0)));
}

export const defeat = (state: GameState): DefeatPolicy => {
  if (hardcore(state)) {
    const meta = metaOf(state);
    const w = state.entities.willy;
    return {
      text: 'Se apagan los focos. Fin de la temporada de Willy.',
      summary: {
        title: 'Resumen de la temporada',
        lines: [
          `Planta alcanzada: ${floorReached(state)}`,
          `Nivel: ${w?.stats.nivel ?? 1}`,
          `Logros: ${meta.logros.length}`,
          `Cajas abiertas: ${meta.cajasAbiertas}`,
          `Fichas: ${w?.resources.fichas?.current ?? 0}`,
        ],
        button: 'Nueva temporada',
      },
    };
  }
  return {
    text: 'Willy ha caído. Corten. Producción le lleva en camilla al último Camerino y la mazmorra se recoloca.',
    retry: {
      label: 'Volver al Camerino',
      prepare: (checkpoint) => ({ ...checkpoint, flags: { ...checkpoint.flags, [ATTEMPT_FLAG]: Number(state.flags[ATTEMPT_FLAG] ?? 0) + 1 } }),
    },
  };
};

const FINAL_NAMES: Record<string, string> = { A: '«Nuevo presentador»', B: '«Vuelta a casa»', C: '«Letra pequeña»' };

function viewers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} millones`;
  return n.toLocaleString('es-ES');
}

/** A won season, once the ending's conversation is over: the summary (GameDefinition.ending). */
export const ending = (state: GameState): { title: string; lines: string[]; button: string } | null => {
  if (state.flags[RESULT_FLAG] !== 'victoria') return null;
  const meta = metaOf(state);
  const w = state.entities.willy;
  const audience = show.audienceOf(state);
  const final = String(state.flags[FINAL_FLAG] ?? '');
  return {
    title: hardcore(state) ? 'Temporada completada. En directo, sin repetición.' : 'Temporada completada',
    lines: [
      `Final: ${FINAL_NAMES[final] ?? final}`,
      `Nivel: ${w?.stats.nivel ?? 1}`,
      `Audiencia máxima: ${viewers(audience?.pico ?? audience?.valor ?? 0)} de espectadores`,
      `Repeticiones: ${Number(state.flags[ATTEMPT_FLAG] ?? 0)}`,
      `Logros: ${meta.logros.length}`,
      `Cajas abiertas: ${meta.cajasAbiertas}`,
      `Fichas: ${w?.resources.fichas?.current ?? 0}`,
      ...(hardcore(state) ? ['🔴 Marca «en directo» guardada en tu perfil'] : []),
    ],
    button: 'Nueva temporada',
  };
};
