// Under the Pozo del Ahorcado: el Túnel de los Callados, Brea's smuggling gallery between the
// well and the mine. The party lands on a ledge at the foot of the rope and goes down a ramp.
// Callados haul silver along the rails, with rats in the spoil.
// Two dead miners' skeletons keep a side ledge (h2) with bows, over a 2-level drop. There is
// lamp oil by the timbering, and a seep of water.
import { Canvas } from '../paint.mjs';

const c = new Canvas(32, 14, 'C', 4);
c.rect(1, 4, 4, 5, '.', 2); // the landing at the foot of the rope
c.put(2, 3, '.', 2); // the rope
c.put(5, 6, '.', 1); // the ramp down
c.rect(6, 4, 26, 6, '.', 0); // the gallery
c.rect(6, 7, 26, 1, '-', 0); // rails
c.rect(11, 1, 9, 2, '.', 2); // the side ledge...
c.put(11, 3, '.', 1); // ...up a step from the gallery
c.rect(12, 3, 8, 1, '.', 0); // under the ledge: a 2-level drop

export default {
  id: 'tunel',
  name: 'Túnel de los Callados',
  ambientLight: 0.12,
  ...c.source(),
  spawns: {
    'entry-pozo': [2, 5],
    'entry-mina': [30, 6],
    'callado-14': [22, 6], // in front
    'callado-12': [21, 8],
    'callado-13': [19, 4],
    'rata_gigante-2': [15, 6],
    'rata_gigante-3': [16, 8],
    'esqueleto_minero-1': [14, 1], // on the ledge with a bow
    'esqueleto_minero-2': [18, 2],
    'mine_wagon-3': [19, 7],
    'mine_wagon_ore-2': [25, 7],
    'rubble_pile-2': [16, 5],
    'rubble_pile_c-2': [13, 9],
    'pillar_broken-2': [23, 4],
    'barrel_oil-1': [22, 9], // lamp oil by the timbering
    'campfire-2': [28, 8], // the Callados' camp at the mine end: a short rest after the fight
  },
  lights: [
    { name: 'luz-pozo', at: [2, 4], radius: 3, color: '#c8d0e0', flicker: 0.05, intensity: 0.6 },
    { name: 'candil-galeria', at: [8, 4], radius: 3, color: '#ffb050', flicker: 0.18, intensity: 0.8, prop: 'oil_lamp' },
    { name: 'candil-entibado', at: [24, 9], radius: 3.5, color: '#ffb050', flicker: 0.18, intensity: 0.8, prop: 'oil_lamp' },
    { name: 'brillo-plata', at: [26, 6], radius: 2.5, color: '#b8c8ff', flicker: 0.05, intensity: 0.5 },
  ],
  surfaces: [{ name: 'filtracion', rect: [8, 9, 5, 1], surface: 'water' }],
  encounters: [
    {
      name: 'callados-del-tunel',
      rect: [10, 1, 16, 9],
      props: { setFlag: 'tunel_despejado' },
      participants: ['callado-14', 'callado-12', 'callado-13', 'rata_gigante-2', 'rata_gigante-3', 'esqueleto_minero-1', 'esqueleto_minero-2'],
    },
  ],
  exits: [
    { name: 'a-escorial', rect: [2, 3, 1, 1], to: 'escorial', spawn: 'entry-pozo' },
    { name: 'a-mina', rect: [31, 4, 1, 6], to: 'mina', spawn: 'entry-pozo' },
  ],
  zones: {
    arenas: [{ name: 'tunel', rect: [6, 1, 22, 9] }],
  },
};
