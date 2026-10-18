// Side path off «El camino»: el Barranco de las Cabras. Optional. A dry ravine climbs north to a
// hollow where a wolf pack has dragged a traveller (his chest is still there). Two ways up: the
// narrow neck in the ravine floor (a chokepoint the wolves can hold) or the long goat ledge on
// the east side (h2, a 3-high spur over the neck: shove a wolf off it). A stream crosses the hollow.
import { Canvas } from '../paint.mjs';

const c = new Canvas(28, 20, 'C', 4);
c.rect(12, 18, 2, 2, 's', 1); // the track up from the road
c.rect(10, 14, 6, 4, 's', 1); // the ravine mouth
c.rect(8, 9, 6, 5, 's', 1); // the ravine
c.rect(12, 7, 2, 2, 's', 1); // the neck (2 tiles)
c.rect(14, 8, 2, 1, 's', 1); // a shelf under the spur
c.rect(6, 1, 16, 6, 's', 1); // the hollow
c.rect(8, 3, 11, 1, 'm', 0); // the stream bed
c.put(11, 5, 'C', 4).put(16, 2, 'C', 4); // boulders in the hollow
// The goat ledge: up a ramp at the ravine mouth, along the east side, over the spur, into the hollow.
c.rect(16, 10, 2, 5, 's', 2);
c.rect(16, 7, 2, 3, 'k', 3); // the spur (h3) right over the shelf (h1): a 2-level drop
c.rect(16, 5, 2, 2, 's', 2);

export default {
  id: 'barranco',
  name: 'Barranco de las Cabras',
  ambientLight: 0.45,
  ...c.source(),
  spawns: {
    'entry-camino': [12, 17],
    // The pack: two at the neck, one on the far bank, the leader on the spur.
    'lobo-1': [11, 6],
    'lobo-2': [14, 6],
    'lobo-3': [9, 2],
    'lobo-4': [16, 8],
    'chest-viajero': [7, 2], // what the wolves left of a traveller
    'crate-1': [9, 11], // dead trees for now (dead_tree when the art lands)
    'crate-2': [14, 15],
    'crate-3': [19, 5],
  },
  lights: [{ name: 'farol-viajero', at: [8, 2], radius: 3, color: '#ffc070', flicker: 0.2, intensity: 0.7, prop: 'lantern' }],
  surfaces: [
    { name: 'arroyo', rect: [8, 3, 11, 1], surface: 'water' },
    { name: 'pedregal', rect: [16, 11, 2, 2], surface: 'rubble' },
  ],
  encounters: [{ name: 'lobos', rect: [6, 1, 16, 7], participants: ['lobo-1', 'lobo-2', 'lobo-3', 'lobo-4'] }],
  exits: [{ name: 'a-camino', rect: [12, 19, 2, 1], to: 'camino', spawn: 'entry-barranco' }],
  zones: {
    arenas: [{ name: 'lobos', rect: [6, 1, 16, 14] }],
  },
};
