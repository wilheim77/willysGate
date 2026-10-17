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
  surfaceAt,
  tileAt,
} from '../../engine';
import { classOf, damageBonus, hasTrait, isBig, isBoss, level, skillLevel } from './character';
import { type AbilityData, CLASSES, abilityData } from './data';
import { type Dice, averageDice, formatDice, parseDice, rollDice } from './dice';
import {
  type AttackSpec,
  Resolver,
  type WillyEvent,
  attackPreview,
  chanceD20,
  countUse,
  damageHooks,
  dealDamage,
  fallDamage,
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

interface Handler {
  target: ActionDef['target'];
  tags: string[];
  /** Hidden until the engine supports it (summons need spawnEntity: ENGINE_REQUESTS R13). */
  pending?: boolean;
  preview(state: GameState, actor: Entity, target: ActionTarget): ActionPreview;
  perform(r: Resolver, actorId: string, target: ActionTarget): void;
}

const invalid = (reason: string): ActionPreview => ({ valid: false, reason });
const dice = (text: string): Dice => parseDice(text);

function targetEntity(state: GameState, target: ActionTarget): Entity | undefined {
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

function creaturesIn(state: GameState, tiles: Vec2[]): Entity[] {
  const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
  return Object.values(state.entities).filter((e) => standing(e) && keys.has(`${e.position.x},${e.position.y}`));
}

function hostilesAround(state: GameState, actor: Entity, centre: Vec2, radius: number): Entity[] {
  return Object.values(state.entities).filter((e) => standing(e) && isCreature(e) && isHostile(e, actor) && gridDistance(e.position, centre) <= radius);
}

/** Straight line (row, column or diagonal) between two tiles, excluding both ends. */
function straightLine(a: Vec2, b: Vec2): Vec2[] | null {
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

function occupiedBy(state: GameState, p: Vec2, exceptId?: string): Entity | undefined {
  return Object.values(state.entities).find((e) => e.id !== exceptId && e.position.x === p.x && e.position.y === p.y && standing(e));
}

const lowCeiling = (state: GameState, p: Vec2) => (tileAt(state.map, p)?.terrain ?? '').includes('techo-bajo');

// --- Generic attack and area helpers -------------------------------------------------------

function attackPreviewOf(state: GameState, spec: AttackSpec, extra: Partial<ActionPreview> = {}): ActionPreview {
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
  const expected = victims.filter((v) => isHostile(v, actor)).reduce((s) => s + averageDice(d), 0);
  return { valid: true, chance: 1, expectedDamage: expected, affectedTiles: tiles, breakdown: [{ label: 'Daño en el área', value: formatDice(d) }] };
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

interface JumpRules {
  maxLength: number;
  maxUp: number;
  safeDown: number;
  overEntities?: boolean;
}

/** Can `actor` jump to `to`? A straight line, over gaps but not through walls or (usually) creatures. */
function jumpCheck(state: GameState, actor: Entity, to: Vec2, rules: JumpRules): string | null {
  if (lowCeiling(state, actor.position) || lowCeiling(state, to)) return 'Techo bajo: aquí no se puede saltar.';
  const line = straightLine(actor.position, to);
  if (!line) return 'Solo se salta en línea recta.';
  const dist = gridDistance(actor.position, to);
  if (dist === 0 || dist > rules.maxLength) return 'Demasiado lejos para saltar.';
  const land = tileAt(state.map, to);
  if (!land || !land.walkable) return 'No se puede aterrizar ahí.';
  if (occupiedBy(state, to, actor.id)) return 'La casilla de llegada está ocupada.';
  const h0 = heightOf(state, actor.position);
  if (land.height - h0 > rules.maxUp) return 'Demasiado alto para saltar.';
  const top = Math.max(h0, land.height);
  for (const p of line) {
    const t = tileAt(state.map, p);
    if (!t) return 'Fuera del mapa.';
    const isGap = !t.walkable && (t.terrain === 'void' || t.terrain === 'vacio' || t.terrain === 'foso');
    if (!t.walkable && !isGap && t.height > top) return 'Hay un muro en medio.';
    if (!rules.overEntities && occupiedBy(state, p, actor.id)) return 'Hay alguien en medio.';
  }
  return null;
}

function crossesGap(state: GameState, from: Vec2, to: Vec2): boolean {
  return (straightLine(from, to) ?? []).some((p) => {
    const t = tileAt(state.map, p);
    return !!t && (!t.walkable || t.height < Math.min(heightOf(state, from), heightOf(state, to)) - 1);
  });
}

function doJump(r: Resolver, actorId: string, to: Vec2, rules: JumpRules): void {
  const actor = r.entity(actorId);
  const from = { ...actor.position };
  const drop = heightOf(r.state, from) - heightOf(r.state, to);
  r.apply({ type: 'setPosition', entityId: actorId, position: to }, { type: 'applyCondition', entityId: actorId, condition: 'salto', remainingTurns: 1 });
  r.emit({ type: 'jumped', entityId: actorId, from, to, subida: -drop, cruzaVacio: crossesGap(r.state, from, to) } as WillyEvent);
  if (drop > rules.safeDown) fallDamage(r, actorId, drop - rules.safeDown + 1);
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

function shoveBonus(actor: Entity): number {
  const lvl = skillLevel(actor, 'empujar');
  return (actor.stats.fue ?? 5) + (lvl >= 4 ? 4 : lvl >= 2 ? 2 : 0) + (hasCondition(actor, 'compulsado') ? 2 : 0);
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
      return { valid: true, chance, breakdown: [{ label: 'Fuerza', value: `+${shoveBonus(a)}` }, { label: 'DIF', value: String(shoveDif(target)), term: 'dif' }] };
    },
    perform: (r, id, t) => {
      const actor = r.entity(id);
      const target = r.entity(t.entityId!);
      const roll = rollSave(r, id, 'fue', shoveDif(target) - shoveBonus(actor) + (actor.stats.fue ?? 5));
      if (!roll) return;
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
      return attackPreviewOf(s, chargeSpec(a, target.id));
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
  'hab:ventanilla-cerrada': { target: { kind: 'tile', range: 3 }, tags: ['control'], pending: true, preview: () => invalid('Pendiente del motor.'), perform: () => {} },
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
      if (gridDistance(a.position, target.position) > (skillLevel(a, 'pase-picado') >= 2 ? 6 : 5)) return invalid('Demasiado lejos.');
      if (!hasLineOfSight(s, a.position, target.position)) return invalid('No hay línea de visión (los rebotes llegarán con el motor).');
      return attackPreviewOf(s, passSpec(a, target.id));
    },
    perform: (r, id, t) => {
      const me = r.entity(id);
      const res = resolveAttack(r, passSpec(me, t.entityId!));
      if (res.hit) {
        pushEntity(r, t.entityId!, me.position, 1, id);
        countUse(r, id, 'pase-picado');
      }
    },
  },
  'hab:tiempo-muerto': { target: { kind: 'tile', range: 1 }, tags: ['summon'], pending: true, preview: () => invalid('Pendiente del motor.'), perform: () => {} },
  'hab:alley-oop': {
    target: { kind: 'creature', range: 5, filter: 'hostile' },
    tags: ['attack', 'melee', 'jump', 'push'],
    preview: (s, a, t) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿Sobre quién rematas?');
      const rules = { maxLength: skillLevel(a, 'alley-oop') >= 2 ? 5 : 4, maxUp: 3, safeDown: 4 };
      if (!landingNear(s, a, target, rules)) return invalid('No hay dónde aterrizar junto al objetivo.');
      return attackPreviewOf(s, alleySpec(a, target.id));
    },
    perform: (r, id, t) => {
      const me = r.entity(id);
      const target = r.entity(t.entityId!);
      const rules = { maxLength: skillLevel(me, 'alley-oop') >= 2 ? 5 : 4, maxUp: 3, safeDown: 4 };
      const land = landingNear(r.state, me, target, rules);
      if (!land) return;
      if (land.x !== me.position.x || land.y !== me.position.y) doJump(r, id, land, rules);
      const res = resolveAttack(r, alleySpec(r.entity(id), target.id));
      if (!res.hit) return;
      if (standing(r.entity(target.id))) r.apply({ type: 'applyCondition', entityId: target.id, condition: 'tumbado', remainingTurns: 1 });
      for (const o of hostilesAround(r.state, r.entity(id), r.entity(target.id).position, 1)) if (o.id !== target.id) pushEntity(r, o.id, r.entity(target.id).position, 2, id);
      countUse(r, id, 'alley-oop');
      r.emit({ type: 'skillUsed', entityId: id, habilidad: 'alley-oop', asistente: null } as WillyEvent);
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

function passSpec(a: Entity, targetId: string): AttackSpec {
  return { attackerId: a.id, targetId, label: 'Pase picado', melee: false, dice: dice(skillLevel(a, 'pase-picado') >= 4 ? '1d8' : '1d6'), element: 'golpe' };
}

function alleySpec(a: Entity, targetId: string): AttackSpec {
  // Without a teammate it is an "auto-alley-oop" off the wall: half of 2d8, i.e. 1d8 (summons pending in the engine).
  return { attackerId: a.id, targetId, label: 'Alley-oop', melee: true, dice: dice(skillLevel(a, 'alley-oop') >= 4 ? '1d10' : '1d8'), element: 'golpe', extra: [{ label: 'Remate', value: 3 }] };
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
};

function abilityCost(state: GameState, actor: Entity, data: AbilityData): Record<string, number> {
  const cost: Record<string, number> = { acciones: data.coste?.acciones ?? 1 };
  let energy = data.coste?.energia ?? 0;
  // Funcionario: after two o'clock everything costs a bit more.
  if (classOf(actor) === 'funcionario' && afterHours(state, actor)) energy += 1;
  if (energy > 0) cost.energia = energy;
  return cost;
}

function displayName(actor: Entity, data: AbilityData): string {
  const byLevel = data.nombresPorNivel?.[String(skillLevel(actor, data.id))];
  return byLevel ?? data.nombre;
}

export function listActions(state: GameState, actorId: string): ActionDef[] {
  const e = state.entities[actorId];
  if (!e || !standing(e)) return [];
  const out: ActionDef[] = [];
  for (const [id, meta] of Object.entries(BASIC_LABELS)) {
    const h = HANDLERS[id]!;
    const target = id === 'basic:golpe' ? { ...h.target, range: reachOf(e) } : h.target;
    out.push({ id, label: meta.label, description: meta.description, cost: { acciones: 1 }, target, tags: h.tags });
  }
  const cls = CLASSES[classOf(e) ?? ''];
  if (!cls) return out;
  for (const data of cls.habilidades) {
    if (data.pasiva || data.nivelPersonaje > level(e)) continue;
    const h = HANDLERS[`hab:${data.id}`];
    if (!h || h.pending) continue;
    out.push({ id: `hab:${data.id}`, label: displayName(e, data), description: data.texto, cost: abilityCost(state, e, data), target: h.target, tags: ['ability', ...h.tags] });
  }
  return out;
}

export function previewAction(state: GameState, actorId: string, actionId: string, target: ActionTarget): ActionPreview {
  const actor = state.entities[actorId];
  const h = HANDLERS[actionId];
  if (!actor || !h) return invalid('Acción desconocida.');
  if (actionId.startsWith('hab:') && !abilityData(classOf(actor), actionId.slice(4))) return invalid('No es una habilidad de tu clase.');
  const aimed = targetEntity(state, target);
  if (aimed && aimed.id !== actorId && isHostile(aimed, actor) && hasCondition(aimed, 'escondido')) return invalid('No lo ves: está escondido.');
  if (hasCondition(actor, 'silenciado') && actionId.startsWith('hab:')) return invalid('Silencio administrativo: no puedes usar habilidades.');
  return h.preview(state, actor, target);
}

export function performAction(ruleset: Ruleset, state: GameState, actorId: string, actionId: string, target: ActionTarget, rng: RngCursor): ActionOutcome {
  const r = new Resolver(ruleset, state, rng);
  HANDLERS[actionId]?.perform(r, actorId, target);
  return r.outcome();
}

export { damageBonus, HANDLERS };
