import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, createEngine } from '../../engine';
import { willy } from '../../rulesets/willy';
import { maps, newWillyGame } from '../../content/willy/setup';
import { narrateEvents } from '../../content/willy/narrator';

const engine = createEngine(willy, 'willy-intro', { dialogues: {}, maps });

function arrive(floor: number): { state: GameState; events: GameEvent[] } {
  const s = newWillyGame(engine, 4, { start: `planta-${floor}` });
  const w = s.entities.willy!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const r = engine.apply(s, { type: 'move', issuer: 'player:1', entityId: 'willy', to: { x: w.position.x + dx, y: w.position.y + dy } } as BaseCommand);
    if (r.ok) return { state: r.state, events: r.events };
  }
  throw new Error('no step');
}

describe('Willy: the Narrador names the right biome when a floor starts', () => {
  const biome: Record<number, string> = { 1: 'Castro', 2: 'Castro', 3: 'Hipermercado', 4: 'Hipermercado', 5: 'Verbena', 6: 'Verbena' };
  for (const [floor, name] of Object.entries(biome)) {
    it(`floor ${floor}: ${name}`, () => {
      const { state, events } = arrive(Number(floor));
      const intro = events.filter((e) => e.type === 'floorEntered');
      expect(intro).toHaveLength(1);
      // Several tries: the bank picks among matching lines with the run's RNG.
      const line = narrateEvents(intro, state)?.text ?? '';
      expect(line, line).toContain(name);
    });
  }
});
