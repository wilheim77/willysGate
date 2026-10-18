// Prologue: «El camino». Dusk on the last stretch of road into the valley (40x20).
// West to east: the start; the tutorial fight (carrion dogs on a dead mule, a broken cart and a
// field wall for cover, a hillock for height); Garrán in the ditch; the hungry miners at a
// chokepoint between a rocky outcrop (lookout on h3, a 2-level drop onto the road) and their
// overturned cart (oil); the exit to the valley. A goat track climbs north to the ravine.
import { Canvas } from '../paint.mjs';

const c = new Canvas(40, 20, 's', 1);
// Valley sides: rock at the edges, a band of higher scrub inside them.
c.rect(0, 0, 40, 1, 'C', 4).rect(0, 1, 40, 1, 's', 2);
c.rect(0, 19, 40, 1, 'C', 4).rect(0, 18, 40, 1, 's', 2);
// The road (h1), widening into the valley at the east end.
c.rect(0, 9, 40, 2, 'R', 1).rect(35, 8, 5, 4, 'R', 1);

// --- Tutorial: carrion dogs (x 6-14) ---------------------------------------------------
c.rect(5, 4, 4, 3, 's', 2); // a hillock north of the road: height to shoot from
c.rect(11, 12, 3, 1, 'W'); // a dry-stone field wall south of the road
c.put(13, 7, 'k', 3).put(14, 7, 'k', 3); // a boulder

// --- Garrán's ditch (x 15-21) ------------------------------------------------------------
c.rect(15, 12, 7, 3, 'm', 0);

// --- The hungry miners (x 24-37) -----------------------------------------------------------
c.rect(25, 3, 6, 5, 'k', 2).rect(26, 3, 4, 5, 'k', 3); // the outcrop: h2 ramp on its west and east sides, h3 crown
c.rect(33, 7, 3, 1, 'W'); // a field wall north of the road beyond the cart
c.put(24, 13, 'k', 3).put(25, 14, 'k', 3); // boulders on the south flank
c.rect(26, 15, 4, 2, 'm', 0); // a muddy hollow on the long way round

// The goat track north to the ravine (x 19-20).
c.rect(19, 2, 2, 2, 's', 1).rect(19, 0, 2, 2, 's', 2);

export default {
  id: 'camino',
  name: 'El camino',
  ambientLight: 0.6,
  properties: { start: true },
  ...c.source(),
  spawns: {
    hero: [2, 9],
    dorotea: [2, 10],
    'entry-plaza': [37, 9], // back from the plaza
    'entry-barranco': [19, 3], // back from the ravine
    // Tutorial: two carrion dogs and a rat on a dead mule.
    'perro_carronero-1': [10, 8],
    'perro_carronero-2': [11, 10],
    'rata_gigante-1': [9, 11],
    'crate-1': [8, 7], // the mule's broken cart
    'crate-2': [8, 8],
    garran: [18, 13],
    // The hungry miners: two in front on the road, one behind the cart, the lookout on the crown.
    minero_cabecilla: [30, 9],
    minero_hambriento_3: [31, 10], // the big one
    minero_hambriento_1: [32, 12],
    minero_hambriento_2: [27, 5], // lookout with a crossbow; can be shoved off the south edge (2 levels)
    'oil_cart-1': [29, 12], // the overturned cart
    'crate-3': [28, 12],
    'crate-4': [31, 12],
    'barrel_oil-1': [30, 13],
    'campfire-1': [34, 14],
  },
  lights: [
    { name: 'hoguera-salida-1', at: [38, 7], radius: 4, color: '#ff9a4a', flicker: 0.18, prop: 'brazier' },
    { name: 'hoguera-salida-2', at: [38, 12], radius: 4, color: '#ff9a4a', flicker: 0.18, prop: 'brazier' },
    { name: 'hoguera-mineros', at: [34, 14], radius: 5, color: '#ff9a4a', flicker: 0.18 },
    { name: 'farol-sendero', at: [21, 3], radius: 3, color: '#ffc070', flicker: 0.12, intensity: 0.8, prop: 'lantern' },
  ],
  surfaces: [
    { name: 'sangre-mula', rect: [9, 9, 2, 1], surface: 'blood' },
    { name: 'charco-camino', rect: [22, 9, 2, 2], surface: 'water' },
    { name: 'aceite-carro', rect: [29, 13, 3, 1], surface: 'oil' },
  ],
  traps: [
    {
      name: 'cepo-furtivo',
      rect: [22, 5, 1, 1],
      props: { marker: 'trap_beartrap', detect: 10, save: 'dex', dc: 11, damage: '1d6', type: 'piercing', condition: 'restrained', disarmCheck: 'sleight_of_hand', disarmDc: 10 },
    },
  ],
  encounters: [
    // The tutorial: wall to wall, so the first fight always happens (and stays easy).
    { name: 'perros-carroneros', rect: [6, 1, 1, 18], participants: ['perro_carronero-1', 'perro_carronero-2', 'rata_gigante-1'], props: { tutorial: true } },
  ],
  exits: [
    { name: 'a-hondonegra', rect: [39, 8, 1, 4], to: 'plaza', spawn: 'entry-camino', props: { requiresFlag: 'prologo_mineros_resuelto', closedText: 'Los mineros siguen cortando el camino.' } },
    { name: 'a-barranco', rect: [19, 0, 2, 1], to: 'barranco', spawn: 'entry-camino' },
  ],
  zones: {
    scenes: [
      // Both bands run wall to wall (gate: true): nobody walks past Garrán or the miners.
      { name: 'garran-en-la-cuneta', rect: [15, 1, 1, 18], props: { dialogue: 'camino_garran', speaker: 'garran', once: true, gate: true, protects: 'a-hondonegra' } },
      { name: 'mineros-cortan-el-paso', rect: [23, 1, 1, 18], props: { dialogue: 'camino_mineros', speaker: 'minero_cabecilla', once: true, gate: true, protects: 'a-hondonegra', fight: 'minero_cabecilla,minero_hambriento_1,minero_hambriento_2,minero_hambriento_3' } },
    ],
    // Fight areas (docs/MAPS.md, «Combates tácticos»): checked for cover, height and hazards.
    arenas: [
      { name: 'perros-carroneros', rect: [5, 4, 10, 9], props: { tutorial: true } },
      { name: 'mineros', rect: [23, 2, 15, 16] },
    ],
  },
};
