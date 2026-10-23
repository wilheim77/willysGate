import type { DialogueTree } from '../../../engine';
import rivalEncuentro from './rival-encuentro.json';
import { CAMERINO_DIALOGUES } from './camerino';
import { finalTemporada, xeldaDespacho } from './final';

/** The game's conversations and interactable scripts, by tree id. */
export const DIALOGUES: Record<string, DialogueTree> = Object.fromEntries([...[rivalEncuentro].map((d) => d as unknown as DialogueTree), finalTemporada, xeldaDespacho, ...CAMERINO_DIALOGUES].map((d) => [d.id, d]));
