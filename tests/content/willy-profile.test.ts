import { describe, expect, it } from 'vitest';
import { type BaseCommand, type GameEvent, type GameState, createEngine, zonesOf } from '../../engine';
import { metaOf, profileOf, willy } from '../../rulesets/willy';
import { applyCasting, maps, newWillyGame } from '../../content/willy/setup';
import { RECENT_RIVALS, emptyProfile, injectProfile, normalizeProfile, profileBadge, profileScreen, updateProfile } from '../../content/willy/profile';
import { generateFloor } from '../../content/willy/gen/floor';

const engine = createEngine(willy, 'willy', { dialogues: {}, maps });

function apply(s: GameState, cmd: object): { state: GameState; events: GameEvent[] } {
  const r = engine.apply(s, cmd as BaseCommand);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return { state: r.state, events: r.events };
}

/** A season started with `profile`, after the casting and its first step. */
function season(profile: object, flags: Record<string, string> = {}): { state: GameState; events: GameEvent[] } {
  let s = injectProfile(newWillyGame(engine, 3), profile);
  s = applyCasting({ ...s, flags: { ...s.flags, ...flags } }, { clase: 'butanero', puntos: { fue: 3 } });
  const w = s.entities.willy!;
  return apply(s, { type: 'move', issuer: 'player:1', entityId: 'willy', to: { x: w.position.x, y: w.position.y + 1 } });
}

const unlocked = (events: GameEvent[]) => events.filter((e) => e.type === 'achievementUnlocked') as unknown as { logroId: string; repetido: boolean; cajas: string[] }[];

describe('Willy: the browser profile', () => {
  it('a fresh profile: the first season unlocks «En antena» with its box, and the profile remembers it', () => {
    const first = season({});
    const a = unlocked(first.events).find((e) => e.logroId === 'en-antena')!;
    expect(a.repetido).toBe(false);
    expect(metaOf(first.state).cajas.length).toBeGreaterThan(0);
    const p = updateProfile({}, first.events, first.state, '2026-10-23');
    expect(p.logros).toContain('en-antena');
    expect(p.temporadas.jugadas).toBe(1);
    expect(p.clasesJugadas).toEqual(['butanero']);
  });

  it('an achievement from an earlier season is celebrated again, without its box', () => {
    const p = updateProfile({}, season({}).events, season({}).state, '2026-10-23');
    const second = season(p);
    const a = unlocked(second.events).find((e) => e.logroId === 'en-antena')!;
    expect(a.repetido).toBe(true);
    expect(a.cajas).toEqual([]);
    expect(metaOf(second.state).cajas).toEqual([]);
  });

  it('«siempre» counters carry on from the profile', () => {
    const s = injectProfile(newWillyGame(engine, 3), { contadores: { 'plantilla-reducida#0': 49 } });
    expect(profileOf(s).contadores['plantilla-reducida#0']).toBe(49);
    // The profile keeps the highest count the run reached.
    const run = { ...s, systems: { ...s.systems, willyMeta: { ...metaOf(s), cont: { 'plantilla-reducida#0': { k: 'run', n: 50 }, 'productividad#0': { k: 't1', n: 3 } } } as never } };
    const p = updateProfile({ contadores: { 'plantilla-reducida#0': 49 } }, [], run, '2026-10-23');
    expect(p.contadores['plantilla-reducida#0']).toBe(50);
    // A per-turn counter is not lifetime.
    expect(p.contadores['productividad#0']).toBeUndefined();
  });

  it('a win without repetition earns the «en directo» mark; best marks and falls are kept', () => {
    const s = season({}, { modoEliminacion: 'sinRepeticion' }).state;
    const won = updateProfile({}, [{ type: 'runEnded', resultado: 'victoria', final: 'B', modoEliminacion: 'sinRepeticion' } as GameEvent], s, '2026-10-23');
    expect(won.enDirecto).toEqual([{ final: 'B', clase: 'butanero', nivel: 1, fecha: '2026-10-23' }]);
    expect(won.temporadas.ganadas).toBe(1);
    expect(won.clasesConVictoria).toEqual(['butanero']);
    expect(profileBadge(won)).toBe('🔴 EN DIRECTO');
    expect(profileBadge(emptyProfile())).toBeNull();
    // Con repetición wins don't get the mark.
    const easy = updateProfile({}, [{ type: 'runEnded', resultado: 'victoria', final: 'A', modoEliminacion: 'repeticion' } as GameEvent], season({}).state, '2026-10-23');
    expect(easy.enDirecto).toEqual([]);
    const fell = updateProfile(won, [{ type: 'runEnded', resultado: 'eliminado' } as GameEvent], s, '2026-10-24');
    expect(fell.temporadas.caidas).toBe(1);
    expect(profileScreen(fell).sections.map((x) => x.title)).toEqual(['🔴 En directo', 'Temporadas', 'Récords', 'Colección']);
  });

  it('remembers the last 40 rivals, and new rivals avoid them', () => {
    let p = emptyProfile();
    for (let i = 0; i < 45; i++) p = updateProfile(p, [{ type: 'rivalEncountered', rival: `r${i}`, rivalNombre: `N${i}`, rivalApellido: 'X', rivalApodo: `el ${i}`, rivalRazaId: 'gnomo' } as GameEvent], season({}).state, 'd');
    expect(p.rivalesRecientes.length).toBe(RECENT_RIVALS);
    expect(p.rivalesRecientes[0]!.id).toBe('r5');
    expect(p.rivalesVistos).toBe(45);
    expect(p.razasRivales).toEqual(['gnomo']);
    // A floor with a rival: with that rival's name in the profile, the generator picks another.
    for (let seed = 1; seed < 400; seed++) {
      for (const n of [3, 5, 7]) {
        const a = generateFloor(seed, n);
        const tag = (k: string) => a.setup.entities.find((e) => e.tags.includes('rival'))?.tags.find((t) => t.startsWith(`${k}:`))?.split(':')[1];
        if (!a.rival || a.rival.legendario || !tag('rnombre')) continue;
        const name = `nombre:${tag('rnombre')} ${tag('rapellido')}`;
        const b = generateFloor(seed, n, { recentRivals: [name] });
        const tagB = (k: string) => b.setup.entities.find((e) => e.tags.includes('rival'))?.tags.find((t) => t.startsWith(`${k}:`))?.split(':')[1];
        expect(`nombre:${tagB('rnombre')} ${tagB('rapellido')}`).not.toBe(name);
        return;
      }
    }
    throw new Error('no floor with a generated rival found');
  });

  it('normalizes damaged profiles', () => {
    expect(normalizeProfile('nope')).toEqual(emptyProfile());
    expect(normalizeProfile({ logros: 'x', records: { mejorPlanta: 4 } }).records.mejorPlanta).toBe(4);
    void zonesOf;
  });
});
