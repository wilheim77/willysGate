import { describe, expect, it } from 'vitest';
import raw from '../../content/willy/tutorial.json';
import { tutorial, tutorialLocks } from '../../content/willy/tutorial';

describe('willy tutorial wiring', () => {
  const ids = tutorial.map((s) => s.id);

  it('has unique ids, all from tutorial.json, each with text', () => {
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(raw.pasos.map((p) => p.id));
    for (const s of tutorial) {
      expect(known.has(s.id), s.id).toBe(true);
      expect((Array.isArray(s.text) ? s.text.join('') : s.text).length, s.id).toBeGreaterThan(10);
    }
  });

  it('chains only on steps that come earlier', () => {
    for (const [i, s] of tutorial.entries()) {
      for (const dep of s.after ?? []) expect(ids.indexOf(dep), `${s.id} after ${dep}`).toBeLessThan(i);
    }
  });

  it('unlocks every locked HUD piece with a step that exists', () => {
    expect(Object.keys(tutorialLocks).sort()).toEqual(['hud-audiencia', 'hud-grupo', 'hud-mochila', 'hud-reloj']);
    for (const [hud, id] of Object.entries(tutorialLocks)) expect(ids.includes(id), `${hud} -> ${id}`).toBe(true);
  });

  it('does not let two steps wait for the same event batch to chain (floorEntered shows one; the clock waits for a move)', () => {
    const clock = tutorial.find((s) => s.id === 't15-reloj')!;
    expect(clock.after).toContain('t05-atributos');
  });
});
