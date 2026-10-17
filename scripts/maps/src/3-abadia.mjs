// Scene 2: the old abbey, now the baron's fortified home. North: the chapter hall (audience,
// dais with the baron and Hilda, the crossbow behind the tapestry). West: kitchen with lamp oil.
// East: the crypt (closed door; the baron's key leads down to the mine, D1 "defend").
// South: cloister, a wall-walk (h2) over the gate for the night of the torches (D1).
import { Canvas } from '../paint.mjs';

const L = {
  '#': ['#', 3],
  '.': ['.', 0],
  '-': ['.', 1],
  '=': ['=', 0], // hall floor
  d: ['=', 1], // dais
  w: ['=', 2], // wall-walk
  ',': [',', 0],
  '/': ['/', 0],
  '+': ['+', 3],
};

// x: 0         1         2
//    0123456789012345678901234567
const ROWS = [
  '############################', // 0
  '#.....#=====dddddd=====#...#', // 1  dais (x12-17)
  '#.....#=====dddddd=====#...#', // 2
  '#.....#================#...#', // 3
  '#.....#================#...#', // 4
  '#.....#================#...#', // 5
  '#.....#================#...#', // 6
  '#.....#================#...#', // 7
  '###/##########//#########+##', // 8  doors: kitchen, hall, crypt (closed)
  '#..........................#', // 9  cloister
  '#..........................#', // 10
  '#....,,,,,,,,,,,,,,,,,,....#', // 11 garden
  '#....,,,,,,,,,,,,,,,,,,....#', // 12
  '#....,,,,,,,,,,,,,,,,,,....#', // 13
  '#..........................#', // 14
  '#-wwwwwwwwwww..wwwwwwwwwww-#', // 15 wall-walk (h2), stairs (h1) at both ends; gate passage h0
  '#############//#############', // 16 the gate
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 17 outside: the road down to the plaza
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 18
  '#,,,,,,,,,,,,,,,,,,,,,,,,,,#', // 19
  '##,,,,,,,,,,,,,,,,,,,,,,,,##', // 20
  '###########,,,,,,###########', // 21
];

const c = new Canvas(28, 22).stamp(0, 0, ROWS, L);
// Exterior art: the cloister garden, the outer walls and gate in rough stone, the road outside.
c.retile((t, h, x, y) => (t === '#' && (y >= 15 || x === 0 || x === 27) ? 'W' : t === ',' ? (y >= 17 ? 'R' : 's') : t));

export default {
  id: 'abadia',
  name: 'La abadía vieja',
  ambientLight: 0.35,
  ...c.source(),
  spawns: {
    'entry-plaza': [13, 19],
    // The audience (scene 2).
    mazo: [14, 1],
    hilda: [16, 2],
    'guardia_baron-1': [8, 4],
    'guardia_baron-2': [21, 4],
    'guardia_baron-3': [5, 15], // wall-walk
    'guardia_baron-4': [22, 15],
    'guardia_baron_sargento-1': [15, 18],
    'tapestry_crossbow-1': [22, 1], // the sixth crossbow behind the tapestry (scene 2, Garrán's line)
    'tapestry-1': [8, 1],
    // Crypt (D1, defend: the baron's key).
    'door-cripta': [25, 8],
    'entry-cripta': [25, 3],
    // Scenery: kitchen oil, cloister cover, a barricade at the gate for the night of the torches.
    'barrel_oil-1': [1, 1],
    'barrel_oil-2': [1, 2],
    'crate-1': [5, 7],
    'crate-2': [9, 12],
    'barrel-1': [18, 12],
    'crate-3': [11, 18],
    'crate-4': [17, 18],
    // D1, the night of the torches: the Cuadrilla at the gate (only that night). With the party
    // (d1_cuadrilla) they storm it; against it (d1_abadia) they are the enemy, Odda leading.
    // The Hulla stay out of the assault if hulla_no_luchan.
    'minero_cuadrilla-1': { at: [8, 19], requiresAnyFlag: 'd1_cuadrilla,d1_abadia' },
    'minero_cuadrilla-2': { at: [19, 19], requiresAnyFlag: 'd1_cuadrilla,d1_abadia' },
    'minero_cuadrilla-3': { at: [14, 20], requiresAnyFlag: 'd1_cuadrilla,d1_abadia' },
    'hulla-1': { at: [10, 20], requiresAnyFlag: 'd1_cuadrilla,d1_abadia', unlessFlag: 'hulla_no_luchan' },
    'hulla-2': { at: [17, 20], requiresAnyFlag: 'd1_cuadrilla,d1_abadia', unlessFlag: 'hulla_no_luchan' },
    odda_noche: { at: [13, 20], requiresFlag: 'd1_abadia' },
  },
  lights: [
    { name: 'brasero-sala-1', at: [10, 6], radius: 5, color: '#ffb060', flicker: 0.12, prop: 'brazier' },
    { name: 'brasero-sala-2', at: [19, 6], radius: 5, color: '#ffb060', flicker: 0.12, prop: 'brazier' },
    { name: 'antorcha-claustro-1', at: [7, 9], radius: 4, color: '#ffb050', flicker: 0.12, prop: 'torch_wall' },
    { name: 'antorcha-claustro-2', at: [20, 9], radius: 4, color: '#ffb050', flicker: 0.12, prop: 'torch_wall' },
    { name: 'antorcha-puerta-1', at: [12, 17], radius: 4, color: '#ffb050', flicker: 0.15, prop: 'torch_wall' },
    { name: 'antorcha-puerta-2', at: [15, 17], radius: 4, color: '#ffb050', flicker: 0.15, prop: 'torch_wall' },
    { name: 'vela-cripta', at: [25, 4], radius: 2.5, color: '#ffd090', flicker: 0.2, intensity: 0.7 },
  ],
  exits: [
    { name: 'a-plaza', rect: [11, 21, 6, 1], to: 'plaza', spawn: 'entry-abadia' },
    // The crypt stairs down to the mine: open once door_cripta has been opened (cripta_abierta).
    { name: 'escalera-cripta', rect: [26, 1, 1, 1], to: 'mina', spawn: 'entry-cripta', props: { requiresFlag: 'cripta_abierta' } },
  ],
  encounters: [
    {
      name: 'd1-asalto',
      rect: [0, 9, 28, 13],
      participants: ['guardia_baron-1', 'guardia_baron-2', 'guardia_baron-3', 'guardia_baron-4', 'guardia_baron_sargento-1', 'minero_cuadrilla-1', 'minero_cuadrilla-2', 'minero_cuadrilla-3', 'hulla-1', 'hulla-2'],
      props: { requiresFlag: 'd1_cuadrilla', setFlag: 'd1_asalto_terminado' },
    },
    {
      name: 'd1-defensa',
      rect: [0, 9, 28, 13],
      participants: ['odda_noche', 'minero_cuadrilla-1', 'minero_cuadrilla-2', 'minero_cuadrilla-3', 'hulla-1', 'hulla-2'],
      props: { requiresFlag: 'd1_abadia', setFlag: 'd1_asalto_terminado' },
    },
  ],
  zones: {
    scenes: [
      { name: 'audiencia', rect: [12, 4, 4, 3], props: { dialogue: 'audiencia_abadia', speaker: 'mazo', once: true } }],
  },
};
