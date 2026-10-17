import type { DialogueTree } from '../../../engine';
import anselmo from './anselmo.json';
import audienciaAbadia from './audiencia_abadia.json';
import calladoPozo from './callado_pozo.json';
import caminoDorotea from './camino_dorotea.json';
import caminoGarran from './camino_garran.json';
import caminoMineros from './camino_mineros.json';
import caminoMinerosDespues from './camino_mineros_despues.json';
import chestLibroCuentas from './chest_libro_cuentas.json';
import cirilo from './cirilo.json';
import dorotea from './dorotea.json';
import garran from './garran.json';
import guardiaAbadia from './guardia_abadia.json';
import hildaCardo from './hilda_cardo.json';
import juicioAnselmo from './juicio_anselmo.json';
import lisandroFuss from './lisandro_fuss.json';
import nellaYesca from './nella_yesca.json';
import oddaHulla from './odda_hulla.json';
import posaderaPicoRoto from './posadera_pico_roto.json';
import pozoAhorcado from './pozo_ahorcado.json';
import sermonCirilo from './sermon_cirilo.json';
import sinpagaJefe from './sinpaga_jefe.json';
import viudasLloro from './viudas_lloro.json';

/** The act's conversations and interactables, by tree id (generated list; one import per file). */
export const STORY_DIALOGUES: Record<string, DialogueTree> = Object.fromEntries(
  [anselmo, audienciaAbadia, calladoPozo, caminoDorotea, caminoGarran, caminoMineros, caminoMinerosDespues, chestLibroCuentas, cirilo, dorotea, garran, guardiaAbadia, hildaCardo, juicioAnselmo, lisandroFuss, nellaYesca, oddaHulla, posaderaPicoRoto, pozoAhorcado, sermonCirilo, sinpagaJefe, viudasLloro].map((d) => [d.id, d as unknown as DialogueTree]),
);
