import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The cinematic data (content/<game>/cinematics/intro.json, played by src/ui/cinematicPlayer.ts):
 * every panel has an image on disk, text and a duration, and only uses effects the player knows.
 */
const EFFECTS = new Set(['fade', 'pan', 'zoom', 'shake', 'flicker', 'pulse', 'sink', 'fall', 'spotlight', 'crumble', 'confetti', 'blink', 'drop']);
const PARTICLES = new Set(['rain', 'steam']);

for (const game of ['willy', 'intereses']) {
  describe(`${game} intro cinematic`, () => {
    const dir = new URL(`../../content/${game}/`, import.meta.url);
    const data = JSON.parse(readFileSync(new URL('cinematics/intro.json', dir), 'utf8')) as {
      size: [number, number];
      panels: { id: string; image: string; lines: string[]; durationMs: number; effect?: string; effectParams?: { particles?: string } }[];
    };

    it('has panels with images, text and a duration', () => {
      expect(data.panels.length).toBeGreaterThan(0);
      for (const p of data.panels) {
        expect(existsSync(new URL(`public/assets/cinematics/${p.image}`, dir)), `${p.id}: ${p.image}`).toBe(true);
        expect(p.lines.length, p.id).toBeGreaterThan(0);
        expect(p.durationMs, p.id).toBeGreaterThanOrEqual(3000);
      }
    });

    it('only uses effects the player knows', () => {
      for (const p of data.panels) {
        if (p.effect) expect(EFFECTS.has(p.effect), `${p.id}: ${p.effect}`).toBe(true);
        if (p.effectParams?.particles) expect(PARTICLES.has(p.effectParams.particles), `${p.id}`).toBe(true);
      }
    });
  });
}

describe('willy prologue wording', () => {
  it('does not hardcode the old five-floor season', () => {
    const text = readFileSync(new URL('../../content/willy/cinematics/intro.json', import.meta.url), 'utf8');
    expect(text).not.toMatch(/cinco plantas/i);
  });
});
