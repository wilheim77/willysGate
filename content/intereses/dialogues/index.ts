import type { DialogueTree } from '../../../engine';
import anselmo from './anselmo.json';
import audienciaAbadia from './audiencia_abadia.json';
import caminoDorotea from './camino_dorotea.json';
import caminoGarran from './camino_garran.json';
import caminoMineros from './camino_mineros.json';
import caminoMinerosDespues from './camino_mineros_despues.json';
import cirilo from './cirilo.json';
import cofreLisandro from './cofre_lisandro.json';
import dorotea from './dorotea.json';
import garran from './garran.json';
import guardiaAbadia from './guardia_abadia.json';
import hildaCardo from './hilda_cardo.json';
import juicioAnselmo from './juicio_anselmo.json';
import lisandroFuss from './lisandro_fuss.json';
import nellaYesca from './nella_yesca.json';
import oddaHulla from './odda_hulla.json';
import plazaLlegada from './plaza_llegada.json';
import posaderaPicoRoto from './posadera_pico_roto.json';
import sermonCirilo from './sermon_cirilo.json';
import viudasLloro from './viudas_lloro.json';

/** The act's conversations and interactables, by tree id (generated list; one import per file). */
export const STORY_DIALOGUES: Record<string, DialogueTree> = Object.fromEntries(
  [anselmo, audienciaAbadia, caminoDorotea, caminoGarran, caminoMineros, caminoMinerosDespues, cirilo, cofreLisandro, dorotea, garran, guardiaAbadia, hildaCardo, juicioAnselmo, lisandroFuss, nellaYesca, oddaHulla, plazaLlegada, posaderaPicoRoto, sermonCirilo, viudasLloro].map((d) => [d.id, d as unknown as DialogueTree]),
);
