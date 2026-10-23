import { type TutorialData, configureTutorial } from '../../rulesets/willy';
import tutorial from './tutorial.json';

/**
 * The integrated tutorial (tutorial.json): the ruleset decides when each step fires and keeps
 * the locks (rulesets/willy/tutorial.ts); the client shows the `tutorialStep` event as a
 * dismissable card (GameDefinition.tutorial, src/ui/tutorialToasts.ts).
 */
export const TUTORIAL = tutorial as unknown as TutorialData;
configureTutorial(TUTORIAL);

/** One card per step, shown when the ruleset says the step fired. */
export const TUTORIAL_STEPS = TUTORIAL.pasos.map((p) => ({ id: p.id, trigger: { event: 'tutorialStep', match: { id: p.id } }, text: p.texto.join('\n\n') }));
