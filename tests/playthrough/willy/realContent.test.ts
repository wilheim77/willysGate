import { describe, expect, it } from 'vitest';
import {
  SYSTEM_ISSUER,
  createEngine,
  nextAiCommand,
  occupies,
  worldOf,
  zonesOf,
  type BaseCommand,
  type GameState,
} from '../../../engine';
import { willy } from '../../../rulesets/willy';
import { applyCasting, maps, newWillyGame } from '../../../content/willy/setup';
import { CLASS_IDS } from './setup';

/**
 * The REAL "Willy el mazmorrero" content (content/willy/setup.ts + maps.ts: the Camerino
 * and floor 1, "Castro Sumergido"), as opposed to tests/playthrough/willy/setup.ts's
 * synthetic arenas (which exist to drive every class through every action generically -
 * still valuable, kept separately). This file is the equivalent of the Intereses
 * actTravel/combatSoak-on-real-maps pass: casting into each class, travelling the one real
 * exit (the service lift) back and forth, and soaking the one real encounter with the AI.
 */

const engine = createEngine(willy, 'willy-qa-real', { dialogues: {}, maps });

const DEEP = process.env.QA_DEEP === '1';
const CLASSES_TO_TRY = DEEP ? CLASS_IDS : [CLASS_IDS[0]!];
const SEEDS = DEEP ? [1, 2, 3, 4, 5] : [1];
const MAX_ROUNDS = 60;
const MAX_COMMANDS = 1500;

function liftOf(state: GameState) {
  return zonesOf(state, 'exits')[0]!;
}

function standOn(state: GameState, id: string, p: { x: number; y: number }): GameState {
  return { ...state, entities: { ...state.entities, [id]: { ...state.entities[id]!, position: p } } };
}

describe('Willy real content: casting, the service lift, and the floor-1 encounter', () => {
  for (const classId of CLASSES_TO_TRY) {
    it(`casting into "${classId}" then riding the lift down and back works`, () => {
      let state = newWillyGame(engine, 1);
      state = applyCasting(state, { clase: classId, puntos: {} });
      expect(state.entities.willy!.tags, `casting into ${classId} failed`).toContain(`clase:${classId}`);

      const lift = liftOf(state);
      state = standOn(state, 'willy', { x: lift.x, y: lift.y });
      const down = engine.apply(state, { type: 'travel', issuer: 'player:1', entityId: 'willy', mapId: 'planta-1', spawn: 'llegada' } as BaseCommand & {
        entityId: string;
        mapId: string;
        spawn: string;
      });
      expect(down.ok, down.ok ? '' : `travel down failed: ${JSON.stringify((down as { error: unknown }).error)}`).toBe(true);
      if (!down.ok) return;
      expect(down.state.map.id).toBe('planta-1');
      expect(worldOf(down.state).stashed.camerino, 'camerino should be stashed').toBeDefined();

      const reloaded = engine.deserialize(engine.serialize(down.state));
      expect(JSON.stringify(reloaded), 'save/load after travelling down changed the state').toBe(JSON.stringify(down.state));

      const upExit = zonesOf(down.state, 'exits').find((z) => z.properties.to === 'camerino')!;
      const standing = standOn(down.state, 'willy', { x: upExit.x, y: upExit.y });
      const up = engine.apply(standing, { type: 'travel', issuer: 'player:1', entityId: 'willy', mapId: 'camerino', spawn: String(upExit.properties.spawn) } as BaseCommand & {
        entityId: string;
        mapId: string;
        spawn: string;
      });
      expect(up.ok, up.ok ? '' : `travel back up failed: ${JSON.stringify((up as { error: unknown }).error)}`).toBe(true);
      if (!up.ok) return;
      expect(up.state.map.id).toBe('camerino');
      expect(up.state.entities.maripuri, 'the Camerino regulars should be back').toBeDefined();
    });
  }

  for (const seed of SEEDS) {
    it(`the floor-1 encounter, soaked with the AI on both sides (seed ${seed})`, () => {
      let state = newWillyGame(engine, seed);
      const lift = liftOf(state);
      state = standOn(state, 'willy', { x: lift.x, y: lift.y });
      const down = engine.apply(state, { type: 'travel', issuer: 'player:1', entityId: 'willy', mapId: 'planta-1', spawn: 'llegada' } as BaseCommand & {
        entityId: string;
        mapId: string;
        spawn: string;
      });
      expect(down.ok).toBe(true);
      if (!down.ok) return;

      const foes = String(zonesOf(down.state, 'encounters')[0]!.properties.participants).split(',');
      const started = engine.apply(down.state, { type: 'startCombat', issuer: SYSTEM_ISSUER, participants: ['willy', ...foes] } as BaseCommand & { participants: string[] });
      expect(started.ok).toBe(true);
      if (!started.ok) return;

      let s = started.state;
      let guard = 0;
      while (s.turn.mode === 'combat') {
        guard++;
        const repro = `seed=${seed} round=${s.turn.round} commandsSoFar=${guard}`;
        expect(guard, `${repro}: exceeded ${MAX_COMMANDS} commands`).toBeLessThanOrEqual(MAX_COMMANDS);
        expect(s.turn.round, `${repro}: exceeded ${MAX_ROUNDS} rounds`).toBeLessThanOrEqual(MAX_ROUNDS);
        const activeId = s.turn.activeEntityId!;
        let cmd: BaseCommand;
        expect(() => (cmd = nextAiCommand(willy, s, activeId)), `${repro}: nextAiCommand threw`).not.toThrow();
        let r: ReturnType<typeof engine.apply>;
        expect(() => (r = engine.apply(s, cmd!)), `${repro}: AI command threw`).not.toThrow();
        expect(r!.ok, r!.ok ? '' : `${repro}: AI command failed: ${JSON.stringify((r! as { error: unknown }).error)}`).toBe(true);
        if (!r!.ok) break;
        s = r!.state;

        const standing = Object.values(s.entities).filter((e) => occupies(willy, e));
        const seen = new Map<string, string>();
        for (const e of standing) {
          const key = `${e.position.x},${e.position.y}`;
          expect(seen.has(key), `${repro}: ${e.id} and ${seen.get(key)} both occupy ${key}`).toBe(false);
          seen.set(key, e.id);
        }
        for (const e of Object.values(s.entities)) {
          for (const [resource, pool] of Object.entries(e.resources)) {
            expect(pool.current, `${repro}: ${e.id}.${resource} went negative`).toBeGreaterThanOrEqual(0);
          }
        }
      }
      expect(s.turn.mode, `seed=${seed}: the floor-1 fight never ended`).toBe('exploration');
    });
  }
});
