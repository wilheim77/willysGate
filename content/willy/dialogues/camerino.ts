import type { DialogueChoice, DialogueNode, DialogueTree, DialogueWhen } from '../../../engine';

/**
 * The Camerino's regulars (docs/willy/STORY.md §2, DESIGN.md §11): Maripuri, Paco, Xelda and
 * Koldo. Each is a menu you can come back to (topic nodes lead back to «hola»). What changes
 * from one Camerino to the next is the Camerino's number (0: before floor 1; N: after floor N),
 * read through the `camerinoEn` rule (rulesets/willy/camerino.ts); the planta below is the
 * biome of floor N + 1 (1-2 Castro, 3-4 Hiper, 5-6 Verbena, 7-8 Balneario, 9-10 Plató).
 *
 * Who owns what: the shop's rules and panel are the ruleset/client's (choices tagged
 * `tienda:comprar` / `tienda:vender` tell it Willy wants to trade); Paco's café and Xelda's
 * «firmar el parte» are the `rest` effect (Ruleset.onRest); Koldo's errands are hidden
 * achievements (achievements.json, category «encargos») switched on by the flag `koldo:mision`.
 */

/** Parked for the first release (the shop's rules and panel, and Koldo's errands): hidden until these flags are set. */
const SHOP_OPEN: DialogueWhen = { flag: 'tienda:abierta', is: true };
const ERRANDS_OPEN: DialogueWhen = { flag: 'koldo:encargos', is: true };

const at = (min: number, max = min): DialogueWhen => ({ rule: 'camerinoEn', params: { min, max } });
/** The biome of the planta below this Camerino, as the Camerino numbers that lead to it. */
const BIOME: [string, number, number][] = [
  ['castro', 0, 1],
  ['hiper', 2, 3],
  ['verbena', 4, 5],
  ['balneario', 6, 7],
  ['plato', 8, 9],
];
const branch = (prefix: string, ranges: [number, number][]): { when: DialogueWhen; next: string }[] => ranges.map(([a, b], i) => ({ when: at(a, b), next: `${prefix}${i}` }));
const byBiome = (prefix: string) => branch(prefix, BIOME.map(([, a, b]) => [a, b] as [number, number]));
const say = (speaker: string, text: string, next?: string, extra: Partial<DialogueNode> = {}): DialogueNode => ({ speaker, text, ...(next ? { next } : {}), ...extra });
const bye = (text = 'Hasta luego.'): DialogueChoice => ({ id: 'adios', text });

// --- Maripuri: Ultramarinos ----------------------------------------------------------------------

export const maripuri: DialogueTree = {
  id: 'maripuri',
  start: 'hola',
  nodes: {
    hola: {
      speaker: 'maripuri',
      text: 'Hijo, pasa, pasa, que se me escapa el calor. Hoy el mostrador está cerrado por inventario, pero para charlar siempre hay tiempo.',
      choices: [
        { id: 'comprar', text: 'Quiero comprar.', when: SHOP_OPEN, tags: ['tienda:comprar'] },
        { id: 'vender', text: 'Quiero vender.', when: SHOP_OPEN, tags: ['tienda:vender'] },
        { id: 'chisme', text: '¿Qué sabes de la planta de abajo?', next: 'chisme' },
        { id: 'negocio', text: '¿Cómo va el negocio?', next: 'negocioRuta' },
        { id: 'koldo', text: '¿Y Koldo?', next: 'koldo' },
        bye('Nada, gracias.'),
      ],
    },
    chisme: { speaker: 'maripuri', text: 'Maripuri se asoma por encima del mostrador y baja la voz.', next: byBiome('chisme') },
    chisme0: say('maripuri', 'Pues que te vas a mojar los pies, hijo. Es Castro, pero con goteras. Y las gaviotas son las mismas de siempre: no les des el bocadillo, que luego no se van.', 'hola'),
    chisme1: say('maripuri', 'Dicen que abajo hay un hiper abierto las veinticuatro horas. Cuidado con los carritos: tienen mala leche y peor dirección. Y no te fíes de las ofertas, que el «dos por uno» te sale por un brazo.', 'hola'),
    chisme2: say('maripuri', 'Fiestas, hijo. Llévate una chaqueta, que refresca. Y no aceptes churros de nadie: vienen con pólvora.', 'hola'),
    chisme3: say('maripuri', 'Termas y saunas. Te pondrás como un pimiento. O como un cubito, según la sala. Llévate una toalla y las ganas de vivir, que se pierden fácil con tanto vapor.', 'hola'),
    chisme4: say('maripuri', 'Arriba del todo, los bastidores del programa. Lo que se ve en la tele no es lo que hay: todo es cartón. Menos el que presenta. Ese es otra cosa. Y no te lo digo yo, te lo dicen los carteles.', 'hola'),
    negocioRuta: {
      speaker: 'maripuri',
      text: 'Maripuri se endereza el delantal.',
      next: [{ when: { rule: 'clase', params: { is: 'tasador' } }, next: 'negocioTasador' }, { next: 'negocio' }],
    },
    negocio: say('maripuri', 'Esto es un negocio serio. Compro barato, vendo caro y de lo que sobra me quedo yo. Tengo licencia del concurso, ¿eh? La saqué en dos horas. No preguntes.', 'hola'),
    negocioTasador: say('maripuri', 'Tú entiendes de esto, hijo, ya veo cómo miras las cosas: como yo, con la lupa y mal pensando. Pues a ti te hago precio de colega. Al resto, el de siempre.', 'hola'),
    koldo: say('maripuri', 'Ese chico baja cada vez peor. La última vez traía un cangrejo en la chaqueta. Vivo. Dice que en Bilbao los cangrejos son más grandes. Yo le he dicho que me lo deje en el mostrador y no ha vuelto a por él.', 'hola'),
  },
};

// --- Paco: el bar --------------------------------------------------------------------------------

export const paco: DialogueTree = {
  id: 'paco',
  start: 'hola',
  nodes: {
    hola: {
      speaker: 'paco',
      text: 'Mm. ¿Qué va a ser?',
      choices: [
        { id: 'cafe', text: 'Un café, Paco.', when: { rule: 'barLibre' }, effects: [{ type: 'rest', kind: 'bar' }], next: 'cafe' },
        { id: 'cafe-repetido', text: 'Otro café, Paco.', when: { not: { rule: 'barLibre' } }, next: 'yaCafe' },
        { id: 'jugada', text: '¿Qué tal la jugada?', next: 'jugadaRuta' },
        { id: 'cafetera', text: '¿Y la cafetera?', next: 'cafetera' },
        bye('Hasta luego, Paco.'),
      ],
    },
    cafe: say('paco', 'Marchando. Con leche, sin azúcar y un pincho de tortilla que no has pedido. Vida y energía a tope. El café sigue siendo malo.', 'hola'),
    yaCafe: say('paco', 'Ya te he puesto uno. Otro más y te sale el bigote por las orejas. Vuelve cuando bajes y subas. La cafetera también necesita un respiro. Yo no.', 'hola'),
    jugadaRuta: {
      speaker: 'paco',
      text: 'Paco seca un vaso. Lo mira al trasluz. Lo vuelve a secar.',
      next: [
        { when: at(0), next: 'jugada0' },
        { when: at(1, 2), next: 'jugada1' },
        { when: at(3, 5), next: 'jugada2' },
        { when: at(6, 8), next: 'jugada3' },
        { next: 'jugada4' },
      ],
    },
    jugada0: say('paco', 'Aún no has bajado. No hay jugada. Cuando la haya, te la comento. Bien o mal. Ya te la he comentado.', 'hola'),
    jugada1: say('paco', 'Lo he visto por la tele de la barra. Se te veía con miedo. Es lo normal. Los que no tienen miedo no vuelven por aquí.', 'hola'),
    jugada2: say('paco', 'Hoy me han pedido tres cafés «al estilo Willy». No sé qué es. Les he puesto el de siempre. Han pagado.', 'hola'),
    jugada3: say('paco', 'Cuanto más abajo, menos gente en la barra. Los que se quedan arriba son los listos. Tú, tonto como tú solo, sigues bajando.', 'hola'),
    jugada4: say('paco', 'La última planta. Después de esto o te dan un trabajo de verdad o me quedo sin cliente. Cualquiera de las dos me da pena.', 'hola'),
    cafetera: say('paco', 'La cafetera sobrevivió al fin del mundo. Yo también. Ella se queja menos.', 'hola'),
  },
};

// --- Xelda: Producción -----------------------------------------------------------------------------

/** Her desk menu (the contract and the winners' portraits are the despacho scene on the last floor: final.ts). */
function xeldaNodes(): Record<string, DialogueNode> {
  const nodes: Record<string, DialogueNode> = {
    hola: {
      speaker: 'xelda',
      text: 'Producción, dígame. Tengo cuatro manos libres y ninguna disponible. ¿Qué necesitas?',
      choices: [
        { id: 'parte', text: 'Firmar el parte de planta (guardar).', effects: [{ type: 'rest', kind: 'parte' }], next: 'parte' },
        { id: 'reglamento', text: 'Explícame el reglamento.', next: 'reglamento' },
        { id: 'cajas', text: '¿Qué probabilidades tienen las cajas?', next: 'cajas' },
        { id: 'estado', text: '¿Cómo estás, Xelda?', next: 'estadoRuta' },
        bye('Gracias, Xelda.'),
      ],
    },
    parte: say('xelda', 'Parte firmado, sellado y archivado por cuadruplicado. Si te eliminan, vuelves a este punto. Es lo más parecido a un abrazo que me permite el reglamento.', 'hola'),
    reglamento: {
      speaker: 'xelda',
      text: 'Hay cuatro cosas que nadie se lee. ¿Cuál quieres?',
      choices: [
        { id: 'reloj', text: 'El reloj.', next: 'reloj' },
        { id: 'audiencia', text: 'La audiencia y los patrocinadores.', next: 'audiencia' },
        { id: 'eliminacion', text: 'Si me eliminan.', next: 'eliminacion' },
        { id: 'atras', text: 'Ya está.', next: 'hola' },
      ],
    },
    reloj: say('xelda', 'Corre solo cuando haces cosas: un segundo por casilla y quince por ronda de combate. Pensar, mirar menús y abrir cajas es gratis, y contra el jefe se para. A cero, la planta se hunde sala a sala, empezando por las más lejanas a la salida. El derrumbe no te elimina por sí solo. Qué detalle, ¿verdad?', 'reglamento'),
    audiencia: say('xelda', 'Lo espectacular sube la audiencia y lo aburrido la baja. Nunca te quita vida. Da cajas al llegar a ciertas cifras y una prima al terminar cada bioma. Los patrocinadores miran cuando hay público suficiente: cada uno tiene sus gustos, están en su retrato. Y todos pueden retirarse. Todos.', 'reglamento'),
    eliminacion: say('xelda', 'Con repetición, vuelves al último Camerino donde firmaste y la planta se recoloca. Sin repetición, se acaba tu temporada. Lo elegiste tú al empezar. Yo solo lo anoto.', 'reglamento'),
    cajas: say('xelda', 'Bronce, 2 objetos; plata, 3 con al menos uno de plata; oro, 3 con uno de oro; legendaria, 4 con uno legendario. Ocho cajas seguidas sin oro y la siguiente trae uno seguro; veinte sin legendario, igual. En la pantalla de cada caja tienes «Ver probabilidades»: sin letra pequeña. La letra pequeña está en el contrato. Es otro tema.', 'hola'),
    estadoRuta: {
      speaker: 'xelda',
      text: 'Xelda deja el bolígrafo en una mano, el pinganillo en otra y se frota los ojos con la tercera.',
      next: [
        { when: at(0, 2), next: 'estado0' },
        { when: at(3, 6), next: 'estado1' },
        { next: 'estado2' },
      ],
    },
    estado0: say('xelda', 'Cansada. Es mi estado natural. Gracias por preguntar: eres la única persona de la mazmorra que lo hace. Los demás preguntan por el reglamento.', 'hola'),
    estado1: say('xelda', 'Hay cosas en los despachos de Producción que no me cuadran, Willy. Listas de ganadores. Fechas. Prefiero no decir más hasta tenerlo claro. Pero si algún día te pido que me escuches, escúchame.', 'hola'),
    estado2: say('xelda', 'Cuanto más cerca estás del final, más papeles me llegan y menos me gustan. Tú sigue. Y cuando acabes, no firmes nada sin leerlo. Ni aunque sea de él. Sobre todo si es de él.', 'hola'),
  };
  return nodes;
}

export const xelda: DialogueTree = { id: 'xelda', start: 'hola', nodes: xeldaNodes() };

// --- Koldo: historias y encargos ---------------------------------------------------------------------

/** How he arrives and what happened, Camerino by Camerino: each one worse than the last. */
const HISTORIAS = [
  'Me han tirado por una trampilla, chaval. A mí. En Bilbao las trampillas son más grandes, eso sí: caí con estilo.',
  'Me ha perseguido una gaviota tres calles. Tres. En Bilbao las gaviotas llevan casco, y esta no, y se nota.',
  'Un carrito de la compra me ha atropellado. Dos veces. Lo de que me haya atropellado es lo de menos; lo malo es que me ha pedido el tique.',
  'Me he quedado encerrado en una cámara frigorífica. Sin abrigo. En Bilbao los congelados son más grandes, pero no me ha servido de nada.',
  'Venía por la verbena y me han dado un churro. No era un churro. Era un cohete. Me ha salido el bigote por la espalda.',
  'He ganado una rifa en la tómbola. Premio: un pollo. Vivo. Ahora somos dos. Se llama Txomin y no me habla.',
  'Un yeti de sauna me ha pedido que le ayude con las toallas. Tres horas. Dice que en el Himalaya no hay tanto trabajo.',
  'Me he metido en la piscina sin mirar y estaba helada. En Bilbao las piscinas heladas son más grandes. Me he quedado en el borde, como una gamba.',
  'He trabajado de figurante. Me han pagado en vales. Un vale para una tarde de nada. Lo estoy usando ahora mismo, hablando contigo.',
  'He llegado hasta aquí con un casco de obra, medio zapato y una ficha de otro concursante. Me he enamorado de una cámara-dron. No me ha hecho ni caso. En Bilbao, las cámaras sí.',
];

/** The errands: offered in Camerino 0..8 (floors 1..9). Their rewards live in achievements.json («encargos»). */
const ENCARGOS = [
  'Escucha: abajo hay un canal. Si a dos bichos los mandas por un escalón o al vacío, cuenta. Dos. Y te cae una caja de bronce. La invita la cadena, pero la idea es mía.',
  'Gana un combate sin que te toquen, contra dos o más. Una caja de plata. En Bilbao lo hace todo el mundo desayunando.',
  'Elimina a dos enemigos con carritos. Dos. La caja de plata la pone la cadena; el rencor lo pongo yo.',
  'Prende a dos enemigos de golpe. Con fuego, con lo que sea. Una caja de plata. Yo contribuyo con la idea y la envidia.',
  'Elimina a tres con fuego. Tres. Ya sé que es mucho, pero es verbena: está permitido. Caja de plata.',
  'Haz el ganso tres veces. Delante de todos. Que el público se ría. Aunque sea de ti. Caja de bronce. El ridículo es lo único que no se paga.',
  'Provoca dos reacciones de superficie: agua con rayo, hielo, vapor, lo que haya. Es un balneario, hay de todo. Caja de plata.',
  'Elimina a tres en un mismo turno. Tres de golpe. Yo no he visto a nadie hacerlo, pero tú tienes cara de poder. Caja de plata.',
  'Golpea a dos desde lo alto, desde dos niveles por encima. Con un plató tan montado como este sobran sitios. Caja de plata. Y no mires abajo.',
];

const koldoNodes: Record<string, DialogueNode> = {
  hola: {
    speaker: 'koldo',
    text: '¡Willy! ¡Chaval! ¿Tú sabes lo que me ha pasado?',
    choices: [
      { id: 'historia', text: 'Cuéntame.', next: 'historiaRuta' },
      { id: 'encargo', text: '¿Hay algo que hacer abajo?', when: ERRANDS_OPEN, next: 'encargoRuta' },
      bye('Luego te veo, Koldo.'),
    ],
  },
  historiaRuta: { speaker: 'koldo', text: 'Koldo se sienta en la barra, se arremanga y respira hondo.', next: HISTORIAS.map((_, i) => ({ when: at(i), next: `historia${i}` })) },
  encargoRuta: {
    speaker: 'koldo',
    text: 'Koldo baja la voz, como si alguien más pudiera oírle.',
    next: [
      ...ENCARGOS.map((_, i) => ({ when: { all: [at(i), { flag: 'koldo:mision', is: `m${i + 1}` }] } as DialogueWhen, next: 'yaTrato' })),
      ...ENCARGOS.map((_, i) => ({ when: at(i), next: `encargo${i}` })),
      { next: 'sinEncargo' },
    ],
  },
  yaTrato: say('koldo', 'Ya te lo he dicho, chaval. Tienes el encargo, la caja y mi bendición. Lo único que te falta es hacerlo.', 'hola'),
  sinEncargo: say('koldo', 'Nada, chaval. A partir de aquí no me atrevo ni a proponerte nada. Esto va en serio. Yo te espero en la barra, con Paco. Si vuelves, te cuento lo que me ha pasado.', 'hola'),
  trato: say('koldo', 'Eso es. ¡Así se habla! En Bilbao ya estaríamos celebrándolo. Yo te espero aquí. Ven a contármelo, que me encanta.', 'hola'),
};
HISTORIAS.forEach((t, i) => {
  koldoNodes[`historia${i}`] = say('koldo', t, 'hola');
});
ENCARGOS.forEach((t, i) => {
  koldoNodes[`encargo${i}`] = {
    speaker: 'koldo',
    text: t,
    choices: [
      { id: 'acepto', text: 'Trato hecho.', tags: ['amable'], effects: [{ type: 'setFlag', flag: 'koldo:mision', value: `m${i + 1}` }], next: 'trato' },
      { id: 'paso', text: 'Hoy no, Koldo.', next: 'hola' },
    ],
  };
});

export const koldo: DialogueTree = { id: 'koldo', start: 'hola', nodes: koldoNodes };

export const CAMERINO_DIALOGUES: DialogueTree[] = [maripuri, paco, xelda, koldo];
