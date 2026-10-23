import type { DialogueNode, DialogueTree } from '../../../engine';

/**
 * The end of the season (docs/willy/STORY.md §4), opened by the game's trigger once the final
 * boss is down (rulesets/willy/ending.ts sets the flags). Xelda's reveal, his offer, the choice
 * (C only when the secret ending's conditions held), an epilogue per ending and the «Temporada 2»
 * hook. The last node sets `willy:final`, which ends the run (runEnded, then the summary).
 * Speakers 'xelda' and 'presentador' come from the game's cast.
 */

const FINAL = 'willy:final';

const epilogues: Record<'A' | 'B' | 'C', DialogueNode[]> = {
  A: [
    { text: 'Willy se sienta en la cabina. El traje de lentejuelas le queda bien. Demasiado bien.' },
    { speaker: 'presentador', text: 'Un traguito de share, compañero. Para que no se te arrugue la cara. Ni se nota.' },
    { text: 'El Narrador está encantadísimo: por fin tiene con quién comentar los combates. Willy luce un bigote que ya no se le caerá nunca.' },
  ],
  B: [
    { speaker: 'presentador', text: 'Ya volverás. Todos vuelven.' },
    { text: 'Willy baja en el ascensor de servicio. En el Camerino, Paco ya ha puesto dos cañas, Maripuri le guarda un pincho de tortilla y Koldo le cuenta cómo lo ha visto él desde la barra.' },
    { text: 'El Narrador dice que no se está emocionando. Es la alergia. Lleva cuarenta temporadas con alergia.' },
  ],
  C: [
    { speaker: 'xelda', text: 'Cláusula catorce: «El concursante podrá adquirir la cadena con los premios acumulados, si el público y los patrocinadores lo respaldan». La firmó él. Hace once mil años. Sin leerla.' },
    { text: 'Willy compra Canal Abismo con lo ganado y cancela el programa. Sin audiencia, el Presentador envejece un día por primera vez en once mil años. Le sale una cana. La mira con curiosidad.' },
    { speaker: 'presentador', text: 'Vaya. Pues me voy a jubilar. Dicen que en Kepler hay unas playas estupendas.' },
    { text: 'En catorce galaxias nadie había leído la letra pequeña. Uno de Castro, sí.' },
  ],
};

const hook: DialogueNode[] = [
  { text: 'Créditos. Muchos créditos. Catering, Seguros La Prudente, el señor de las trampillas, la señora que barre el confeti.' },
  { text: 'Mucho después, en un planeta muy lejano, se enciende una tele. Y ahí está él, con la misma cara de siempre.' },
  { speaker: 'presentador', text: 'Buenas tardes.' },
  { text: 'TEMPORADA 2. Próximamente.' },
];

function chain(prefix: string, nodes: DialogueNode[], last: string | undefined): Record<string, DialogueNode> {
  return Object.fromEntries(nodes.map((n, i) => [`${prefix}${i}`, { ...n, ...(i < nodes.length - 1 ? { next: `${prefix}${i + 1}` } : last ? { next: last } : {}) }]));
}

const nodes: Record<string, DialogueNode> = {
  inicio: { text: 'Se apagan los focos. Por primera vez en once mil años, el plató está en silencio. Se oye un ventilador. A lo lejos, Paco friega un vaso.', next: 'xelda1' },
  xelda1: { speaker: 'xelda', text: 'Willy, tengo que contarte una cosa. He estado en el despacho de producción. Los ganadores de las otras temporadas no se fueron a casa con un cheque.', next: 'xelda2' },
  xelda2: { speaker: 'xelda', text: 'Se quedaron. De copresentadores, en otros planetas, en otros canales. Y él les ha sobrevivido a todos. La audiencia siempre acaba volviendo a él.', next: 'oferta' },
  oferta: { speaker: 'presentador', text: 'Bravo. Bravísimo. Hacía siglos que nadie me hacía sudar. Te ofrezco el puesto, Willy: copresentador. Cabina, lentejuelas y la eternidad. ¿Qué me dices?', next: 'eleccion' },
  eleccion: {
    speaker: 'xelda',
    text: 'Tú decides. Yo te sujeto el micro.',
    choices: [
      { id: 'final-a', text: 'Aceptar el puesto.', next: 'A0' },
      { id: 'final-b', text: 'Decir que no y volver con los tuyos al Camerino.', next: 'B0', tags: ['amable'] },
      { id: 'final-c', text: 'Sacar el contrato y leer la letra pequeña.', when: { flag: 'willy:finalSecreto', is: true }, next: 'C0' },
    ],
  },
};

for (const k of ['A', 'B', 'C'] as const) {
  Object.assign(nodes, chain(k, epilogues[k], `${k}h0`));
  const h = chain(`${k}h`, hook, undefined);
  const lastId = `${k}h${hook.length - 1}`;
  h[lastId] = { ...h[lastId]!, effects: [{ type: 'setFlag', flag: FINAL, value: k }] };
  Object.assign(nodes, h);
}

export const finalTemporada: DialogueTree = { id: 'final-temporada', start: 'inicio', nodes };
