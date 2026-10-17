// Prologue: «El camino». Dusk on the last stretch of road into the valley.
// West: start with Dorotea. Ditch south of the road: Garrán. East: the hungry miners
// block the road by an overturned cart (oil barrel) under a rocky outcrop (height, a fall).
import { Canvas } from '../paint.mjs';

const L = {
  0: [',', 0],
  1: [',', 1],
  2: [',', 2],
  3: [',', 3],
  '-': ['.', 1], // the road
  q: [';', 1],
  r: [';', 2],
  R: [';', 3],
};

// x: 0         1         2         3
//    01234567890123456789012345678901
const ROWS = [
  '33333333333333333333333333333333', // 0
  '33333322222233333333332222222333', // 1
  '33322221111122222322222111111223', // 2
  '3221111111111111111rRRRr11111112', // 3
  '3211111111111111111rRRRr11111112', // 4
  '321111111111111111qrRRRr11111112', // 5
  '321111111111111111qrRRRr11111112', // 6
  '32111111111111111111111111111112', // 7
  '2111111111111-------------------', // 8
  '--------------------------------', // 9
  '-------------1111111111111111111', // 10
  '11111000000001111111111111111111', // 11
  '11111000000001111111111111111111', // 12
  '21111111111111111111111111111111', // 13
  '22111111111111111111111111111122', // 14
  '32222222222222222222222222222223', // 15
  '33333333333333333333333333333333', // 16
  '33333333333333333333333333333333', // 17
];

const c = new Canvas(32, 18).stamp(0, 0, ROWS, L);
// Exterior art: the road, scrub, mud in the ditch, rock for the heights and the outcrop.
c.retile((t, h) => (t === '.' ? 'R' : t === ';' ? 'k' : t === ',' ? (h === 0 ? 'm' : h >= 2 ? 'k' : 's') : t));
// Fences along the road's north edge (same height as the road: decoration, not a barrier).
c.rect(1, 7, 6, 1, 'f', 1).rect(9, 7, 5, 1, 'f', 1).rect(25, 7, 6, 1, 'f', 1);

export default {
  id: 'camino',
  name: 'El camino',
  ambientLight: 0.6,
  properties: { start: true },
  ...c.source(),
  spawns: {
    hero: [3, 9],
    'entry-plaza': [29, 9], // back from the plaza
    dorotea: [2, 10],
    garran: [9, 12],
    // The hungry miners (prologue tutorial; avoidable by talking). Ids from cast.json.
    minero_cabecilla: [20, 9],
    minero_hambriento_1: [22, 10],
    minero_hambriento_2: [21, 4], // lookout on the outcrop (height advantage, can be pushed off)
    minero_hambriento_3: [27, 11], // the big one, by the cart and its oil
    'crate-1': [23, 11], // the overturned cart
    'crate-2': [24, 11],
    'barrel_oil-1': [25, 11],
    'crate-3': [7, 7],
    'campfire-1': [25, 13], // a milestone-sized crate: first cover the player sees
  },
  lights: [{ name: 'hoguera-mineros', at: [25, 13], radius: 5, color: '#ff9a4a', flicker: 0.18 }],
  surfaces: [
    { name: 'charco-camino', rect: [14, 8, 2, 2], surface: 'water' },
    { name: 'aceite-carro', rect: [25, 12, 2, 1], surface: 'oil' },
  ],
  traps: [
    {
      name: 'cepo-furtivo',
      rect: [15, 4, 1, 1],
      props: { marker: 'trap_beartrap', detect: 10, save: 'dex', dc: 11, damage: '1d6', type: 'piercing', condition: 'restrained', disarmCheck: 'sleight_of_hand', disarmDc: 10 },
    },
  ],
  exits: [{ name: 'a-hondonegra', rect: [31, 8, 1, 2], to: 'plaza', spawn: 'entry-camino', props: { requiresFlag: 'prologo_mineros_resuelto' } }],
  zones: {
    // Proposed layer (docs/ENGINE_REQUESTS_INTERESES.md, I1): entering opens the dialogue once.
    scenes: [
      // Both bands run wall to wall (gate: true): nobody walks past Garrán or the miners.
      { name: 'garran-en-la-cuneta', rect: [6, 0, 1, 18], props: { dialogue: 'camino_garran', speaker: 'garran', once: true, gate: true, protects: 'a-hondonegra' } },
      { name: 'mineros-cortan-el-paso', rect: [16, 0, 2, 18], props: { dialogue: 'camino_mineros', speaker: 'minero_cabecilla', once: true, gate: true, protects: 'a-hondonegra', fight: 'minero_cabecilla,minero_hambriento_1,minero_hambriento_2,minero_hambriento_3' } },
    ],
  },
};
