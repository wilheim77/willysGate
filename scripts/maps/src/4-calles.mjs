// Scene 3: «Hilos sueltos». The high street east of the plaza. North: the chapel of the Santa
// Pala, carved into an old adit up the hillside (Cirilo's sermon), and the widows' house.
// South: Lisandro Fuss's pawnshop. The ledger is in a trapped chest in the back room, reached
// through two different closed doors (front: from the shop; back: from the yard). East: the
// grey Lloro and the track to the Escorial.
import { Canvas } from '../paint.mjs';

const c = new Canvas(34, 24, ',', 0);
// North side: solid houses, with the chapel and the widows' house carved out.
c.rect(0, 0, 34, 9, '#');
c.rect(11, 1, 8, 4, '.', 2); // chapel nave (h2), in the rock
c.rect(14, 5, 2, 1, '.', 2); // its mouth
c.rect(14, 6, 2, 1, '.', 1); // steps
c.rect(14, 7, 2, 2, '.', 0); // the alley up to it
c.rect(22, 2, 7, 6, '=', 0); // widows' house
c.put(25, 8, '/', 0);
// The street.
c.rect(0, 9, 34, 4, '.', 0);
// Lisandro's pawnshop: shop (front), back room behind a partition, back door to the yard.
c.rect(3, 14, 11, 8, '#');
c.rect(4, 15, 9, 3, '=', 0);
c.rect(4, 19, 9, 2, '=', 0);
c.put(8, 14, '/', 0);
c.put(8, 18, '+');
c.put(5, 21, '+');
// A storehouse across the lane (solid), and the Lloro running south from a culvert.
c.rect(16, 14, 11, 6, '#');
c.rect(16, 13, 11, 1, '=', 1); // the storehouse's loading dock (h1): a little height over the street
// The yard behind the pawnshop and the storehouse, fenced (h1: a low barrier, two gaps).
c.rect(14, 22, 5, 1, 'f', 1).rect(21, 22, 6, 1, 'f', 1);
c.rect(29, 13, 2, 11, '~', 0); // the Lloro
c.rect(28, 13, 1, 11, 'Y', 0).rect(31, 13, 1, 11, 'Z', 0); // its banks (water to the east / west)
// Exterior art: cobbles on the street, scrub in the yards, timber houses, stone for the chapel
// rock face and the pawnshop.
c.retile((t, h, x, y) => {
  if (t === '#') {
    if (y <= 8 && x >= 9 && x <= 20) return 'W'; // the chapel's rock
    if (y >= 14 && x >= 3 && x <= 13) return 'W'; // Lisandro's
    if (y >= 14) return 'g';
    return (x + y) % 2 ? 'h' : 'g';
  }
  if (t === '.' && y >= 9 && y <= 12) return 'c';
  if (t === ',') return 's';
  return t;
});

export default {
  id: 'calles',
  name: 'Calles de Hondonegra',
  ambientLight: 0.45,
  ...c.source(),
  spawns: {
    'entry-plaza': [2, 10],
    'entry-escorial': [31, 11],
    // Chapel of the Santa Pala.
    cirilo: [14, 2],
    'fiel_pala-1': [12, 3],
    'fiel_pala-2': [17, 3],
    // Benita and Casilda wash clothes in the Lloro; one more widow at home.
    benita: [28, 16],
    casilda: [31, 18],
    'viuda-3': [24, 6],
    // The pawnshop.
    lisandro: [7, 16],
    'door-trastienda': [8, 18],
    'door-patio_lisandro': [5, 21],
    'chest-libro_cuentas': [11, 20],
    // Scenery: cover on the street, lamp oil in the yard.
    'crate-1': [11, 11],
    'crate-2': [19, 12],
    'barrel-1': [23, 12],
    'barrel_oil-1': [17, 21],
    'crate-3': [20, 21],
    'crate-4': [21, 21],
  },
  lights: [
    { name: 'farol-salida-plaza', at: [1, 12], radius: 3.5, color: '#ffc070', flicker: 0.12, intensity: 0.85, prop: 'lantern' },
    { name: 'farol-salida-escorial', at: [32, 12], radius: 3.5, color: '#ffc070', flicker: 0.12, intensity: 0.85, prop: 'lantern' },

    { name: 'farol-1', at: [6, 9], radius: 4, color: '#ffb050', flicker: 0.1, prop: 'torch_wall' },
    { name: 'farol-2', at: [20, 9], radius: 4, color: '#ffb050', flicker: 0.1, prop: 'torch_wall' },
    { name: 'farol-3', at: [28, 9], radius: 4, color: '#ffb050', flicker: 0.1, prop: 'torch_wall' },
    { name: 'velas-capilla-1', at: [12, 1], radius: 3, color: '#ffd090', flicker: 0.2, intensity: 0.8, prop: 'candles' },
    { name: 'velas-capilla-2', at: [17, 1], radius: 3, color: '#ffd090', flicker: 0.2, intensity: 0.8, prop: 'candles' },
    { name: 'candil-viudas', at: [27, 2], radius: 3, color: '#ffc070', flicker: 0.15, intensity: 0.7, prop: 'oil_lamp' },
    { name: 'candil-patio', at: [6, 22], radius: 3, color: '#ffb050', flicker: 0.12, intensity: 0.7, prop: 'oil_lamp' },
    { name: 'candil-lloro', at: [31, 16], radius: 3, color: '#ffc070', flicker: 0.12, intensity: 0.7, prop: 'oil_lamp' },
    { name: 'lampara-empenos', at: [10, 16], radius: 3.5, color: '#ffd090', flicker: 0.08, prop: 'oil_lamp' },
  ],
  surfaces: [{ name: 'el-lloro', rect: [29, 13, 2, 11], surface: 'water' }],
  traps: [
    {
      // A poisoned dart in the back room's floor, between the partition door and the chest.
      name: 'dardo-trastienda',
      rect: [10, 19, 1, 1],
      props: { marker: 'trap_dart', detect: 14, save: 'con', dc: 13, damage: '2d4', type: 'poison', condition: 'poisoned', turns: 3, disarmCheck: 'sleight_of_hand', disarmDc: 13 },
    },
  ],
  exits: [
    { name: 'a-plaza', rect: [0, 9, 1, 4], to: 'plaza', spawn: 'entry-calles' },
    { name: 'a-escorial', rect: [33, 9, 1, 4], to: 'escorial', spawn: 'entry-calles', props: { requiresFlag: 'audiencia_hecha', closedText: 'Primero, la audiencia con el barón.' } },
  ],
  zones: {
    scenes: [{ name: 'sermon', rect: [13, 5, 4, 3], props: { dialogue: 'sermon_cirilo', speaker: 'cirilo', once: true } }],
  },
};
