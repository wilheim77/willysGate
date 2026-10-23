import type { DialogueTree } from '../../../engine';
import rivalEncuentro from './rival-encuentro.json';
import { CAMERINO_DIALOGUES } from './camerino';
import { finalTemporada, xeldaDespacho } from './final';

/** A chest on a floor: tapping it opens this; rulesets/willy/chests.ts puts what's inside in the bag. */
const cofre: DialogueTree = { id: 'cofre', start: 'abrir', nodes: { abrir: { text: 'Levantas la tapa de la caja de botín. Huele a almacén y a sorpresa.' } } };

/** The game's conversations and interactable scripts, by tree id. */
export const DIALOGUES: Record<string, DialogueTree> = Object.fromEntries([...[rivalEncuentro].map((d) => d as unknown as DialogueTree), finalTemporada, xeldaDespacho, cofre, ...CAMERINO_DIALOGUES].map((d) => [d.id, d]));
