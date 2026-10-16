import { describe, expect, it } from 'vitest';
import { RngCursor, seedRng } from '../../engine';
import { d20Check, resolveRollMode, rollD20 } from '../../rulesets/common/d20';

describe('d20', () => {
  it('normal roll uses one die', () => {
    const roll = rollD20(new RngCursor(seedRng(5)));
    expect(roll.rolls).toHaveLength(1);
    expect(roll.kept).toEqual(roll.rolls);
    expect(roll.note).toBeUndefined();
  });

  it('advantage keeps the higher of two dice', () => {
    const rng = new RngCursor(seedRng(6));
    for (let i = 0; i < 200; i++) {
      const roll = rollD20(rng, 'advantage');
      expect(roll.rolls).toHaveLength(2);
      expect(roll.kept).toEqual([Math.max(...roll.rolls)]);
      expect(roll.note).toBe('ventaja');
    }
  });

  it('disadvantage keeps the lower of two dice', () => {
    const rng = new RngCursor(seedRng(7));
    for (let i = 0; i < 200; i++) {
      const roll = rollD20(rng, 'disadvantage');
      expect(roll.kept).toEqual([Math.min(...roll.rolls)]);
    }
  });

  it('advantage raises the average and disadvantage lowers it', () => {
    const avg = (mode: 'advantage' | 'disadvantage') => {
      const rng = new RngCursor(seedRng(8));
      let sum = 0;
      for (let i = 0; i < 5000; i++) sum += rollD20(rng, mode).kept[0]!;
      return sum / 5000;
    };
    expect(avg('advantage')).toBeGreaterThan(13); // theoretical 13.82
    expect(avg('disadvantage')).toBeLessThan(8); // theoretical 7.18
  });

  it('advantage and disadvantage cancel out', () => {
    expect(resolveRollMode(true, true)).toBe('normal');
    expect(resolveRollMode(false, false)).toBe('normal');
    expect(resolveRollMode(true, false)).toBe('advantage');
    expect(resolveRollMode(false, true)).toBe('disadvantage');
  });

  it('d20Check totals modifiers, meets-or-beats the target and drops zero modifiers', () => {
    const rng = new RngCursor(seedRng(10));
    for (let i = 0; i < 100; i++) {
      const r = d20Check(rng, {
        check: 'persuasion',
        label: 'Persuasión',
        mode: 'normal',
        modifiers: [{ label: 'Carisma', value: 3 }, { label: 'Nada', value: 0 }],
        target: 14,
      });
      expect(r.modifiers).toEqual([{ label: 'Carisma', value: 3 }]);
      expect(r.total).toBe(r.dice[0]!.kept[0]! + 3);
      expect(r.success).toBe(r.total >= 14);
      expect(r.targetLabel).toBe('CD');
      if (r.dice[0]!.kept[0] === 20) expect(r.outcome).toBe('natural_20');
      if (r.dice[0]!.kept[0] === 1) expect(r.outcome).toBe('natural_1');
    }
  });
});
