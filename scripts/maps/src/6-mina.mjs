// Scene 5: the mine. Three ways in: the main adit (west, with the Cuadrilla after D1), the
// Pozo del Ahorcado (north, the shaft lands on a high ledge) and the abbey crypt (south-west
// tunnel, its own ambush). They meet in the great working: a floor with rails and wagons,
// a north ledge (h2), a west scaffold tower (h3) and an east scaffold walkway (h2) where the
// Callados wait. East, through the breach: the Galería Sellada (the forty, the fuse, D2,
// the ambush) and the way down to the Bóveda.
import { Canvas } from '../paint.mjs';

const c = new Canvas(40, 30, '#', 3);
// Main adit with its rails (west).
c.rect(0, 13, 15, 3, '.', 0).rect(0, 14, 15, 1, '-', 0);
// The great working.
c.rect(14, 5, 17, 17, '.', 0);
c.rect(14, 14, 17, 1, '-', 0); // rails
c.rect(16, 5, 13, 2, '.', 2); // north ledge (h2): drops 2 onto the floor
c.put(15, 6, 'H', 1).put(15, 5, '#'); // west stairs down from the ledge
c.rect(29, 5, 1, 3, 'H', 2).put(30, 5, '#').put(30, 6, '#'); // the ledge joins the east walkway
c.rect(29, 8, 2, 11, 'H', 2); // east walkway (h2)...
c.rect(29, 13, 2, 3, '.', 0).rect(29, 14, 2, 1, '-', 0); // ...broken where the rails run under it to the breach
c.put(29, 19, 'H', 1); // its stairs
c.put(30, 19, '#');
c.put(16, 12, 'H', 1).put(16, 11, 'H', 2).rect(16, 10, 3, 1, 'H', 3); // west tower: steps up to h3
c.rect(21, 9, 2, 2, '#').rect(25, 16, 1, 2, '#'); // pillars left standing
// The shaft from the Pozo del Ahorcado: lands on a high alcove over the ledge.
c.rect(20, 1, 3, 4, '.', 3).put(21, 0, '.', 3);
// The Galería Sellada, through the breach (rubble), with ambush alcoves north and south.
c.rect(31, 13, 1, 3, '.', 0);
c.rect(32, 10, 7, 9, '.', 0);
c.rect(31, 14, 5, 1, '-', 0);
c.rect(33, 8, 2, 2, '.', 0).rect(36, 19, 2, 2, '.', 0);
c.rect(39, 13, 1, 3, '.', 0); // the way down to the Bóveda
c.rect(36, 12, 2, 2, '.', 1); // a mound of spoil in the Galería Sellada
// The crypt tunnel from the abbey (south-west), winding up into the working.
c.rect(0, 26, 6, 3, '.', 0);
c.rect(6, 26, 11, 2, '.', 0);
c.rect(15, 22, 2, 6, '.', 0);
c.rect(15, 22, 2, 2, '.', 1); // a rubble step where the tunnel turns: height to hold

export default {
  id: 'mina',
  name: 'La mina',
  ambientLight: 0.12,
  ...c.source(),
  spawns: {
    'chest-capataz': [5, 28], // the old foreman's strongbox: potions, coin and a chance of a magic item
    'entry-bocamina': [2, 13],
    'entry-pozo': [21, 2],
    'entry-cripta': [2, 27],
    'entry-boveda': [37, 14],
    // Callados in the working (scaffolds and ledge).
    'callado-2': [17, 10],
    'callado-3': [30, 12],
    'callado-4': [24, 5],
    'callado_palido-1': [27, 20],
    // Crypt route: its own pair.
    'callado-5': [13, 26],
    'callado-6': [15, 24],
    // The Galería Sellada: the ambush waits in the alcoves.
    'callado-7': [33, 8],
    'callado-8': [37, 20],
    'callado_palido-2': [38, 11],
    'fuse_charges-1': [35, 11], // the fuse and charges Garrán laid (D2)
    'remains_forty-1': [34, 16], // the forty; the baron's payroll with the thirty crowns
    // Wagons on the rails, lamp oil by the walkway.
    'mine_wagon-1': [8, 14],
    'mine_wagon_ore-1': [19, 14],
    'barrel_oil-1': [23, 13],
    'mine_wagon-2': [26, 14],
    'barrel_oil-2': [28, 20],
    'barrel-1': [33, 14],
    'campfire-4': [38, 15], // embers at the way down: a short rest after D2 (descanso_mina)
    'rubble_pile-1': [18, 18],
    'ore_pile-1': [27, 10],
    'rubble_pile_c-1': [34, 10],
    'powder_keg-1': [33, 12], // what is left of the blasting powder
    'barrel_oil-3': [12, 27], // lamp oil in the crypt tunnel
  },
  lights: [
    { name: 'candil-bajada-boveda', at: [38, 12], radius: 3, color: '#ffb050', flicker: 0.18, intensity: 0.8, prop: 'oil_lamp' },
    { name: 'candil-pozo', at: [21, 1], radius: 3, color: '#ffb050', flicker: 0.18, intensity: 0.8, prop: 'oil_lamp' },
    { name: 'candil-bocamina', at: [4, 13], radius: 4, color: '#ffb050', flicker: 0.15, prop: 'torch_wall' },
    { name: 'candil-torre', at: [17, 12], radius: 3.5, color: '#ffb050', flicker: 0.15, prop: 'oil_lamp' },
    { name: 'candil-repisa', at: [22, 5], radius: 4, color: '#ffb050', flicker: 0.15, prop: 'torch_wall' },
    { name: 'candil-pasarela', at: [29, 15], radius: 3.5, color: '#ffb050', flicker: 0.15, prop: 'oil_lamp' },
    { name: 'brillo-plata', at: [35, 14], radius: 3, color: '#b8c8ff', flicker: 0.05, intensity: 0.6 },
    { name: 'candil-tunel-cripta', at: [15, 25], radius: 3, color: '#ffb050', flicker: 0.18, intensity: 0.7, prop: 'oil_lamp' },
    { name: 'candil-brecha', at: [30, 15], radius: 3, color: '#ffb050', flicker: 0.18, intensity: 0.7, prop: 'oil_lamp' },
    { name: 'vela-cripta', at: [3, 26], radius: 2.5, color: '#ffd090', flicker: 0.2, intensity: 0.7, prop: 'candles' },
  ],
  surfaces: [
    { name: 'filtracion', rect: [20, 18, 4, 3], surface: 'water' },
    { name: 'brecha', rect: [31, 13, 1, 3], surface: 'rubble' },
    { name: 'escombros-sellada', rect: [36, 16, 2, 2], surface: 'rubble' },
  ],
  traps: [
    {
      // A rotten plank on the east walkway.
      name: 'tablon-podrido',
      rect: [29, 10, 1, 1],
      props: { marker: 'trap_rotten_plank', detect: 14, save: 'dex', dc: 12, damage: '2d6', type: 'bludgeoning', condition: 'prone', disarmCheck: 'athletics', disarmDc: 12 },
    },
    {
      // Brea's tripwire in the crypt tunnel: brings the roof down.
      name: 'cable-derrumbe',
      rect: [9, 26, 1, 2],
      props: { marker: 'trap_tripwire', detect: 13, save: 'dex', dc: 13, damage: '2d8', type: 'bludgeoning', half: true, surface: 'rubble', disarmCheck: 'sleight_of_hand', disarmDc: 13 },
    },
  ],
  encounters: [
    { name: 'callados-andamios', rect: [14, 7, 15, 15], participants: ['callado-2', 'callado-3', 'callado-4', 'callado_palido-1'] },
    { name: 'callados-cripta', rect: [11, 22, 6, 6], participants: ['callado-5', 'callado-6'] },
    // After the D2 scene (I4: requiresFlag once the writer names it).
    { name: 'emboscada-sellada', rect: [32, 10, 7, 9], participants: ['callado-7', 'callado-8', 'callado_palido-2'], props: { requiresFlag: 'd2_resuelta' } },
  ],
  exits: [
    { name: 'a-escorial-bocamina', rect: [0, 13, 1, 3], to: 'escorial', spawn: 'entry-bocamina' },
    { name: 'a-escorial-pozo', rect: [21, 0, 1, 1], to: 'tunel', spawn: 'entry-mina' },
    { name: 'a-abadia-cripta', rect: [0, 26, 1, 3], to: 'abadia', spawn: 'entry-cripta' },
    { name: 'a-boveda', rect: [39, 13, 1, 3], to: 'boveda', spawn: 'entry-mina' },
  ],
  zones: {
    // Fight areas (docs/MAPS.md, «Combates tácticos»): checked for cover, height and hazards.
    arenas: [
      { name: 'andamios', rect: [14, 5, 17, 17] },
      { name: 'cripta', rect: [6, 22, 11, 6] },
      { name: 'galeria-sellada', rect: [31, 8, 9, 13] },
    ],
    scenes: [{ name: 'galeria-sellada', rect: [32, 12, 3, 5], props: { dialogue: 'galeria_sellada', speaker: 'garran', once: true } }],
  },
};
