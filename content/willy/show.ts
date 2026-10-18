import { type ShowConfig, configureShow } from '../../rulesets/willy/show';
import audience from './data/audience.json';
import floors from './data/floors.json';
import loot from './data/loot-tables.json';
import sponsors from './data/sponsors.json';

/**
 * Hands the show's data (audience, sponsors and their deals, milestone boxes, the presenter's
 * Share) to the Willy ruleset. Imported by setup.ts, so the game, the tests and the balance
 * simulator all run with the same show.
 */

const boss = (floors.plantas as unknown as { jefe?: { id: string; medidorShare?: { inicial: number; max: number } } }[])
  .map((p) => p.jefe)
  .find((j) => j?.medidorShare);

export const SHOW: ShowConfig = {
  pisos: floors.pisos.map((p) => ({ id: p.id, planta: p.planta, parte: p.parte })),
  audience: {
    ...(audience as unknown as ShowConfig['audience']),
    hitos: loot.fuentes.hitosAudiencia,
    prima: loot.fuentes.primaFinDePlanta,
  },
  share: {
    jefeId: boss?.id ?? 'jefe-presentador',
    inicial: boss?.medidorShare?.inicial ?? 50,
    max: boss?.medidorShare?.max ?? 100,
    curacionDivisor: 10,
    subePorPerdida: 5,
    subePorGolpe: 2,
    votoPorRonda: 5,
    drenajeEnAntena: 10,
  },
  sponsors: sponsors as unknown as ShowConfig['sponsors'],
};

configureShow(SHOW);
