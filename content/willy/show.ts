import { type ShowConfig, configureShow } from '../../rulesets/willy/show';
import audience from './data/audience.json';
import floors from './data/floors.json';
import loot from './data/loot-tables.json';
import sponsors from './data/sponsors.json';
import finalBoss from './data/jefe-final.json';
import plantaBosses from './data/jefes.json';
import cast from './data/cast.json';

/**
 * Hands the show's data (audience, sponsors and their deals, milestone boxes, the presenter's
 * Share) to the Willy ruleset. Imported by setup.ts, so the game, the tests and the balance
 * simulator all run with the same show.
 */

const boss = (floors.plantas as unknown as { jefe?: { id: string; medidorShare?: { inicial: number; max: number }; fases?: { hasta: number; nombre: string }[]; preguntas?: { texto: string; correcta: string; falsas: string[] }[]; frases?: { id: string; al: string; texto: string }[] } }[])
  .map((p) => p.jefe)
  .find((j) => j?.medidorShare);

export const SHOW: ShowConfig = {
  pisos: floors.pisos.map((p) => ({ id: p.id, planta: p.planta, parte: p.parte })),
  audience: {
    ...(audience as unknown as ShowConfig['audience']),
    hitos: loot.fuentes.hitosAudiencia,
    prima: loot.fuentes.primaFinDePlanta,
    primaAlFilo: loot.fuentes.salidaConPocoReloj,
  },
  share: {
    jefeId: boss?.id ?? 'jefe-presentador',
    inicial: boss?.medidorShare?.inicial ?? 50,
    max: boss?.medidorShare?.max ?? 100,
    curacionPctVida: 5,
    subePorPerdida: 2,
    subePorGolpe: 2,
    votoPorRonda: 5,
    drenajeEnAntena: 10,
  },
  sponsors: sponsors as unknown as ShowConfig['sponsors'],
  bosses: Object.fromEntries(
    (floors.plantas as unknown as { jefe?: { id: string; fases?: { hasta: number }[] } }[])
      .map((p) => p.jefe)
      .filter((j): j is { id: string; fases?: { hasta: number }[] } => !!j && j.id in plantaBosses)
      .map((j) => [j.id, { ...(plantaBosses as unknown as Record<string, object>)[j.id], fases: (j.fases ?? []).map((f) => f.hasta) }]),
  ),
  boss: {
    jefeId: boss?.id ?? 'jefe-presentador',
    nombre: cast.presentador.nombre,
    fases: boss?.fases ?? [],
    preguntas: boss?.preguntas ?? [],
    frases: (boss?.frases ?? []).map((f) => ({ ...f, texto: f.texto.replaceAll('{presentador}', cast.presentador.nombre) })),
    rondaDePreguntas: finalBoss.rondaDePreguntas,
    pausaPublicitaria: finalBoss.pausaPublicitaria,
    alergiaALosFocos: finalBoss.alergiaALosFocos,
    granFinal: finalBoss.granFinal,
  },
};

configureShow(SHOW);
