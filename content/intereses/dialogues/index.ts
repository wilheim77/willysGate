import type { DialogueTree } from '../../../engine';
import anselmo from './anselmo.json';
import caminoDorotea from './camino_dorotea.json';
import caminoGarran from './camino_garran.json';
import caminoMineros from './camino_mineros.json';
import caminoMinerosDespues from './camino_mineros_despues.json';
import cirilo from './cirilo.json';
import dorotea from './dorotea.json';
import garran from './garran.json';
import guardiaAbadia from './guardia_abadia.json';
import juicioAnselmo from './juicio_anselmo.json';
import nellaYesca from './nella_yesca.json';
import oddaHulla from './odda_hulla.json';
import plazaLlegada from './plaza_llegada.json';

/** The act's conversations and interactables, by tree id (generated list; one import per file). */
export const STORY_DIALOGUES: Record<string, DialogueTree> = Object.fromEntries(
  [anselmo, caminoDorotea, caminoGarran, caminoMineros, caminoMinerosDespues, cirilo, dorotea, garran, guardiaAbadia, juicioAnselmo, nellaYesca, oddaHulla, plazaLlegada].map((d) => [d.id, d as unknown as DialogueTree]),
);
