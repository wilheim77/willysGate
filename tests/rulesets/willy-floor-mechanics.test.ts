import { describe, expect, it } from 'vitest';
import { type GameState, type MapZone, RngCursor, applyOutcome, hasCondition, surfaceAt, withZones } from '../../engine';
import { willy } from '../../rulesets/willy';
import { W, game, rat } from './willy-helpers';

const z = (name: string, layer: string, x: number, y: number, width: number, height: number, properties: MapZone['properties']): MapZone => ({ name, layer, x, y, width, height, properties });

function roundEnd(s: GameState, round: number) {
  const rng = new RngCursor(s.rng);
  return applyOutcome(willy, s, willy.onRoundEnd!(s, round, rng), rng);
}

describe('Willy: floor mechanics at round end', () => {
  it('a conveyor belt carries a queue of riders one tile, into the pit at the end', () => {
    const belt = [1, 2, 3].map((x) => z(`c${x}`, 'cintas', x, 0, 1, 1, { dx: 1, dy: 0 }));
    const s = withZones(game([W('w', 'butanero', 2, 0), rat('a', 3, 0), rat('b', 1, 0)], ['.....~']), belt);
    const r = roundEnd(s, 1);
    expect(r.state.entities.a!.position.x).toBe(4);
    expect(r.state.entities.w!.position.x).toBe(3);
    expect(r.state.entities.b!.position.x).toBe(2);
    // One more round: the rat at the end goes into the void.
    const again = roundEnd(withZones(r.state, [...belt, z('c4', 'cintas', 4, 0, 1, 1, { dx: 1, dy: 0 })]), 2);
    expect(again.state.entities.a === undefined || again.state.entities.a.position.x !== 4).toBe(true);
  });

  it('the tide bubbles, then floods the low tiles, soaks and drags whoever is there', () => {
    const tide = [z('marea', 'marea', 0, 0, 4, 2, { ciclo: 3, altura: 0, arrastre: 1 })];
    const s = withZones(game([W('w', 'butanero', 0, 0), rat('r', 3, 0)], ['...1', '....', '....']), tide);
    const warn = roundEnd(s, 2);
    expect(warn.events.some((e) => e.type === 'mareaAviso')).toBe(true);
    expect(surfaceAt(warn.state, { x: 0, y: 0 })).toBeUndefined();
    const high = roundEnd(s, 3);
    expect(surfaceAt(high.state, { x: 1, y: 0 })?.type).toBe('agua');
    expect(hasCondition(high.state.entities.w!, 'empapado')).toBe(true);
    expect(high.state.entities.w!.position).toEqual({ x: 0, y: 1 });
    // The rat stands on the raised tile: dry and where it was.
    expect(high.state.entities.r!.position).toEqual({ x: 3, y: 0 });
    expect(surfaceAt(high.state, { x: 3, y: 0 })).toBeUndefined();
  });
});
