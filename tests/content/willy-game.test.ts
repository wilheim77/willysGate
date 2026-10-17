import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameState, SYSTEM_ISSUER, createEngine, nextAiCommand, surfaceAt, zonesOf } from '../../engine';
import { willy } from '../../rulesets/willy';
import { applyCasting, maps, newWillyGame } from '../../content/willy/setup';
import ninja from '../../content/willy/assets/ninja.json';

const engine = createEngine(willy, 'willy', { dialogues: {}, maps });

describe('Willy: first playable', () => {
  it('starts in the Camerino with Willy and the four regulars', () => {
    const s = newWillyGame(engine, 1);
    expect(s.map.id).toBe('camerino');
    expect(s.entities.willy).toMatchObject({ controllerId: 'player:1', spriteId: 'willy-butanero' });
    expect(['maripuri', 'paco', 'xelda', 'koldo'].every((id) => s.entities[id])).toBe(true);
    expect(zonesOf(s, 'exits')).toHaveLength(1);
  });

  it('the casting rebuilds Willy with the chosen class', () => {
    const s = newWillyGame(engine, 1);
    const after = applyCasting(s, { clase: 'funcionario', puntos: { man: 2, agu: 1 } });
    expect(after.entities.willy!.tags).toContain('clase:funcionario');
    expect(after.entities.willy!.spriteId).toBe('willy-funcionario');
    expect(after.entities.willy!.position).toEqual(s.entities.willy!.position);
  });

  it('the service lift takes Willy down to floor 1, and back', () => {
    let s = newWillyGame(engine, 1);
    const lift = zonesOf(s, 'exits')[0]!;
    s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, position: { x: lift.x, y: lift.y } } } };
    const down = engine.apply(s, { type: 'travel', issuer: 'player:1', entityId: 'willy', mapId: 'planta-1', spawn: 'llegada' } as BaseCommand);
    if (!down.ok) throw new Error(down.error.message);
    expect(down.state.map.id).toBe('planta-1');
    expect(down.state.entities.maripuri).toBeUndefined();
    expect(down.state.entities['rata-1']).toBeDefined();
    expect(surfaceAt(down.state, { x: 6, y: 1 })?.type).toBe('agua');
    const back = engine.apply({ ...down.state, entities: { ...down.state.entities, willy: { ...down.state.entities.willy!, position: { x: 1, y: 1 } } } }, { type: 'travel', issuer: 'player:1', entityId: 'willy', mapId: 'camerino', spawn: 'llegada' } as BaseCommand);
    if (!back.ok) throw new Error(back.error.message);
    expect(back.state.entities.maripuri).toBeDefined();
  });

  it('every terrain on the maps has art in the ninja preset (void is drawn as nothing)', () => {
    for (const build of Object.values(maps)) {
      for (const t of build().map.tiles) if (t.terrain !== 'void') expect((ninja.terrain as Record<string, unknown>)[t.terrain], t.terrain).toBeDefined();
    }
  });

  it('the first fight on floor 1 can be played out to the end by the AI on both sides', () => {
    let s = newWillyGame(engine, 7);
    const lift = zonesOf(s, 'exits')[0]!;
    s = { ...s, entities: { ...s.entities, willy: { ...s.entities.willy!, position: { x: lift.x, y: lift.y } } } };
    const down = engine.apply(s, { type: 'travel', issuer: 'player:1', entityId: 'willy', mapId: 'planta-1', spawn: 'llegada' } as BaseCommand);
    if (!down.ok) throw new Error(down.error.message);
    const foes = zonesOf(down.state, 'encounters')[0]!.properties.participants!.toString().split(',');
    const started = engine.apply(down.state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['willy', ...foes] } as BaseCommand);
    if (!started.ok) throw new Error(started.error.message);
    let st: GameState = started.state;
    for (let i = 0; i < 400 && st.turn.mode === 'combat'; i++) {
      const id = st.turn.activeEntityId!;
      const cmd = nextAiCommand(willy, st, id);
      const r = engine.apply(st, cmd);
      if (r.ok) st = r.state;
      else {
        const skip = engine.apply(st, { type: 'endTurn', issuer: SYSTEM_ISSUER, entityId: id } as BaseCommand);
        if (skip.ok) st = skip.state;
      }
    }
    expect(st.turn.mode).toBe('exploration');
  });
});
