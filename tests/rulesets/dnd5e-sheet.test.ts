import { describe, expect, it } from 'vitest';
import { createEngine } from '../../engine';
import { createCharacter, createMonster, createProp, dnd5e } from '../../rulesets/dnd5e';
import { asciiMap } from '../fixtures/helpers';

const engine = createEngine(dnd5e, 'test');

describe('character sheet', () => {
  const garran = createCharacter({
    id: 'garran', name: 'Garrán', controllerId: 'player:1', factionId: 'party', position: { x: 0, y: 0 }, spriteId: 'hero',
    classId: 'fighter', raceId: 'half_orc', level: 3, abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
  });
  const thug = createMonster({ id: 'thug', monsterId: 'thug', controllerId: 'ai', factionId: 'sinpaga', position: { x: 2, y: 0 }, spriteId: 'thug' });
  const crate = createProp({ id: 'crate', kind: 'crate', position: { x: 3, y: 0 } });
  const state = engine.newGame({ seed: 1, map: asciiMap(['.....']), entities: [garran, thug, crate] });
  const titles = (id: string) => dnd5e.describeEntity!(state, id).sections.map((s) => s.title);

  it('describes a character: class, abilities, weapons and features', () => {
    const sheet = dnd5e.describeEntity!(state, 'garran');
    expect(sheet.subtitle).toBe('Semiorco · Guerrero (Campeón) · nivel 3');
    expect(titles('garran')).toEqual(expect.arrayContaining(['Combate', 'Características', 'Habilidades', 'Recursos', 'Armas', 'Rasgos']));
    const abilities = sheet.sections.find((s) => s.title === 'Características')!.rows!;
    expect(abilities[0]).toEqual({ label: 'Fuerza', value: '18 (+4) · salv.' });
    const features = sheet.sections.find((s) => s.title === 'Rasgos')!.items!.map((i) => i.label);
    expect(features).toContain('Crítico mejorado');
  });

  it('describes monsters and objects with less detail', () => {
    expect(dnd5e.describeEntity!(state, 'thug').subtitle).toBeTruthy();
    expect(titles('crate')).toEqual(['Combate']);
  });
});
