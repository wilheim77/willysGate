// Scene 1: the plaza of Hondonegra. The Torre del Cepo with its gallows platform (Anselmo's
// trial, Cirilo and his fanatics), the Cuadrilla by the Pico Roto, the baron's guards at the
// foot of the road up to the abbey. Exits: west (the road), north (abbey), east (streets),
// south (the Escorial track).
import { Canvas } from '../paint.mjs';

const L = {
  '#': ['#', 3],
  '.': ['.', 0],
  '-': ['.', 1],
  ':': ['.', 2],
  3: ['.', 3],
  t: ['.', 1], // market terrace
  p: ['=', 1], // gallows steps
  '=': ['=', 2], // gallows platform
  ',': [',', 0],
};

// x: 0         1         2
//    012345678901234567890123456789
const ROWS = [
  '######################3333####', // 0  road up to the abbey
  '######################::::####', // 1
  '######################::::####', // 2
  '######################----####', // 3
  '#.......####..........----####', // 4  Torre del Cepo (x8-11, y3-5)
  '#.......####..............####', // 5
  '#......p======p...........####', // 6  gallows platform (h2), steps (h1) both ends
  '#......p======p...........####', // 7
  '#.............................', // 8  east: to the streets
  '#ttttt........................', // 9
  '#ttttt........................', // 10
  '#ttttt...................####', // 11 Pico Roto (x26-29, y11-18)
  '#ttttt...........##......####', // 12 the well (x17-18)
  '#................##......####', // 13
  '.........................####', // 14 west: from the road
  '.........................####', // 15
  '.........................####', // 16
  '#........................####', // 17
  '#........................####', // 18
  '############...###############', // 19 south: the Escorial track
  '############...###############', // 20
  '############,,,###############', // 21
];

const c = new Canvas(30, 22).stamp(0, 0, ROWS.map((r) => r.padEnd(30, '#')), L);

export default {
  id: 'plaza',
  name: 'La plaza de Hondonegra',
  ambientLight: 0.5,
  ...c.source(),
  spawns: {
    'entry-camino': [2, 15],
    'entry-abadia': [23, 2],
    'entry-calles': [27, 9],
    // The trial (scene 1).
    anselmo: [10, 6],
    cirilo: [12, 7],
    'fanatico_pala-1': [8, 9],
    'fanatico_pala-2': [13, 9],
    'fanatico_pala-3': [6, 8],
    // The Cuadrilla, by the inn.
    nella: [23, 12],
    odda: [24, 13],
    'minero_cuadrilla-1': [22, 14],
    // The abbey's guards at the foot of the road.
    'guardia_baron-1': [21, 5],
    'guardia_baron-2': [25, 5],
    // Scenery: market stalls on the terrace, lamp oil by the gallows, the well's bucket barrel.
    'crate-1': [2, 10],
    'crate-2': [3, 10],
    'barrel-1': [2, 11],
    'barrel_oil-1': [15, 8],
    'barrel-2': [19, 13],
    'crate-3': [20, 16],
  },
  lights: [
    { name: 'brasero-cadalso-1', at: [7, 8], radius: 4.5, color: '#ff9a4a', flicker: 0.18, prop: 'brazier' },
    { name: 'brasero-cadalso-2', at: [14, 9], radius: 4.5, color: '#ff9a4a', flicker: 0.18, prop: 'brazier' },
    { name: 'antorcha-pico-roto', at: [25, 12], radius: 4, color: '#ffb050', flicker: 0.12, prop: 'torch_wall' },
    { name: 'antorcha-abadia', at: [23, 3], radius: 4, color: '#ffb050', flicker: 0.12, prop: 'torch_wall' },
  ],
  surfaces: [{ name: 'abrevadero', rect: [16, 14, 3, 1], surface: 'water' }],
  exits: [
    { name: 'a-abadia', rect: [22, 0, 4, 1], to: 'abadia', spawn: 'entry-plaza' },
    { name: 'a-calles', rect: [29, 8, 1, 3], to: 'calles', spawn: 'entry-plaza' },
    { name: 'a-camino', rect: [0, 14, 1, 3], to: 'camino', spawn: 'entry-plaza' },
  ],
  zones: {
    scenes: [
      {
        name: 'juicio-anselmo',
        rect: [5, 8, 11, 4],
        props: { dialogue: 'TODO:juicio_anselmo', speaker: 'cirilo', once: true, fight: 'fanatico_pala-1,fanatico_pala-2,fanatico_pala-3,cirilo' },
      },
    ],
  },
};
