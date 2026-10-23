import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, RngCursor, createEngine } from '../../engine';
import { tutorialFlag, tutorialUnlocked, willy } from '../../rulesets/willy';
import { clockAfterCommand, clockOf } from '../../rulesets/willy/clock';
import { tutorialAfterCommand } from '../../rulesets/willy/tutorial';
import { maps, newWillyGame } from '../../content/willy/setup';

const engine = createEngine(willy, 'willy-tutorial', { dialogues: {}, maps });

function onFloor1(): GameState {
  const s = newWillyGame(engine, 3, { start: 'planta-1' });
  const w = s.entities.willy!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const r = engine.apply(s, { type: 'move', issuer: 'player:1', entityId: 'willy', to: { x: w.position.x + dx, y: w.position.y + dy } } as BaseCommand);
    if (r.ok) return r.state;
  }
  throw new Error('no step');
}

describe('Willy: the tutorial', () => {
  it('the first won fight turns the clock on, even when another step fires in the same command', () => {
    const s = onFloor1();
    expect(clockOf(s)!.hidden).toBe(true);
    expect(tutorialUnlocked(s, 'sistema.reloj')).toBe(false);
    // The winning blow: the fight ends and «Primera victoria» unlocks at once (t10 comes before t15 in the file).
    const won: GameEvent[] = [{ type: 'achievementUnlocked', logro: 'primera-victoria' } as GameEvent, { type: 'combatEnded', winner: s.entities.willy!.factionId } as GameEvent];
    const t = tutorialAfterCommand(willy, s, won, new RngCursor(s.rng));
    const after = engine.applyEffects(s, t.effects).state;
    expect(after.flags[tutorialFlag('t10-logro')]).toBe(true);
    expect(after.flags[tutorialFlag('t15-reloj')]).toBe(true);
    expect(tutorialUnlocked(after, 'sistema.reloj')).toBe(true);
    // One card now; the other waits for the next command.
    expect(t.events.filter((e) => e.type === 'tutorialStep')).toHaveLength(1);
    // The others come out one per command, t15 among them.
    const shown: string[] = [];
    let cur = after;
    for (let i = 0; i < 4; i++) {
      const n = tutorialAfterCommand(willy, cur, [], new RngCursor(cur.rng));
      for (const e of n.events) if (e.type === 'tutorialStep') shown.push(String((e as unknown as { id: string }).id));
      cur = engine.applyEffects(cur, n.effects).state;
    }
    expect(shown).toContain('t15-reloj');
    // And the clock shows in the winning command itself.
    const c = clockAfterCommand(willy, s, won, new RngCursor(s.rng));
    expect((c.effects.find((e) => e.type === 'setSystem') as unknown as { value: { hidden?: boolean } }).value.hidden).toBe(false);
  });

  it('the tide and the belts get a card the first time they matter, and cards wait out a collapse', () => {
    const f = onFloor1();
    // Past the chained opening cards: nothing else waiting.
    const s = { ...f, flags: { ...f.flags, 'tutorial:ultimo': '', 'tutorial:cola': '' } };
    const tide = tutorialAfterCommand(willy, s, [{ type: 'mareaAviso', zone: 'marea-3' } as GameEvent], new RngCursor(s.rng));
    expect(tide.events).toContainEqual(expect.objectContaining({ type: 'tutorialStep', id: 't28-marea' }));
    const belt = tutorialAfterCommand(willy, s, [{ type: 'cinta', entityId: 'willy' } as GameEvent], new RngCursor(s.rng));
    expect(belt.events).toContainEqual(expect.objectContaining({ type: 'tutorialStep', id: 't29-cintas' }));
    // A room falling: the step is done, but its card waits.
    const busy = tutorialAfterCommand(willy, s, [{ type: 'cinta', entityId: 'willy' } as GameEvent, { type: 'roomCollapsing', fase: 'caida' } as GameEvent], new RngCursor(s.rng));
    expect(busy.events.filter((e) => e.type === 'tutorialStep')).toHaveLength(0);
    const later = engine.applyEffects(s, busy.effects).state;
    expect(tutorialAfterCommand(willy, later, [], new RngCursor(later.rng)).events).toContainEqual(expect.objectContaining({ type: 'tutorialStep', id: 't29-cintas' }));
  });

  it('an achievement in the first Camerino does not jump ahead of the first card', () => {
    const s = newWillyGame(engine, 3);
    const t = tutorialAfterCommand(willy, s, [{ type: 'achievementUnlocked', logro: 'x' } as GameEvent], new RngCursor(s.rng));
    expect(t.events.filter((e) => e.type === 'tutorialStep')).toHaveLength(0);
  });
});
