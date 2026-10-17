// Scene 6: La Bóveda, the boss arena (STORY §6). The party comes in high, on a landing level
// with the vault floor (h2). Brea holds the north balcony (h3), cut off from the floor by a
// trench (h1): only the stairs at both ends climb to it. Four silver resonators ring the centre
// (destructible; WIS save each round). The powder store sits on a south-east platform (h3).
// A chasm runs along the south (h0, falls of 2 levels, one ramp out). Mid-fight Brea blows
// the powder: the "collapse" zones sink the centre to a pit with one shallow edge (I5).
import { Canvas } from '../paint.mjs';

const c = new Canvas(32, 24, '#', 3);
c.rect(0, 11, 6, 3, '.', 2); // tunnel and landing from the mine
c.rect(6, 4, 20, 16, '.', 2); // the vault floor
c.rect(11, 1, 12, 3, '.', 3); // Brea's balcony
c.rect(11, 4, 12, 1, '.', 1); // the trench below it (h3 over h1: pushed off, you fall)
c.rect(10, 1, 1, 3, '.', 2).rect(23, 1, 1, 3, '.', 2); // stairs up at both ends
c.rect(22, 15, 4, 4, '.', 3); // the powder store's platform
c.rect(8, 20, 14, 2, '.', 0); // the chasm
c.put(22, 20, '.', 1); // its only way out
c.put(8, 10, '#').put(8, 14, '#').put(23, 10, '#').put(23, 14, '#'); // pillars

export default {
  id: 'boveda',
  name: 'La Bóveda',
  ambientLight: 0.1,
  ...c.source(),
  spawns: {
    'entry-mina': [2, 12],
    absalon: [16, 2],
    ivo: [14, 10],
    'callado-9': [9, 6],
    'callado-10': [22, 6],
    'callado-11': [10, 18],
    'callado_palido-3': [19, 12],
    // Silver resonators (I6: a destructible prop kind; WIS save each round while one stands).
    'resonador-1': [11, 8],
    'resonador-2': [20, 8],
    'resonador-3': [11, 16],
    'resonador-4': [20, 16],
    // The powder store (Brea blows it mid-fight; oil barrels stand in for powder kegs for now).
    'barrel_oil-1': [23, 16],
    'barrel_oil-2': [24, 17],
    'barrel_oil-3': [24, 15],
    'lever-polea': [21, 1], // pulley and chains: drops the ore bucket on the trench (TODO script)
    'todo-inscripcion': [7, 5], // the elvish carving: [Historia] CD 13 for an elf or dwarf
  },
  lights: [
    { name: 'brillo-resonador-1', at: [11, 7], radius: 3, color: '#b8c8ff', flicker: 0.05, intensity: 0.7 },
    { name: 'brillo-resonador-2', at: [20, 7], radius: 3, color: '#b8c8ff', flicker: 0.05, intensity: 0.7 },
    { name: 'brillo-resonador-3', at: [11, 17], radius: 3, color: '#b8c8ff', flicker: 0.05, intensity: 0.7 },
    { name: 'brillo-resonador-4', at: [20, 17], radius: 3, color: '#b8c8ff', flicker: 0.05, intensity: 0.7 },
    { name: 'brasero-brea', at: [13, 2], radius: 4.5, color: '#ff9a4a', flicker: 0.18, prop: 'brazier' },
    { name: 'farol-polvorin', at: [25, 18], radius: 3, color: '#ffb050', flicker: 0.15 },
  ],
  surfaces: [{ name: 'escombros-sima', rect: [8, 20, 3, 2], surface: 'rubble' }],
  encounters: [
    {
      name: 'brea',
      rect: [8, 1, 18, 21],
      participants: ['absalon', 'ivo', 'callado-9', 'callado-10', 'callado-11', 'callado_palido-3'],
    },
  ],
  exits: [{ name: 'a-mina', rect: [0, 11, 1, 3], to: 'mina', spawn: 'entry-boveda' }],
  zones: {
    scenes: [{ name: 'brea-habla', rect: [3, 10, 4, 5], props: { dialogue: 'TODO:boveda_brea', speaker: 'absalon', once: true } }],
    // Proposed layer (I5): Brea's blast sinks the centre. Pit at h0, a shallow edge at h1.
    collapse: [
      { name: 'derrumbe', rect: [13, 9, 5, 6], props: { height: 0, terrain: 'stone', trigger: 'TODO:brea_vuela_polvorin' } },
      { name: 'derrumbe-borde', rect: [18, 9, 1, 6], props: { height: 1, terrain: 'stone', trigger: 'TODO:brea_vuela_polvorin' } },
    ],
  },
};
