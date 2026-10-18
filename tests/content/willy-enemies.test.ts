import { describe, expect, it } from 'vitest';
import ninja from '../../content/willy/assets/ninja.json';
import floorsData from '../../content/willy/data/floors.json';
import { generateFloor } from '../../content/willy/gen/floor';
import { MONSTER_ABILITIES } from '../../rulesets/willy/monsters';

describe('Willy: enemy variety', () => {
  it('every enemy has art, and its abilities exist', () => {
    const sprites = ninja.sprites as Record<string, unknown>;
    for (const planta of floorsData.plantas) {
      for (const [id, e] of Object.entries(planta.enemigos as unknown as Record<string, { habilidades?: string[]; estalla?: string }>)) {
        expect(sprites[id], id).toBeDefined();
        for (const h of [...(e.habilidades ?? []), ...(e.estalla ? [e.estalla] : [])]) expect(MONSTER_ABILITIES[h], `${id}: ${h}`).toBeDefined();
      }
    }
  });

  it('deeper floors bring elites, and floors are full of special abilities', () => {
    let elites = 0;
    let abilities = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const ents = generateFloor(seed, 9).setup.entities;
      elites += ents.filter((e) => e.tags.includes('elite') && !e.tags.includes('guardian')).length;
      abilities += ents.filter((e) => e.tags.some((t) => t.startsWith('habilidad:'))).length;
      for (const e of ents.filter((x) => x.tags.includes('elite') && !x.tags.includes('guardian'))) {
        expect(e.tags.some((t) => t.startsWith('elite:')), e.id).toBe(true);
        // The golden recolour where the art has one (the 21 newer enemies); the base sprite otherwise.
        const base = e.spriteId.replace(/--elite$/, '');
        if ((ninja.sprites as Record<string, unknown>)[`${base}--elite`]) expect(e.spriteId, e.id).toBe(`${base}--elite`);
      }
    }
    expect(elites).toBeGreaterThan(3);
    expect(abilities).toBeGreaterThan(8);
    // Floor 1 has no elites.
    for (let seed = 1; seed <= 8; seed++) expect(generateFloor(seed, 1).setup.entities.filter((e) => e.tags.includes('elite') && !e.tags.includes('guardian'))).toHaveLength(0);
  });
});
