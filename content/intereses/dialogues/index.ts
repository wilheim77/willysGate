import type { DialogueTree } from '../../../engine';
import caminoDorotea from './camino_dorotea.json';
import caminoGarran from './camino_garran.json';
import caminoMineros from './camino_mineros.json';
import caminoMinerosDespues from './camino_mineros_despues.json';
import dorotea from './dorotea.json';
import garran from './garran.json';

/** The act's conversations and interactables, by tree id (generated list; one import per file). */
export const STORY_DIALOGUES: Record<string, DialogueTree> = Object.fromEntries(
  [caminoDorotea, caminoGarran, caminoMineros, caminoMinerosDespues, dorotea, garran].map((d) => [d.id, d as unknown as DialogueTree]),
);
