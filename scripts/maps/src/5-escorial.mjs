// Scene 4: El Escorial and the Pozo del Ahorcado. The Sinpaga hold the slag heaps south of the
// town. A track crosses the field west to east under heap A, where an oil cart sits on the
// edge (shoot it and the track burns). Their camp lies between the heaps, with a lookout
// scaffold. East: the hanged man's well (smuggling route into the mine, first Callado) and the
// barred main adit (bocamina).
import { Canvas } from '../paint.mjs';

const c = new Canvas(36, 26, ';', 0);
// Valley rim (unclimbable: h3 next to h0).
c.rect(0, 0, 36, 1, ';', 3).rect(0, 25, 36, 1, ';', 3).rect(0, 0, 1, 26, ';', 3).rect(35, 0, 1, 26, ';', 3);
// Tracks: down from the plaza (north-west), across from the streets (west), east to the well.
c.rect(3, 0, 3, 14, ',', 0);
c.rect(0, 11, 33, 3, ',', 0);
// Heap A, north of the track: rings up to a peak (h3) with a sheer south face over the track.
c.rect(9, 2, 10, 8, ';', 1).rect(10, 3, 8, 6, ';', 2).rect(12, 4, 4, 4, ';', 3);
c.rect(12, 8, 4, 1, ';', 3); // the cart's ledge: h3 straight over...
c.rect(12, 9, 4, 1, ';', 1); // ...an h1 shoulder above the track (push someone: 2 levels)
// Heap B, east of the camp.
c.rect(23, 15, 8, 8, ';', 1).rect(24, 16, 6, 6, ';', 2).rect(25, 17, 4, 4, ';', 3);
// The Sinpaga camp: trampled dirt, a shack, a raised plank platform and a lookout scaffold.
c.rect(9, 15, 13, 8, ',', 0);
c.rect(10, 16, 3, 3, '#');
c.rect(16, 15, 4, 3, '=', 1);
c.put(18, 16, 'H', 2);
// The slag pond: grey runoff.
c.rect(4, 18, 3, 3, ';', 0);
// The Pozo del Ahorcado: a ring of stone open to the south.
c.rect(30, 4, 3, 2, '#').put(31, 5, '.', 0).rect(31, 6, 1, 5, ',', 0); // the well itself is a prop at its mouth
// The main adit, cut into the rock in the south-east corner and barred with planks.
c.rect(30, 18, 5, 7, '#');
c.rect(32, 14, 1, 4, ',', 0).put(32, 18, '+').rect(32, 19, 1, 3, '.', 0);
// Exterior art: slag heaps, rock on the rim, roads, a muddy camp and pond, the shack, the well.
c.retile((t, h, x, y) => {
  if (x === 0 || y === 0 || x === 35 || y === 25) if (t === ';') return 'k';
  if (t === ';') return h === 0 && x >= 4 && x <= 6 && y >= 18 && y <= 20 ? 'm' : 'S';
  if (t === ',') {
    if (x >= 9 && x <= 21 && y >= 15 && y <= 22) return 'm'; // the camp
    return y >= 11 && y <= 13 ? 'R' : 'I';
  }
  if (t === '#') return y >= 16 && y <= 18 && x >= 10 && x <= 12 ? 'g' : 'W';
  return t;
});

export default {
  id: 'escorial',
  name: 'El Escorial',
  ambientLight: 0.6,
  ...c.source(),
  spawns: {
    'entry-plaza': [4, 2],
    'entry-calles': [2, 12],
    'entry-pozo': [31, 8],
    'entry-bocamina': [32, 16],
    // The Sinpaga: shooters on the heights, knives in the camp, the brute by the fire.
    'sinpaga_enmascarado-1': [13, 5], // heap A peak, next to the oil cart
    'sinpaga_enmascarado-2': [26, 18], // heap B peak
    'sinpaga_cuchillero-1': [12, 20],
    'sinpaga_cuchillero-2': [20, 20],
    'sinpaga_cuchillero-3': [18, 16], // lookout scaffold
    'sinpaga_bruto-1': [15, 19],
    // The first Callado, by the well. Not part of the fight: he just looks, and goes down.
    'callado-1': [31, 9],
    // The oil cart on the ledge, and scenery.
    'barrel_oil-1': [13, 8],
    'barrel_oil-2': [14, 8],
    'oil_cart-1': [12, 8],
    'crate-3': [21, 17],
    'barrel-1': [9, 21],
    'campfire-1': [14, 21],
    'door-bocamina': [32, 18],
    'well-1': [31, 5],
  },
  lights: [
    { name: 'hoguera-sinpaga', at: [14, 21], radius: 5, color: '#ff9a4a', flicker: 0.2 },
    { name: 'farol-pozo', at: [30, 6], radius: 3.5, color: '#ffb050', flicker: 0.15, prop: 'torch_wall' },
    { name: 'antorcha-bocamina', at: [31, 17], radius: 4, color: '#ffb050', flicker: 0.15, prop: 'torch_wall' },
  ],
  surfaces: [
    // Oil leaking from the cart down the shoulder onto the track: the barrels' blast lights it.
    { name: 'aceite-carro', rect: [12, 9, 4, 3], surface: 'oil' },
    { name: 'balsa-escoria', rect: [4, 18, 3, 3], surface: 'water' },
    { name: 'escombros-ladera-a', rect: [9, 2, 2, 3], surface: 'rubble' },
    { name: 'escombros-ladera-b', rect: [29, 15, 2, 3], surface: 'rubble' },
  ],
  traps: [
    {
      // A tripwire across the west track: it tips a hidden jar and pours oil on the track.
      name: 'cuerda-aceite',
      rect: [7, 11, 1, 3],
      props: { marker: 'trap_tripwire', detect: 13, surface: 'oil', disarmCheck: 'sleight_of_hand', disarmDc: 12 },
    },
    {
      name: 'cepo-sinpaga',
      rect: [22, 13, 1, 1],
      props: { marker: 'trap_beartrap', detect: 12, save: 'dex', dc: 13, damage: '2d6', type: 'piercing', condition: 'restrained', disarmCheck: 'sleight_of_hand', disarmDc: 12 },
    },
  ],
  // The Sinpaga chief talks first (sinpaga_jefe); the fight, if any, is by faction. The band
  // covers both ways in from the town (plaza and streets), wall to wall.
  zones: {
    scenes: [
      { name: 'sinpaga-jefe', rect: [1, 1, 7, 24], props: { dialogue: 'sinpaga_jefe', speaker: 'sinpaga_enmascarado-1', once: true, gate: true, protects: 'pozo-del-ahorcado,bocamina' } },
    ],
  },
  exits: [
    { name: 'a-plaza', rect: [3, 0, 3, 1], to: 'plaza', spawn: 'entry-escorial' },
    { name: 'a-calles', rect: [0, 11, 1, 3], to: 'calles', spawn: 'entry-escorial' },
    // The mine comes after the night of the torches (D1).
    { name: 'pozo-del-ahorcado', rect: [31, 6, 1, 1], to: 'mina', spawn: 'entry-pozo', props: { requiresFlag: 'd1_resuelto' } },
    { name: 'bocamina', rect: [32, 21, 1, 1], to: 'mina', spawn: 'entry-bocamina', props: { requiresFlag: 'd1_resuelto' } },
  ],
};
