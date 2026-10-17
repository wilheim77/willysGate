import {
  type ActionOutcome,
  type Entity,
  type GameState,
  type RngCursor,
  type Ruleset,
  type SurfaceDef,
  type SurfaceReaction,
  type Vec2,
  OBJECT_TAG,
  OBSTACLE_TAG,
  gridDistance,
} from '../../engine';
import { rollDice, sum } from './dice';
import { Resolver, dealDamage, destructionHooks, rollSave, standing } from './resolve';

/**
 * The tactical environment under 5e rules: what surfaces do to creatures, falling
 * damage, cover, and exploding barrels. The engine stores and transforms the
 * surfaces (as data below); this file decides the consequences.
 */

export const SURFACES: Record<string, SurfaceDef> = {
  oil: { label: 'Aceite', hazard: 0.5, color: '#2a2418' },
  grease: { label: 'Grasa', hazard: 1, color: '#6b5a3a' },
  fire: { label: 'Fuego', hazard: 4, durationRounds: 3, light: { radius: 3, intensity: 0.9, color: '#ff8a30' }, color: '#d2501e' },
  water: { label: 'Agua', color: '#2c4a5e' },
  ice: { label: 'Hielo', hazard: 1, color: '#9fc8d8' },
  electrified: { label: 'Agua electrificada', hazard: 4, durationRounds: 2, expiresInto: 'water', light: { radius: 2, intensity: 0.5, color: '#9fd8ff' }, color: '#5ab0e0' },
  blood: { label: 'Sangre', color: '#5a0f0a' },
  rubble: { label: 'Escombros', extraMoveCost: 1, color: '#5a5048' },
};

/** Element hitting a surface (or a bare tile, ''): what it becomes, or null to remove it. */
export const SURFACE_REACTIONS: SurfaceReaction[] = [
  { surface: 'oil', element: 'fire', result: 'fire', spreads: true },
  { surface: 'grease', element: 'fire', result: 'fire', spreads: true },
  { surface: 'water', element: 'fire', result: null },
  { surface: 'ice', element: 'fire', result: 'water' },
  { surface: 'fire', element: 'water', result: null },
  { surface: 'fire', element: 'cold', result: null },
  { surface: 'blood', element: 'fire', result: null },
  { surface: 'water', element: 'cold', result: 'ice' },
  { surface: 'blood', element: 'cold', result: 'ice' },
  { surface: 'water', element: 'lightning', result: 'electrified', spreads: true },
  { surface: 'blood', element: 'lightning', result: 'electrified', spreads: true },
  { surface: '', element: 'water', result: 'water' },
  { surface: 'fire', element: 'fire', result: 'fire' },
];

/** What standing in (or walking into) a surface does. */
export function onSurface(ruleset: Ruleset, state: GameState, id: string, surface: string, trigger: 'enter' | 'turnStart', rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const e = state.entities[id];
  if (!e || !standing(e) || e.tags.includes(OBJECT_TAG)) {
    // Barrels caught in fire burn too.
    if (e && e.tags.includes(OBJECT_TAG) && surface === 'fire' && trigger === 'turnStart') dealDamage(r, id, sum(rollDice(rng, 1, 6)), 'fire');
    return r.outcome();
  }
  switch (surface) {
    case 'fire':
      dealDamage(r, id, sum(rollDice(rng, 1, 6)), 'fire');
      break;
    case 'electrified':
      dealDamage(r, id, sum(rollDice(rng, 1, 6)), 'lightning');
      r.apply({ type: 'applyCondition', entityId: id, condition: 'no_reactions', remainingTurns: 1 });
      break;
    case 'ice':
    case 'grease':
    case 'blood':
      // Slipping only happens as you step in; standing still on it is safe.
      if (trigger === 'enter' && !rollSave(r, id, 'dex', surface === 'blood' ? 8 : 10)) {
        r.apply({ type: 'applyCondition', entityId: id, condition: 'prone', remainingTurns: 1 });
        r.emit({ type: 'slipped', entityId: id, surface } as never);
      }
      break;
  }
  return r.outcome();
}

/** Falling: stepping down one level is free; each level beyond that is 1d6, and you land prone. */
export function onFall(ruleset: Ruleset, state: GameState, id: string, levels: number, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  const dice = Math.max(0, levels - 1);
  if (dice > 0) dealDamage(r, id, sum(rollDice(rng, dice, 6)), 'bludgeoning');
  if (state.entities[id] && !state.entities[id]!.tags.includes(OBJECT_TAG)) {
    r.apply({ type: 'applyCondition', entityId: id, condition: 'prone', remainingTurns: 1 });
  }
  return r.outcome();
}

// --- Objects -----------------------------------------------------------------------

export interface PropSpec {
  id: string;
  kind: 'barrel_oil' | 'barrel' | 'crate';
  position: Vec2;
  spriteId?: string;
}

const PROP_STATS: Record<PropSpec['kind'], { name: string; hp: number; ac: number; tags: string[] }> = {
  barrel_oil: { name: 'Barril de aceite', hp: 6, ac: 10, tags: ['explosive_oil'] },
  barrel: { name: 'Barril', hp: 10, ac: 10, tags: [] },
  crate: { name: 'Caja', hp: 12, ac: 11, tags: [] },
};

/** Inanimate scenery: attackable, gives cover, never takes turns. */
export function createProp(spec: PropSpec): Entity {
  const p = PROP_STATS[spec.kind];
  return {
    id: spec.id,
    name: p.name,
    controllerId: 'none',
    factionId: 'scenery',
    position: spec.position,
    spriteId: spec.spriteId ?? spec.kind,
    stats: { str: 10, dex: 1, con: 10, int: 1, wis: 1, cha: 1, level: 1, speed: 0, ac: p.ac },
    resources: { hp: { current: p.hp, max: p.hp } },
    conditions: [],
    tags: [OBJECT_TAG, OBSTACLE_TAG, 'immune:poison', 'immune:psychic', ...p.tags],
  };
}

/**
 * An oil barrel bursts: fire damage around it (DEX save for half) and burning oil on the
 * tiles around. Called when such a barrel is destroyed.
 */
export function explodeBarrel(r: Resolver, id: string): void {
  const barrel = r.entity(id);
  const centre = barrel.position;
  const tiles: Vec2[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push({ x: centre.x + dx, y: centre.y + dy });
  r.emit({ type: 'exploded', entityId: id, at: centre } as never);
  const damage = sum(rollDice(r.rng, 3, 6));
  for (const e of Object.values(r.state.entities)) {
    if (e.id === id || !standing(e) || gridDistance(e.position, centre) > 1) continue;
    const saved = e.tags.includes(OBJECT_TAG) ? false : rollSave(r, e.id, 'dex', 12);
    dealDamage(r, e.id, saved ? Math.floor(damage / 2) : damage, 'fire');
  }
  r.apply({ type: 'spawnSurface', tiles, surface: 'oil' }, { type: 'applyElement', tiles, element: 'fire' });
}

destructionHooks.push((r, id) => {
  if (r.entity(id).tags.includes('explosive_oil')) explodeBarrel(r, id);
});
