import { type ActionOutcome, type GameState, type RngCursor, type Ruleset, type SurfaceDef, type SurfaceReaction, type Trap, OBJECT_TAG, hasCondition, hasTag, tileAt, zonesOf } from '../../engine';
import { attr, hasTrait } from './character';
import { parseDice, rollDice } from './dice';
import { Resolver, type WillyEvent, dealDamage, fallDamage, rollSave, standing } from './resolve';

/**
 * Willy's surfaces (RULESET.md → «Superficies») as engine data, and what they do to whoever
 * steps in or starts a turn on them. Elements: fuego, agua, frio, rayo.
 */
export const SURFACES: Record<string, SurfaceDef> = {
  agua: { label: 'Agua', color: '#2c6a8e' },
  aceite: { label: 'Aceite', hazard: 0.5, color: '#4a3c1c' },
  fuego: { label: 'Fuego', hazard: 4, durationRounds: 3, light: { radius: 3, intensity: 0.9, color: '#ff8a30' }, color: '#e2601e' },
  hielo: { label: 'Hielo', hazard: 1, color: '#bfe4f0' },
  vapor: { label: 'Vapor', durationRounds: 2, color: '#d8dde0', blocksSight: true },
  toxico: { label: 'Tóxico', hazard: 2, durationRounds: 4, color: '#7ab03a' },
  electrificada: { label: 'Agua electrificada', hazard: 4, durationRounds: 1, expiresInto: 'agua', light: { radius: 2, intensity: 0.5, color: '#9fd8ff' }, color: '#5ab0e0' },
  canicas: { label: 'Canicas', hazard: 1, color: '#c0a0ff' },
  red: { label: 'Red', hazard: 1, color: '#8a7a5a' },
  expedientes: { label: 'Expedientes', hazard: 1, durationRounds: 3, color: '#efe8d0' },
  gas: { label: 'Gas', hazard: 1, durationRounds: 3, color: '#c8d870' },
};

export const SURFACE_REACTIONS: SurfaceReaction[] = [
  { surface: '', element: 'fuego', result: 'fuego' },
  { surface: 'fuego', element: 'fuego', result: 'fuego' },
  { surface: 'aceite', element: 'fuego', result: 'fuego', spreads: true },
  { surface: 'expedientes', element: 'fuego', result: 'fuego', spreads: true },
  { surface: 'gas', element: 'fuego', result: 'fuego', spreads: true },
  { surface: 'red', element: 'fuego', result: null },
  { surface: 'toxico', element: 'fuego', result: 'fuego' },
  { surface: 'agua', element: 'fuego', result: 'vapor' },
  { surface: 'hielo', element: 'fuego', result: 'agua' },
  { surface: 'fuego', element: 'agua', result: 'vapor' },
  { surface: 'expedientes', element: 'agua', result: null },
  { surface: '', element: 'agua', result: 'agua' },
  { surface: 'agua', element: 'frio', result: 'hielo', spreads: true },
  { surface: 'fuego', element: 'frio', result: null },
  { surface: 'vapor', element: 'frio', result: 'agua' },
  { surface: 'agua', element: 'rayo', result: 'electrificada', spreads: true },
];

/** What a surface does to a creature. Slipping happens only when stepping in. */
export function onSurface(ruleset: Ruleset, state: GameState, id: string, surface: string, trigger: 'enter' | 'turnStart', rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id];
  if (!e || !standing(e)) return r.outcome();
  if (e.tags.includes(OBJECT_TAG)) {
    if (surface === 'fuego' && trigger === 'turnStart') dealDamage(r, id, rollDice(rng, { count: 1, sides: 6, bonus: 0 }), 'fuego', undefined, 'superficie');
    return r.outcome();
  }
  const cond = (condition: string, turns?: number) => {
    if (hasTag(e, `inmune:${condition}`)) return;
    r.apply({ type: 'applyCondition', entityId: id, condition, ...(turns !== undefined ? { remainingTurns: turns } : {}) });
  };
  switch (surface) {
    case 'agua':
      if (hasCondition(e, 'ardiendo')) r.apply({ type: 'removeCondition', entityId: id, condition: 'ardiendo' });
      if (!hasTrait(e, 'pez')) cond('empapado', 2);
      break;
    case 'fuego':
      if (!hasCondition(e, 'empapado')) cond('ardiendo', 2);
      dealDamage(r, id, rollDice(rng, { count: 1, sides: 4, bonus: 0 }), 'fuego', undefined, 'superficie');
      break;
    case 'electrificada':
      dealDamage(r, id, rollDice(rng, { count: 1, sides: 6, bonus: 0 }), 'rayo', undefined, 'superficie');
      if (standing(r.entity(id))) cond('electrocutado', 1);
      break;
    case 'toxico':
      if (!hasTag(e, 'inmune:envenenado') && !hasTrait(e, 'guantes')) cond('envenenado', 3);
      break;
    case 'red':
    case 'expedientes':
      // Lasts 2 turns, renewed while you stay in it; «Liberarse» (FUE DIF 13) gets you out earlier.
      if (trigger === 'enter' || surface === 'expedientes') cond('enredado', 2);
      break;
    case 'aceite':
    case 'canicas':
    case 'hielo':
      if (trigger === 'enter' && !hasTag(e, 'inmune:tumbado') && !rollSave(r, id, 'agi', 13)) {
        cond('tumbado', 1);
        r.emit({ type: 'slipped', entityId: id, surface } as never);
      }
      break;
  }
  return r.outcome();
}

export function onFall(ruleset: Ruleset, state: GameState, id: string, levels: number, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  if (state.entities[id]) fallDamage(r, id, levels);
  return r.outcome();
}

// --- Traps -----------------------------------------------------------------------------------

/** Spotting a hidden trap nearby: passive, no dice. 8 + SUE against the trap's `detect`. */
export function noticeTrap(state: GameState, id: string, trap: Trap): boolean {
  const e = state.entities[id];
  if (!e) return false;
  return 8 + attr(e, 'sue') >= Number(trap.params.detect ?? 12);
}

/** What a trap's `efecto` does beyond damage. Surfaces land on the trap's tile. */
const TRAP_ELEMENT: Record<string, string> = { fuego: 'fuego', electrificada: 'rayo', hielo: 'frio' };

/**
 * Stepping on one: save with AGI against its DIF. Success halves the damage and avoids the effect.
 * Params: { dano: '1d6', dif: 12, efecto? }. The effect is a condition (enredado for 2 turns,
 * tumbado...), a surface on the tile (fuego, hielo, electrificada...), 'empuje' (thrown 2 tiles
 * in a random direction) or 'caida' (a trapdoor: a two-level fall).
 */
export function triggerTrap(ruleset: Ruleset, state: GameState, id: string, trap: Trap, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id];
  if (!e || !standing(e)) return r.outcome();
  const saved = rollSave(r, id, 'agi', Number(trap.params.dif ?? 12));
  const effect = trap.params.efecto ? String(trap.params.efecto) : undefined;
  const raw = rollDice(rng, parseDice(String(trap.params.dano ?? '1d4')));
  dealDamage(r, id, saved ? Math.floor(raw / 2) : raw, (effect && TRAP_ELEMENT[effect]) ?? 'fisico', undefined, 'trampa');
  if (saved || !effect || !standing(r.entity(id))) return r.outcome();
  if (SURFACES[effect]) r.apply({ type: 'spawnSurface', tiles: [{ ...e.position }], surface: effect });
  else if (effect === 'empuje') {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    const [dx, dy] = dirs[rng.die(4) - 1]!;
    r.apply({ type: 'push', entityId: id, dx, dy, distance: 2 });
  } else if (effect === 'caida') fallDamage(r, id, 2);
  else if (!hasTag(e, `inmune:${effect}`)) r.apply({ type: 'applyCondition', entityId: id, condition: effect, ...(effect === 'enredado' ? { remainingTurns: 2 } : {}) });
  return r.outcome();
}

// --- Floor mechanics at the end of each round ---------------------------------------------------------

/**
 * Conveyor belts and tides, from the map's zones (the floor generator writes them):
 * - layer 'cintas', 1×1, properties { dx, dy }: whoever stands on it is carried 1 tile, into
 *   pits and fire too (a push, so walls and other creatures stop it and «¡Strike!» applies).
 * - layer 'marea', properties { ciclo, altura, arrastre }: every `ciclo` rounds the tide comes in
 *   over the tiles at `altura` or below, soaking and dragging everyone there `arrastre` tiles
 *   south; the round before, it bubbles (event mareaAviso).
 */
export function onRoundEnd(ruleset: Ruleset, state: GameState, round: number, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const standingOn = (x: number, y: number) => Object.values(r.state.entities).filter((e) => e.position.x === x && e.position.y === y && standing(e) && !e.tags.includes(OBJECT_TAG) && !hasTag(e, 'jefe'));

  const belts = zonesOf(state, 'cintas');
  if (belts.length) {
    // Furthest along first, so a queue on the belt moves together instead of bumping.
    const riders = belts
      .flatMap((z) => standingOn(z.x, z.y).map((e) => ({ e, dx: Number(z.properties.dx ?? 1), dy: Number(z.properties.dy ?? 0) })))
      .sort((a, b) => b.e.position.x * b.dx + b.e.position.y * b.dy - (a.e.position.x * a.dx + a.e.position.y * a.dy));
    for (const { e, dx, dy } of riders) {
      if (!r.state.entities[e.id] || !standing(r.entity(e.id))) continue;
      r.apply({ type: 'push', entityId: e.id, dx, dy, distance: 1 });
      r.emit({ type: 'cinta', entityId: e.id } as WillyEvent);
    }
  }

  for (const z of zonesOf(state, 'marea')) {
    const cycle = Math.max(2, Number(z.properties.ciclo ?? 3));
    const level = Number(z.properties.altura ?? 0);
    const phase = round % cycle;
    if (phase === cycle - 1) r.emit({ type: 'mareaAviso', zone: z.name } as WillyEvent);
    if (phase !== 0) continue;
    const tiles: { x: number; y: number }[] = [];
    for (let y = z.y; y < z.y + z.height; y++) for (let x = z.x; x < z.x + z.width; x++) {
      const t = tileAt(r.state.map, { x, y });
      if (t?.walkable && t.height <= level) tiles.push({ x, y });
    }
    if (!tiles.length) continue;
    r.apply({ type: 'spawnSurface', tiles, surface: 'agua', turns: 2 });
    r.emit({ type: 'marea', zone: z.name, tiles: tiles.length } as WillyEvent);
    const drag = Number(z.properties.arrastre ?? 1);
    // Who was there when the water came in (dragged once, not again from the tile they land on).
    const caught = tiles.flatMap((p) => standingOn(p.x, p.y));
    for (const e of caught) {
      if (!hasTrait(e, 'pez') && !hasTag(e, 'inmune:empapado')) r.apply({ type: 'applyCondition', entityId: e.id, condition: 'empapado', remainingTurns: 2 });
      if (drag > 0) r.apply({ type: 'push', entityId: e.id, dx: 0, dy: 1, distance: drag });
    }
  }
  return r.outcome();
}
