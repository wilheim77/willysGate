import {
  type ActionDef,
  type ActionOutcome,
  type ActionPreview,
  type ActionTarget,
  type Entity,
  type GameState,
  type RngCursor,
  type Ruleset,
  type Vec2,
  gridDistance,
  hasCondition,
  hasLineOfSight,
  inBounds,
  isHostile,
  type JumpRules,
  jumpTargets,
  traceProjectile,
  simulatePush,
  surfaceAt,
  tileAt,
} from '../../engine';
import { classOf, damageBonus, hasTrait, isBig, isBoss, level, skillLevel } from './character';
import { type AbilityData, CLASSES, abilityData } from './data';
import { type Dice, averageDice, formatDice, parseDice, rollDice } from './dice';
import { d20Check } from '../common/d20';
import {
  type AttackSpec,
  Resolver,
  type WillyEvent,
  attackPreview,
  chanceD20,
  countUse,
  damageHooks,
  dealDamage,
  heal,
  heightOf,
  isCreature,
  pushEntity,
  resolveAttack,
  rollSave,
  saveBonus,
  standing,
  unmovable,
} from './resolve';

/**
 * Action ids: "basic:<id>" (golpe, empujar, correr, ganso) and "hab:<ability id>" for class
 * abilities. Labels, texts, costs and the level an ability unlocks at come from data/classes.json;
 * the effects are implemented here, one handler per ability.
 */

export interface Handler {
  /** Fixed, or depending on the actor (the 5G line changes target with its level). */
  target: ActionDef['target'] | ((actor: Entity, state: GameState) => ActionDef['target']);
  tags: string[];
  /** Hidden until the engine supports it (summons need spawnEntity: ENGINE_REQUESTS R13). */
  pending?: boolean;
  preview(state: GameState, actor: Entity, target: ActionTarget): ActionPreview;
  perform(r: Resolver, actorId: string, target: ActionTarget): void;
}

export const invalid = (reason: string): ActionPreview => ({ valid: false, reason });
export const dice = (text: string): Dice => parseDice(text);

export function targetEntity(state: GameState, target: ActionTarget): Entity | undefined {
  return target.entityId ? state.entities[target.entityId] : undefined;
}

export function areaTiles(state: GameState, centre: Vec2, radius: number): Vec2[] {
  const tiles: Vec2[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const p = { x: centre.x + dx, y: centre.y + dy };
      if (inBounds(state.map, p) && tileAt(state.map, p)?.walkable) tiles.push(p);
    }
  }
  return tiles;
}

export function creaturesIn(state: GameState, tiles: Vec2[]): Entity[] {
  const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
  return Object.values(state.entities).filter((e) => standing(e) && keys.has(`${e.position.x},${e.position.y}`));
}

export function hostilesAround(state: GameState, actor: Entity, centre: Vec2, radius: number): Entity[] {
  return Object.values(state.entities).filter((e) => standing(e) && isCreature(e) && isHostile(e, actor) && gridDistance(e.position, centre) <= radius);
}

/** Straight line (row, column or diagonal) between two tiles, excluding both ends. */
export function straightLine(a: Vec2, b: Vec2): Vec2[] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const tiles: Vec2[] = [];
  for (let i = 1; i < n; i++) tiles.push({ x: a.x + sx * i, y: a.y + sy * i });
  return tiles;
}

export function occupiedBy(state: GameState, p: Vec2, exceptId?: string): Entity | undefined {
  return Object.values(state.entities).find((e) => e.id !== exceptId && e.position.x === p.x && e.position.y === p.y && standing(e));
}

const lowCeiling = (state: GameState, p: Vec2) => (tileAt(state.map, p)?.terrain ?? '').includes('techo-bajo');

// --- Generic attack and area helpers -------------------------------------------------------

/** Adds what the push after a hit would do (walls, void, falls) to an attack preview, so the AI values it. */
export function withPushBonus(state: GameState, p: ActionPreview, targetId: string, from: Vec2, distance: number): ActionPreview {
  if (!p.valid) return p;
  const extra = (p.chance ?? 1) * pushExpectedDamage(state, targetId, from, distance);
  return extra > 0 ? { ...p, expectedDamage: (p.expectedDamage ?? 0) + extra } : p;
}

export function attackPreviewOf(state: GameState, spec: AttackSpec, extra: Partial<ActionPreview> = {}): ActionPreview {
  const p = attackPreview(state, spec);
  return {
    valid: true,
    chance: p.chance,
    expectedDamage: p.expected,
    breakdown: [
      ...p.modifiers.map((m) => ({ label: m.label, value: `${m.value >= 0 ? '+' : ''}${m.value}`, ...(m.term ? { term: m.term } : {}) })),
      { label: 'Defensa del objetivo', value: String(p.def), term: 'def' },
      { label: 'Daño', value: `${formatDice(spec.dice)}${spec.extraDamage ? ` +${spec.extraDamage}` : ''}` },
    ],
    ...extra,
  };
}

function explosionPreview(state: GameState, actor: Entity, centre: Vec2, radius: number, d: Dice): ActionPreview {
  const tiles = areaTiles(state, centre, radius);
  const victims = creaturesIn(state, tiles).filter(isCreature);
  const foes = victims.filter((v) => isHostile(v, actor));
  const friends = victims.filter((v) => !isHostile(v, actor));
  const expected = Math.max(0, (foes.length - friends.length) * averageDice(d));
  const breakdown: ActionPreview['breakdown'] = [{ label: 'Daño en el área', value: formatDice(d) }];
  if (friends.length) breakdown.push({ label: '¡Cuidado! También alcanza a', value: friends.map((f) => (f.id === actor.id ? 'ti' : f.name)).join(', ') });
  return { valid: true, chance: 1, expectedDamage: expected, affectedTiles: tiles, breakdown };
}

/** An explosion: damage to everyone in the area (allies too), then fire on the floor. Gas makes it worse. */
function explode(r: Resolver, actorId: string, centre: Vec2, radius: number, d: Dice, cause = 'explosion'): void {
  const tiles = areaTiles(r.state, centre, radius);
  r.emit({ type: 'exploded', entityId: actorId, at: centre } as WillyEvent);
  const gasTiles = tiles.filter((t) => surfaceAt(r.state, t)?.type === 'gas');
  for (const v of creaturesIn(r.state, tiles)) dealDamage(r, v.id, rollDice(r.rng, d), 'fuego', actorId, cause);
  if (gasTiles.length) {
    r.emit({ type: 'exploded', entityId: actorId, at: centre, gas: true } as WillyEvent);
    for (const v of creaturesIn(r.state, gasTiles)) dealDamage(r, v.id, rollDice(r.rng, dice('3d6')), 'fuego', actorId, cause);
  }
  r.apply({ type: 'applyElement', tiles, element: 'fuego' });
}

// --- Jumps (basket) ---------------------------------------------------------------------------

export type { JumpRules } from '../../engine';

/**
 * Can `actor` jump to `to`? The engine finds the legal landings (straight 8-way lines, over gaps
 * and pits, never through a wall taller than the jump; R15); this only adds the low ceilings
 * and says why not, in Spanish.
 */
export function jumpCheck(state: GameState, actor: Entity, to: Vec2, rules: JumpRules): string | null {
  if (lowCeiling(state, actor.position) || lowCeiling(state, to)) return 'Techo bajo: aquí no se puede saltar.';
  if (jumpTargets(willyRef(), state, actor.id, rules).some((l) => l.to.x === to.x && l.to.y === to.y)) return null;
  const line = straightLine(actor.position, to);
  if (!line) return 'Solo se salta en línea recta.';
  const dist = gridDistance(actor.position, to);
  if (dist === 0 || dist > rules.maxLength) return 'Demasiado lejos para saltar.';
  const land = tileAt(state.map, to);
  if (!land || !land.walkable) return 'No se puede aterrizar ahí.';
  if (occupiedBy(state, to, actor.id)) return 'La casilla de llegada está ocupada.';
  if (land.height - heightOf(state, actor.position) > rules.maxUp) return 'Demasiado alto para saltar.';
  if (!rules.overEntities && line.some((p) => occupiedBy(state, p, actor.id))) return 'Hay alguien en medio.';
  return 'Hay un muro en medio.';
}

function crossesGap(state: GameState, from: Vec2, to: Vec2): boolean {
  return (straightLine(from, to) ?? []).some((p) => {
    const t = tileAt(state.map, p);
    return !!t && (!t.walkable || t.height < Math.min(heightOf(state, from), heightOf(state, to)) - 1);
  });
}

/** The engine's jump (falls beyond safeDown go through onFall), plus Willy's 'salto' state and event. */
export function doJump(r: Resolver, actorId: string, to: Vec2, rules: JumpRules): void {
  const from = { ...r.entity(actorId).position };
  const rise = heightOf(r.state, to) - heightOf(r.state, from);
  const gap = crossesGap(r.state, from, to);
  r.apply({ type: 'jump', entityId: actorId, to, safeDown: rules.safeDown }, { type: 'applyCondition', entityId: actorId, condition: 'salto', remainingTurns: 1 });
  r.emit({ type: 'saltoCompleto', entityId: actorId, from, to, subida: rise, cruzaVacio: gap } as WillyEvent);
}

/** Best landing tile next to a target for a jumping attack. */
function landingNear(state: GameState, actor: Entity, target: Entity, rules: JumpRules): Vec2 | null {
  let best: Vec2 | null = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const p = { x: target.position.x + dx, y: target.position.y + dy };
      if (p.x === actor.position.x && p.y === actor.position.y) return p;
      if (jumpCheck(state, actor, p, rules)) continue;
      if (!best || heightOf(state, p) > heightOf(state, best)) best = p;
    }
  }
  return best;
}

// --- Handlers ---------------------------------------------------------------------------------

function basicAttackSpec(actor: Entity, targetId: string, extra?: Partial<AttackSpec>): AttackSpec {
  const weapon = actor.tags.find((t) => t.startsWith('arma:'))?.slice(5) ?? '1d4';
  const melee = !actor.tags.includes('distancia');
  return { attackerId: actor.id, targetId, label: 'Golpe', melee, dice: dice(weapon), element: 'golpe', ...extra };
}

export function reachOf(actor: Entity): number {
  return Number(actor.tags.find((t) => t.startsWith('alcance:'))?.slice(8) ?? 1);
}

/** Difficulty to shove someone: 8 + their FUE (+3 Espalda de hierro, +5 if big). */
function shoveDif(target: Entity): number {
  return 8 + (target.stats.fue ?? 5) + (hasTrait(target, 'espalda-de-hierro') ? 3 : 0) + (isBig(target) ? 5 : 0);
}

/** The pusher's visible modifiers: Fuerza (creatures: their strength stat), Empujar level, buffs. */
function shoveModifiers(actor: Entity): { label: string; value: number; term?: string }[] {
  const lvl = skillLevel(actor, 'empujar');
  const mods: { label: string; value: number; term?: string }[] = [{ label: 'Fuerza', value: actor.stats.fue ?? 5 }];
  if (lvl >= 2) mods.push({ label: 'Empujar', value: lvl >= 4 ? 4 : 2, term: 'habilidad' });
  if (hasCondition(actor, 'compulsado')) mods.push({ label: 'Compulsado', value: 2, term: 'compulsado' });
  if (hasCondition(actor, 'mareado')) mods.push({ label: 'Mareado', value: -2, term: 'mareado' });
  return mods;
}

function shoveBonus(actor: Entity): number {
  return shoveModifiers(actor).reduce((s, m) => s + m.value, 0);
}

/**
 * Damage a push would cause (for previews and the AI): the void takes a normal enemy out, a
 * boss loses 20 %; walls 1d6 (3.5), creatures 1d4 (2.5), falls 1d6 per level beyond the first.
 */
export function pushExpectedDamage(state: GameState, targetId: string, from: Vec2, distance: number): number {
  const target = state.entities[targetId];
  if (!target || unmovable(target)) return 0;
  let dx = Math.sign(target.position.x - from.x);
  let dy = Math.sign(target.position.y - from.y);
  if (distance < 0) {
    dx = -dx;
    dy = -dy;
  }
  if (!dx && !dy) return 0;
  const sim = simulatePush(willyRef(), state, targetId, dx, dy, Math.abs(distance));
  const vida = target.resources.vida;
  if (sim.intoVoid) return isBoss(target) ? Math.ceil((vida?.max ?? 0) * 0.2) : (vida?.current ?? 0);
  let dmg = 3.5 * Math.max(0, sim.dropped - 1);
  if (sim.collidedWith?.wall) dmg += 3.5;
  else if (sim.collidedWith?.entityId) dmg += 2.5;
  return dmg;
}

let rulesetRef: Ruleset | null = null;
/** The ruleset object, for simulatePush in previews (set by index.ts). */
export function setWillyRef(r: Ruleset): void {
  rulesetRef = r;
}
function willyRef(): Ruleset {
  if (!rulesetRef) throw new Error('willy: ruleset reference not set');
  return rulesetRef;
}

const HANDLERS: Record<string, Handler> = {
  // ---- Basic actions (everyone) ----
  'basic:golpe': {
    target: { kind: 'creature', range: 1, filter: 'hostile' },
    tags: ['attack', 'melee'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('Elige un objetivo.');
      if (gridDistance(a.position, target.position) > reachOf(a)) return invalid('Fuera de alcance.');
      if (a.tags.includes('distancia') && !hasLineOfSight(s, a.position, target.position)) return invalid('No hay línea de visión.');
      return attackPreviewOf(s, basicAttackSpec(a, target.id));
    },
    perform: (r, id, t) => {
      resolveAttack(r, basicAttackSpec(r.entity(id), t.entityId!));
    },
  },
  'basic:empujar': {
    target: { kind: 'creature', range: 1, filter: 'any' },
    tags: ['control', 'push'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target || target.id === a.id) return invalid('Elige a quién empujar.');
      if (unmovable(target)) return invalid('No hay quien lo mueva de ahí.');
      const chance = chanceD20(shoveBonus(a), shoveDif(target));
      const dist = skillLevel(a, 'empujar') >= 3 ? 2 : 1;
      const consequence = pushExpectedDamage(s, target.id, a.position, dist);
      return {
        valid: true,
        chance,
        // Only hostiles count as a gain for the AI; shoving a friend is the player's business.
        expectedDamage: isHostile(target, a) ? chance * consequence : 0,
        breakdown: [
          ...shoveModifiers(a).map((m) => ({ label: m.label, value: `${m.value >= 0 ? '+' : ''}${m.value}`, ...(m.term ? { term: m.term } : {}) })),
          { label: 'DIF', value: String(shoveDif(target)), term: 'dif' },
          ...(consequence > 0 ? [{ label: 'Consecuencia', value: consequence >= (target.resources.vida?.current ?? 999) ? '¡fuera de plano!' : `~${Math.round(consequence)} de daño`, term: 'empujar' }] : []),
        ],
      };
    },
    perform: (r, id, t) => {
      const actor = r.entity(id);
      const target = r.entity(t.entityId!);
      const roll = d20Check(r.rng, { check: 'empujar', label: 'Empujar', mode: 'normal', modifiers: shoveModifiers(actor), target: shoveDif(target), targetLabel: 'DIF' });
      const natural = roll.dice[0]!.kept[0]!;
      roll.success = natural === 20 || (natural !== 1 && roll.total >= shoveDif(target));
      roll.targetTerm = 'dif';
      r.emit({ type: 'shoveRolled', actorId: id, targetId: target.id, roll } as never);
      if (!roll.success) return;
      const dist = skillLevel(actor, 'empujar') >= 3 ? 2 : 1;
      const res = pushEntity(r, target.id, actor.position, dist, id);
      if (res.moved > 0 || res.collided) countUse(r, id, 'empujar');
      r.emit({ type: 'shoved', entityId: target.id, actorId: id } as never);
    },
  },
  'basic:correr': {
    target: { kind: 'self', range: 0 },
    tags: ['move'],
    preview: () => ({ valid: true }),
    perform: (r, id) => r.apply({ type: 'applyCondition', entityId: id, condition: 'corriendo', remainingTurns: 1 }),
  },
  'basic:ganso': {
    target: { kind: 'self', range: 0 },
    tags: ['show'],
    preview: () => ({ valid: true }),
    perform: (r, id) => {
      const me = r.entity(id);
      const near = Object.values(r.state.entities).filter((e) => standing(e) && isHostile(e, me) && gridDistance(e.position, me.position) === 1);
      r.emit({ type: 'showOff', entityId: id, adyacenteAEnemigo: near.length > 0, adyacenteAJefe: near.some(isBoss) } as WillyEvent);
    },
  },

  'basic:liberarse': {
    target: { kind: 'self', range: 0 },
    tags: ['move'],
    preview: (s, a) => (hasCondition(a, 'enredado') ? { valid: true, chance: chanceD20(a.stats.fue ?? 5, 13) } : invalid('No estás enredado.')),
    perform: (r, id) => {
      if (rollSave(r, id, 'fue', 13)) r.apply({ type: 'removeCondition', entityId: id, condition: 'enredado' });
    },
  },

  // ---- Butanero ----
  'hab:lanzar-bombona': {
    target: { kind: 'tile', range: 4 },
    tags: ['attack', 'area', 'fire'],
    preview: (s, a, t) => {
      if (!t.tile) return invalid('Elige dónde lanzarla.');
      const lvl = skillLevel(a, 'lanzar-bombona');
      return explosionPreview(s, a, t.tile, lvl >= 3 ? 2 : 1, dice(lvl >= 2 ? '3d6' : '2d6'));
    },
    perform: (r, id, t) => {
      const lvl = skillLevel(r.entity(id), 'lanzar-bombona');
      const hostiles = hostilesAround(r.state, r.entity(id), t.tile!, lvl >= 3 ? 2 : 1);
      explode(r, id, t.tile!, lvl >= 3 ? 2 : 1, dice(lvl >= 2 ? '3d6' : '2d6'));
      if (lvl >= 4) {
        const centre = occupiedBy(r.state, t.tile!);
        if (centre && standing(centre)) r.apply({ type: 'applyCondition', entityId: centre.id, condition: 'tumbado', remainingTurns: 1 });
      }
      if (hostiles.length) countUse(r, id, 'lanzar-bombona');
    },
  },
  'hab:reparto-a-domicilio': {
    target: { kind: 'creature', range: 5, filter: 'hostile' },
    tags: ['attack', 'melee', 'push', 'charge'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('Elige a quién repartir.');
      const range = skillLevel(a, 'reparto-a-domicilio') >= 2 ? 5 : 4;
      const line = straightLine(a.position, target.position);
      if (!line) return invalid('La carga va en línea recta.');
      if (gridDistance(a.position, target.position) > range) return invalid('Demasiado lejos.');
      for (const p of line) {
        const tile = tileAt(s.map, p);
        if (!tile?.walkable || occupiedBy(s, p, a.id)) return invalid('El camino no está despejado.');
      }
      return withPushBonus(s, attackPreviewOf(s, chargeSpec(a, target.id)), target.id, line.at(-1) ?? a.position, skillLevel(a, 'reparto-a-domicilio') >= 3 ? 3 : 2);
    },
    perform: (r, id, t) => {
      const actor = r.entity(id);
      const target = r.entity(t.entityId!);
      const line = straightLine(actor.position, target.position) ?? [];
      const stop = line.at(-1);
      if (stop) r.apply({ type: 'setPosition', entityId: id, position: stop });
      const res = resolveAttack(r, chargeSpec(r.entity(id), target.id));
      if (res.hit) {
        pushEntity(r, target.id, r.entity(id).position, skillLevel(actor, 'reparto-a-domicilio') >= 3 ? 3 : 2, id);
        countUse(r, id, 'reparto-a-domicilio');
      }
    },
  },
  'hab:fuga-de-gas': {
    target: { kind: 'self', range: 0 },
    tags: ['area', 'surface'],
    preview: (s, a) => ({ valid: true, affectedTiles: areaTiles(s, a.position, skillLevel(a, 'fuga-de-gas') >= 2 ? 3 : 2) }),
    perform: (r, id) => {
      const me = r.entity(id);
      r.apply({ type: 'spawnSurface', tiles: areaTiles(r.state, me.position, skillLevel(me, 'fuga-de-gas') >= 2 ? 3 : 2), surface: 'gas', turns: 3 });
      countUse(r, id, 'fuga-de-gas');
    },
  },
  'hab:cadena-de-reparto': {
    target: { kind: 'tile', range: 6 },
    tags: ['attack', 'area', 'fire'],
    preview: (s, a, t) => {
      if (!t.tile || !straightLine(a.position, t.tile)) return invalid('Las bombonas ruedan en línea recta.');
      const hits = chainStops(s, a, t.tile);
      return { valid: true, chance: 1, expectedDamage: hits.length * averageDice(dice('2d6')), affectedTiles: hits.flatMap((h) => areaTiles(s, h, 1)) };
    },
    perform: (r, id, t) => {
      for (const stop of chainStops(r.state, r.entity(id), t.tile!)) explode(r, id, stop, 1, dice(skillLevel(r.entity(id), 'cadena-de-reparto') >= 4 ? '3d6' : '2d6'));
      countUse(r, id, 'cadena-de-reparto');
    },
  },
  'hab:reparto-urgente': {
    target: { kind: 'tile', range: 6 },
    tags: ['attack', 'area', 'fire'],
    preview: (s, a, t) => {
      if (!t.tile) return invalid('Elige dónde llueven las bombonas.');
      const drops = urgentDrops(s, t.tile);
      return { valid: true, chance: 1, expectedDamage: creaturesIn(s, drops).filter((v) => isHostile(v, a)).length * averageDice(dice('2d6')), affectedTiles: drops };
    },
    perform: (r, id, t) => {
      for (const p of urgentDrops(r.state, t.tile!)) explode(r, id, p, 0, dice('2d6'));
      countUse(r, id, 'reparto-urgente');
    },
  },

  // ---- Funcionario ----
  'hab:vuelva-usted-manana': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['control', 'ranged'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿A quién le toca?');
      const lvl = skillLevel(a, 'vuelva-usted-manana');
      if (gridDistance(a.position, target.position) > (lvl >= 4 ? 6 : 4)) return invalid('Demasiado lejos para el impreso.');
      if (isBoss(target)) return { valid: true, chance: 1, breakdown: [{ label: 'Jefe', value: 'pierde 1 acción' }] };
      const dif = paperDif(a);
      return { valid: true, chance: 1 - chanceD20(saveBonus(target, 'agu'), dif), breakdown: [{ label: 'DIF de la salvación (Aguante)', value: String(dif), term: 'dif' }] };
    },
    perform: (r, id, t) => {
      const lvl = skillLevel(r.entity(id), 'vuelva-usted-manana');
      const first = paperwork(r, id, t.entityId!);
      if (lvl >= 3) {
        const me = r.entity(id);
        const bounce = hostilesAround(r.state, me, r.entity(t.entityId!).position, 2).find((e) => e.id !== t.entityId);
        if (bounce) paperwork(r, id, bounce.id);
      }
      if (first) countUse(r, id, 'vuelva-usted-manana');
    },
  },
  'hab:formulario-por-triplicado': {
    target: { kind: 'tile', range: 4 },
    tags: ['control', 'area', 'surface'],
    preview: (s, a, t) => (t.tile ? { valid: true, affectedTiles: areaTiles(s, t.tile, 1) } : invalid('Elige dónde dejar el papeleo.')),
    perform: (r, id, t) => {
      const lvl = skillLevel(r.entity(id), 'formulario-por-triplicado');
      r.apply({ type: 'spawnSurface', tiles: areaTiles(r.state, t.tile!, lvl >= 4 ? 2 : 1), surface: 'expedientes', turns: lvl >= 2 ? 4 : 3 });
      countUse(r, id, 'formulario-por-triplicado');
    },
  },
  'hab:pausa-del-cafe': {
    target: { kind: 'self', range: 0 },
    tags: ['heal'],
    preview: (s, a) => {
      if (hasCondition(a, 'cafe-tomado')) return invalid('Ya te has tomado el café de este combate.');
      if (afterHours(s, a)) return invalid('Han dado las dos: la ventanilla está cerrada.');
      return { valid: true, expectedHealing: skillLevel(a, 'pausa-del-cafe') >= 2 ? 8 : 6 };
    },
    perform: (r, id) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'pausa-del-cafe');
      heal(r, id, lvl >= 2 ? 8 : 6);
      r.apply({ type: 'modifyResource', entityId: id, resource: 'energia', delta: 2 }, { type: 'applyCondition', entityId: id, condition: 'cafe-tomado' });
      if (lvl >= 5) for (const c of ['envenenado', 'mareado', 'ardiendo', 'cegado']) r.apply({ type: 'removeCondition', entityId: id, condition: c });
      if (lvl < 3) r.apply({ type: 'modifyResource', entityId: id, resource: 'acciones', delta: -99 });
      const near = Object.values(r.state.entities).filter((e) => standing(e) && isHostile(e, me) && gridDistance(e.position, me.position) === 1).length;
      countUse(r, id, 'pausa-del-cafe');
      r.emit({ type: 'skillUsed', entityId: id, habilidad: 'pausa-del-cafe', enemigosAdyacentes: near } as WillyEvent);
    },
  },
  'hab:sello-oficial': {
    target: { kind: 'creature', range: 3, filter: 'ally' },
    tags: ['buff'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿A quién compulsas?');
      if (gridDistance(a.position, target.position) > (skillLevel(a, 'sello-oficial') >= 3 ? 3 : 1)) return invalid('Tiene que estar a tu lado.');
      return { valid: true };
    },
    perform: (r, id, t) => {
      r.apply({ type: 'applyCondition', entityId: t.entityId!, condition: 'compulsado', remainingTurns: skillLevel(r.entity(id), 'sello-oficial') >= 2 ? 3 : 2 });
      countUse(r, id, 'sello-oficial');
    },
  },
  'hab:silencio-administrativo': {
    target: { kind: 'self', range: 0 },
    tags: ['control', 'area'],
    preview: (s, a) => ({ valid: true, affectedTiles: areaTiles(s, a.position, 4) }),
    perform: (r, id) => {
      const me = r.entity(id);
      const victims = hostilesAround(r.state, me, me.position, skillLevel(me, 'silencio-administrativo') >= 2 ? 5 : 4);
      for (const v of victims) {
        if (isBoss(v)) r.apply({ type: 'applyCondition', entityId: v.id, condition: 'mareado', remainingTurns: 2 });
        else r.apply({ type: 'applyCondition', entityId: v.id, condition: 'aturdido', remainingTurns: 1 }, { type: 'applyCondition', entityId: v.id, condition: 'silenciado', remainingTurns: 2 });
      }
      countUse(r, id, 'silencio-administrativo');
      r.emit({ type: 'skillUsed', entityId: id, habilidad: 'silencio-administrativo', afectados: victims.length } as WillyEvent);
    },
  },

  // ---- Jugador de basket ----
  'hab:gran-salto': {
    target: { kind: 'tile', range: 4 },
    tags: ['move', 'jump'],
    preview: (s, a, t) => {
      if (!t.tile) return invalid('Elige dónde aterrizar.');
      const why = jumpCheck(s, a, t.tile, jumpRules(a));
      return why ? invalid(why) : { valid: true };
    },
    perform: (r, id, t) => {
      doJump(r, id, t.tile!, jumpRules(r.entity(id)));
      countUse(r, id, 'gran-salto');
    },
  },
  'hab:mate': {
    target: { kind: 'creature', range: 2, filter: 'hostile' },
    tags: ['attack', 'melee', 'push'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿A quién machacas?');
      if (lowCeiling(s, a.position)) return invalid('Techo bajo: aquí no hay mate que valga.');
      if (gridDistance(a.position, target.position) > reachOf(a)) return invalid('Fuera de alcance.');
      if (!hasCondition(a, 'salto') && heightOf(s, a.position) <= heightOf(s, target.position)) return invalid('Para machacar hay que saltar antes o estar más alto.');
      return attackPreviewOf(s, dunkSpec(a, target));
    },
    perform: (r, id, t) => {
      const me = r.entity(id);
      const target = r.entity(t.entityId!);
      const higher = heightOf(r.state, me.position) > heightOf(r.state, target.position);
      const res = resolveAttack(r, dunkSpec(me, target));
      if (!res.hit) return;
      if (standing(r.entity(target.id))) r.apply({ type: 'applyCondition', entityId: target.id, condition: 'tumbado', remainingTurns: 1 });
      if (higher) pushEntity(r, target.id, me.position, 1, id);
      if (skillLevel(me, 'mate') >= 3) for (const o of hostilesAround(r.state, me, r.entity(target.id).position, 1)) if (o.id !== target.id) pushEntity(r, o.id, r.entity(target.id).position, 1, id);
      countUse(r, id, 'mate');
    },
  },
  'hab:pase-picado': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['attack', 'ranged', 'push'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿A quién se la pasas?');
      const route = passRoute(s, a, target);
      if (!route) return invalid(`No llega: ni directo ni con ${passBounces(a) === 1 ? 'un rebote' : 'dos rebotes'}.`);
      return { ...withPushBonus(s, attackPreviewOf(s, passSpec(a, target.id, route)), target.id, route.from, 1), ...(route.path.length ? { affectedTiles: route.path } : {}) };
    },
    perform: (r, id, t) => {
      const me = r.entity(id);
      const route = passRoute(r.state, me, r.entity(t.entityId!));
      if (!route) return;
      if (route.bounces.length) r.emit({ type: 'bounced', entityId: id, targetId: t.entityId, bounces: route.bounces, path: route.path } as WillyEvent);
      const res = resolveAttack(r, passSpec(me, t.entityId!, route));
      if (res.hit) {
        pushEntity(r, t.entityId!, route.from, 1, id);
        countUse(r, id, 'pase-picado');
      }
    },
  },
  'hab:alley-oop': {
    target: { kind: 'creature', range: 5, filter: 'hostile' },
    tags: ['attack', 'melee', 'jump', 'push'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿Sobre quién rematas?');
      const rules = { maxLength: skillLevel(a, 'alley-oop') >= 2 ? 5 : 4, maxUp: 3, safeDown: 4 };
      if (!landingNear(s, a, target, rules)) return invalid('No hay dónde aterrizar junto al objetivo.');
      return attackPreviewOf(s, alleySpec(a, target.id, !!alleyHelper(s, a, target)));
    },
    perform: (r, id, t) => {
      const me = r.entity(id);
      const target = r.entity(t.entityId!);
      const rules = { maxLength: skillLevel(me, 'alley-oop') >= 2 ? 5 : 4, maxUp: 3, safeDown: 4 };
      const land = landingNear(r.state, me, target, rules);
      if (!land) return;
      if (land.x !== me.position.x || land.y !== me.position.y) doJump(r, id, land, rules);
      const helper = alleyHelper(r.state, me, target);
      const res = resolveAttack(r, alleySpec(r.entity(id), target.id, !!helper));
      if (!res.hit) return;
      if (standing(r.entity(target.id))) r.apply({ type: 'applyCondition', entityId: target.id, condition: 'tumbado', remainingTurns: 1 });
      for (const o of hostilesAround(r.state, r.entity(id), r.entity(target.id).position, 1)) if (o.id !== target.id) pushEntity(r, o.id, r.entity(target.id).position, 2, id);
      countUse(r, id, 'alley-oop');
      r.emit({ type: 'skillUsed', entityId: id, habilidad: 'alley-oop', asistente: helper?.id ?? null } as WillyEvent);
    },
  },
  'hab:mate-del-concurso': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['attack', 'melee', 'jump', 'area'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿Dónde aterrizas?');
      if (!landingNear(s, a, target, { maxLength: 6, maxUp: 99, safeDown: 99, overEntities: true })) return invalid('No hay dónde aterrizar.');
      return attackPreviewOf(s, { ...dunkSpec(a, target), label: 'Mate del concurso', dice: dice('3d8') });
    },
    perform: (r, id, t) => {
      const me = r.entity(id);
      const target = r.entity(t.entityId!);
      const rules = { maxLength: 6, maxUp: 99, safeDown: 99, overEntities: true };
      const land = landingNear(r.state, me, target, rules);
      if (!land) return;
      const fromHigh = heightOf(r.state, me.position) - heightOf(r.state, land) >= 2;
      if (land.x !== me.position.x || land.y !== me.position.y) doJump(r, id, land, rules);
      const res = resolveAttack(r, { ...dunkSpec(r.entity(id), target), label: 'Mate del concurso', dice: dice(fromHigh ? '6d8' : '3d8') });
      for (const o of hostilesAround(r.state, r.entity(id), land, 1)) {
        if (standing(o)) r.apply({ type: 'applyCondition', entityId: o.id, condition: 'tumbado', remainingTurns: 1 });
        pushEntity(r, o.id, land, 2, id);
      }
      if (res.hit) countUse(r, id, 'mate-del-concurso');
    },
  },
};

// --- Ability-specific helpers -------------------------------------------------------------------

function chargeSpec(a: Entity, targetId: string): AttackSpec {
  return { attackerId: a.id, targetId, label: 'Reparto a domicilio', melee: true, dice: dice(skillLevel(a, 'reparto-a-domicilio') >= 4 ? '1d10' : '1d8'), element: 'golpe' };
}

function chainStops(state: GameState, a: Entity, to: Vec2): Vec2[] {
  const dx = Math.sign(to.x - a.position.x);
  const dy = Math.sign(to.y - a.position.y);
  const length = skillLevel(a, 'cadena-de-reparto') >= 2 ? 8 : 6;
  const bottles = skillLevel(a, 'cadena-de-reparto') >= 3 ? 4 : 3;
  const stops: Vec2[] = [];
  let last = a.position;
  for (let i = 1; i <= length && stops.length < bottles; i++) {
    const p = { x: a.position.x + dx * i, y: a.position.y + dy * i };
    const t = tileAt(state.map, p);
    if (!t || !t.walkable) {
      stops.push(last);
      break;
    }
    const who = occupiedBy(state, p, a.id);
    if (who && !stops.some((s) => s.x === p.x && s.y === p.y)) stops.push(p);
    last = p;
  }
  if (stops.length === 0) stops.push(last);
  return stops;
}

function urgentDrops(state: GameState, centre: Vec2): Vec2[] {
  return [centre, { x: centre.x + 2, y: centre.y }, { x: centre.x - 2, y: centre.y }, { x: centre.x, y: centre.y + 2 }, { x: centre.x, y: centre.y - 2 }].filter((p) => inBounds(state.map, p) && tileAt(state.map, p)?.walkable);
}

function paperDif(a: Entity): number {
  return 10 + Math.floor((a.stats.man ?? 5) / 2) + (skillLevel(a, 'vuelva-usted-manana') >= 2 ? 2 : 0);
}

/** One form: the target waits its turn (stunned), unless it passes an Aguante save. Bosses lose an action. */
function paperwork(r: Resolver, actorId: string, targetId: string): boolean {
  const target = r.entity(targetId);
  if (isBoss(target)) {
    if ((target.resources.acciones?.current ?? 0) > 0) r.apply({ type: 'modifyResource', entityId: targetId, resource: 'acciones', delta: -1 });
    return true;
  }
  if (rollSave(r, targetId, 'agu', paperDif(r.entity(actorId)))) return false;
  r.apply({ type: 'applyCondition', entityId: targetId, condition: 'aturdido', remainingTurns: 1 });
  return true;
}

function afterHours(state: GameState, a: Entity): boolean {
  if (hasTrait(a, 'jornada-continua')) return state.turn.mode === 'combat' && state.turn.round >= 8;
  return state.turn.mode === 'combat' && state.turn.round >= 5;
}

function jumpRules(a: Entity): JumpRules {
  const lvl = skillLevel(a, 'gran-salto');
  return { maxLength: (lvl >= 2 ? 4 : 3) + (hasTrait(a, 'salto-vertical') ? 1 : 0), maxUp: (lvl >= 3 ? 3 : 2) + (hasTrait(a, 'salto-vertical') ? 1 : 0), safeDown: 3, overEntities: lvl >= 5 };
}

function dunkSpec(a: Entity, target: Entity): AttackSpec {
  const lvl = skillLevel(a, 'mate');
  const posterize = lvl >= 5 && isBig(target);
  return {
    attackerId: a.id,
    targetId: target.id,
    label: 'Mate',
    melee: true,
    dice: dice(lvl >= 2 ? '1d10' : '1d8'),
    element: 'golpe',
    extra: [{ label: 'Mate', value: lvl >= 4 ? 5 : 3 }],
    ...(posterize ? { extraDamage: 0 } : {}),
  };
}

interface PassRoute {
  /** Where the push comes from: Willy, or the last bounce. */
  from: Vec2;
  bounces: Vec2[];
  /** Tiles the ball crosses (empty for a direct pass). */
  path: Vec2[];
  length: number;
}

const passRange = (a: Entity) => (skillLevel(a, 'pase-picado') >= 2 ? 6 : 5);
const passBounces = (a: Entity) => (skillLevel(a, 'pase-picado') >= 3 ? 2 : 1);

/**
 * How the ball gets there: straight if there is a line of sight, else off one or two walls
 * (the engine traces billiard bounces in the 8 directions; R15). The shortest route wins.
 */
function passRoute(state: GameState, a: Entity, target: Entity): PassRoute | null {
  const range = passRange(a);
  const direct = gridDistance(a.position, target.position);
  if (direct <= range && hasLineOfSight(state, a.position, target.position)) return { from: a.position, bounces: [], path: [], length: direct };
  let best: PassRoute | null = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const trace = traceProjectile(willyRef(), state, a.position, { x: a.position.x + dx, y: a.position.y + dy }, { range, maxBounces: passBounces(a), ignore: [a.id] });
      if (trace.hitId !== target.id || !trace.bounces.length) continue;
      if (!best || trace.path.length < best.length) best = { from: trace.bounces[trace.bounces.length - 1]!, bounces: trace.bounces, path: trace.path, length: trace.path.length };
    }
  }
  return best;
}

function passSpec(a: Entity, targetId: string, route?: PassRoute): AttackSpec {
  const base = parseDice(skillLevel(a, 'pase-picado') >= 4 ? '1d8' : '1d6');
  // Maestría «Tiro de tres»: 6 tiles or more of flight, double damage.
  const three = skillLevel(a, 'pase-picado') >= 5 && (route?.length ?? 0) >= 6;
  return {
    attackerId: a.id,
    targetId,
    label: route?.bounces.length ? 'Pase picado (de rebote)' : 'Pase picado',
    melee: false,
    dice: three ? { ...base, count: base.count * 2 } : base,
    element: 'golpe',
    ...(route?.bounces.length ? { ignoresCover: true } : {}),
  };
}

function alleySpec(a: Entity, targetId: string, assisted: boolean): AttackSpec {
  // With a teammate throwing the ball (Chencho, a fan, an automaton...) it is the real thing: 2d8.
  // Alone it is an "auto-alley-oop" off the wall: half, 1d8.
  const full = skillLevel(a, 'alley-oop') >= 4 ? '2d10' : '2d8';
  const half = skillLevel(a, 'alley-oop') >= 4 ? '1d10' : '1d8';
  return { attackerId: a.id, targetId, label: assisted ? 'Alley-oop' : 'Auto-alley-oop', melee: true, dice: dice(assisted ? full : half), element: 'golpe', extra: [{ label: 'Remate', value: 3 }] };
}

/** An ally close enough to throw the ball: anyone on your side who is not an object. */
function alleyHelper(state: GameState, a: Entity, target: Entity): Entity | undefined {
  return Object.values(state.entities).find(
    (e) => e.id !== a.id && standing(e) && isCreature(e) && !isHostile(e, a) && gridDistance(e.position, a.position) <= 5 && gridDistance(e.position, target.position) <= 6,
  );
}

// --- Traits that react to damage ------------------------------------------------------------------

let exploding = false;
/** Riesgo laboral: fire damage may set off the gas bottle on the Butanero's back. */
damageHooks.push((r, targetId, _amount, element) => {
  const target = r.entity(targetId);
  if (exploding || element !== 'fuego' || !hasTrait(target, 'riesgo-laboral') || hasTrait(target, 'valvula-de-seguridad-off')) return;
  const odds = hasTrait(target, 'valvula-de-seguridad') ? 10 : 20;
  if (r.rng.die(100) > odds) return;
  exploding = true;
  try {
    r.emit({ type: 'traitTriggered', entityId: targetId, rasgo: 'riesgo-laboral' } as WillyEvent);
    for (const v of creaturesIn(r.state, areaTiles(r.state, target.position, 1))) dealDamage(r, v.id, rollDice(r.rng, dice('1d6')), 'fuego', targetId, 'explosion');
  } finally {
    exploding = false;
  }
});

// --- Listing, preview, perform ------------------------------------------------------------------------

const BASIC_LABELS: Record<string, { label: string; description: string }> = {
  'basic:golpe': { label: 'Golpe', description: 'Atacas con lo que lleves en la mano.' },
  'basic:empujar': { label: 'Empujar', description: 'Prueba de Fuerza: si sale bien, lo mueves una casilla. Contra un muro, contra otro o al vacío.' },
  'basic:correr': { label: 'Correr', description: 'Otro movimiento completo este turno.' },
  'basic:ganso': { label: 'Hacer el ganso', description: 'No sirve para nada. Al público le encanta.' },
  'basic:liberarse': { label: 'Liberarse', description: 'Prueba de Fuerza (DIF 13) para soltarte de la red o del papeleo.' },
};

function abilityCost(state: GameState, actor: Entity, data: AbilityData): Record<string, number> {
  // Abilities whose cost changes per level (the 5G line) carry it in niveles[n].coste.
  const perLevel = (data.niveles?.[String(skillLevel(actor, data.id))] as { coste?: AbilityData['coste'] } | undefined)?.coste;
  const base = perLevel ?? data.coste;
  const cost: Record<string, number> = { acciones: base?.acciones ?? 1 };
  let energy = base?.energia ?? 0;
  // Funcionario: after two o'clock everything costs a bit more.
  if (classOf(actor) === 'funcionario' && afterHours(state, actor)) energy += 1;
  if (energy > 0) cost.energia = energy;
  return cost;
}

function displayName(actor: Entity, data: AbilityData): string {
  const byLevel = data.nombresPorNivel?.[String(skillLevel(actor, data.id))];
  return byLevel ?? data.nombre;
}

/** Other sources of actions (companions register theirs here, avoiding an import cycle). */
export const extraActionSources: ((state: GameState, e: Entity) => ActionDef[])[] = [];

export function listActions(state: GameState, actorId: string): ActionDef[] {
  const e = state.entities[actorId];
  if (!e || !standing(e)) return [];
  const out: ActionDef[] = [];
  for (const [id, meta] of Object.entries(BASIC_LABELS)) {
    if (id === 'basic:liberarse' && !hasCondition(e, 'enredado')) continue;
    const h = HANDLERS[id]!;
    const base = handlerTarget(h, e, state);
    const target = id === 'basic:golpe' ? { ...base, range: reachOf(e) } : base;
    out.push({ id, label: meta.label, description: meta.description, cost: { acciones: 1 }, target, tags: h.tags });
  }
  for (const source of extraActionSources) out.push(...source(state, e));
  const cls = CLASSES[classOf(e) ?? ''];
  if (!cls) return out;
  for (const data of cls.habilidades) {
    if (data.pasiva || data.nivelPersonaje > level(e)) continue;
    const h = HANDLERS[`hab:${data.id}`];
    if (!h || h.pending) continue;
    out.push({ id: `hab:${data.id}`, label: displayName(e, data), description: levelText(e, data), cost: abilityCost(state, e, data), target: handlerTarget(h, e, state), tags: ['ability', ...h.tags] });
  }
  return out;
}

export function previewAction(state: GameState, actorId: string, actionId: string, target: ActionTarget): ActionPreview {
  const actor = state.entities[actorId];
  const h = HANDLERS[actionId];
  if (!actor || !h) return invalid('Acción desconocida.');
  if (actionId.startsWith('hab:') && !abilityData(classOf(actor), actionId.slice(4))) return invalid('No es una habilidad de tu clase.');
  const aimed = targetEntity(state, target);
  // The same generic checks the engine does, so previews (and the AI) never accept what `act` refuses.
  const base = handlerTarget(h, actor, state);
  const spec = actionId === 'basic:golpe' ? { ...base, range: reachOf(actor) } : base;
  if (spec.kind === 'creature') {
    if (!aimed) return invalid('Elige un objetivo.');
    if (spec.filter === 'hostile' && !isHostile(actor, aimed)) return invalid('Tiene que ser un enemigo.');
    if (spec.filter === 'ally' && isHostile(actor, aimed)) return invalid('Tiene que ser de los tuyos.');
    if (gridDistance(actor.position, aimed.position) > spec.range) return invalid('Fuera de alcance.');
  }
  if (spec.kind === 'tile') {
    if (!target.tile) return invalid('Elige una casilla.');
    if (gridDistance(actor.position, target.tile) > spec.range) return invalid('Fuera de alcance.');
  }
  if (aimed && aimed.id !== actorId && isHostile(aimed, actor) && hasCondition(aimed, 'escondido')) return invalid('No lo ves: está escondido.');
  if (aimed && aimed.id !== actorId && hasCondition(aimed, 'encajado')) return invalid('Está dentro de una caja invisible: no se le puede tocar.');
  if (hasCondition(actor, 'silenciado') && actionId.startsWith('hab:')) return invalid('Silencio administrativo: no puedes usar habilidades.');
  return h.preview(state, actor, target);
}

export function performAction(ruleset: Ruleset, state: GameState, actorId: string, actionId: string, target: ActionTarget, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  r.actionTarget = { ...(target.entityId ? { entityId: target.entityId } : {}), ...(target.tile ? { tile: { ...target.tile } } : {}) };
  HANDLERS[actionId]?.perform(r, actorId, target);
  // Companion abilities have no use counter: announce them here.
  if (actionId.startsWith('comp:')) r.emit({ type: 'skillUsed', entityId: actorId, habilidad: actionId.slice(5) } as WillyEvent);
  // The ability's announcement goes first, so the client plays its FX before the rolls it causes.
  const first = r.events.findIndex((e) => e.type === 'skillUsed' && (e as WillyEvent).entityId === actorId);
  if (first > 0) r.events.unshift(...r.events.splice(first, 1));
  // Remember the last ability used (the Bardo's «¡Otra, otra!» and «Repertorio corto»).
  if (actionId.startsWith('hab:') && actionId !== 'hab:bis') r.apply({ type: 'setFlag', flag: lastAbilityFlag(actorId), value: `${actionId}|${JSON.stringify(target)}` });
  return r.outcome();
}

export const lastAbilityFlag = (actorId: string) => `willy:ultima:${actorId}`;

export function handlerTarget(h: Handler, actor: Entity, state: GameState): ActionDef['target'] {
  return typeof h.target === 'function' ? h.target(actor, state) : h.target;
}

/** Text for the current level of abilities with per-level texts (the 5G line). */
function levelText(actor: Entity, data: AbilityData): string {
  if (data.textoSinEstrenar && !actor.tags.includes(`estrenado:${data.id}`) && (actor.resources[`uso:${data.id}`]?.current ?? 0) === 0) return data.textoSinEstrenar;
  const entry = data.niveles?.[String(skillLevel(actor, data.id))] as { texto?: string } | undefined;
  return typeof entry === 'object' && entry?.texto ? entry.texto : data.texto;
}

export { damageBonus, HANDLERS };
