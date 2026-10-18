// Between the plaza and the high street: el Callejón del Pagaré. Lisandro's debt collectors have
// a widow's door off its hinges in the little courtyard halfway along. The alley mouth is a
// two-tile chokepoint; a back passage through a ruined house lets the party flank them from
// below. A crossbowman holds the wooden balcony (h2) over the yard, with a 2-level drop under it.
import { Canvas } from '../paint.mjs';

const c = new Canvas(30, 14, '#', 3);
c.rect(0, 6, 30, 2, 'c', 0); // the alley
c.rect(10, 3, 10, 8, 'c', 0); // the courtyard
c.rect(12, 3, 6, 1, 'y', 2); // the balcony over the yard...
c.put(11, 3, 'y', 1); // ...up its stair
c.rect(3, 8, 2, 2, 'c', 0).rect(3, 10, 24, 2, 'c', 0).rect(25, 8, 2, 2, 'c', 0); // the back passage
c.rect(17, 5, 1, 2, 'L', 1); // a low wall across the yard
c.retile((t, h, x, y) => (t === '#' ? ((x + y) % 2 ? 'h' : 'g') : t));

export default {
  id: 'callejon',
  name: 'Callejón del Pagaré',
  ambientLight: 0.4,
  ...c.source(),
  spawns: {
    'entry-plaza': [1, 6],
    'entry-calles': [28, 7],
    // Lisandro's collectors: two heavies in front, a lockpick behind the wall, a crossbow above.
    'cobrador-1': [15, 6],
    'cobrador-2': [15, 8],
    'ganzua-1': [14, 3], // on the balcony
    'ganzua-2': [18, 5],
    'cart_sacks-1': [12, 8],
    'sacks-1': [13, 8],
    'crate-1': [18, 9],
    'barrel_oil-1': [11, 5], // by the balcony stair
    'rubble_pile-1': [6, 10],
    'rubble_pile_b-1': [22, 11],
  },
  lights: [
    { name: 'farol-patio', at: [10, 4], radius: 4, color: '#ffc070', flicker: 0.12, intensity: 0.85, prop: 'lantern' },
    { name: 'farol-boca-oeste', at: [1, 7], radius: 3, color: '#ffc070', flicker: 0.12, intensity: 0.8, prop: 'oil_lamp' },
    { name: 'farol-boca-este', at: [28, 6], radius: 3, color: '#ffc070', flicker: 0.12, intensity: 0.8, prop: 'oil_lamp' },
  ],
  surfaces: [{ name: 'cuneta', rect: [20, 7, 4, 1], surface: 'water' }],
  encounters: [{ name: 'cobradores', rect: [9, 2, 12, 10], participants: ['cobrador-1', 'cobrador-2', 'ganzua-1', 'ganzua-2'] }],
  exits: [
    { name: 'a-plaza', rect: [0, 6, 1, 2], to: 'plaza', spawn: 'entry-callejon' },
    { name: 'a-calles', rect: [29, 6, 1, 2], to: 'calles', spawn: 'entry-callejon' },
  ],
  zones: {
    arenas: [{ name: 'cobradores', rect: [8, 2, 14, 10] }],
  },
};
