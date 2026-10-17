import { type ActionTarget, type Entity, type GameState, type Vec2, gridDistance, hasCondition, isHostile, surfaceAt, tileAt } from '../../engine';
import {
  HANDLERS,
  type Handler,
  areaTiles,
  attackPreviewOf,
  creaturesIn,
  dice,
  doJump,
  hostilesAround,
  invalid,
  jumpCheck,
  lastAbilityFlag,
  pushExpectedDamage,
  targetEntity,
  withPushBonus,
} from './actions';
import { hasTrait, isBoss, skillLevel } from './character';
import { rollDice } from './dice';
import { type AttackSpec, Resolver, type WillyEvent, chanceD20, countUse, dealDamage, heal, pushEntity, resolveAttack, rollSave, saveBonus, standing } from './resolve';

/**
 * Influencer, Bardo de verbena, Socorrista, Tasador, Mimo and Ingeniero.
 * Summons and temporary walls live in summons.ts.
 */

const pending = (tags: string[] = []): Handler => ({ target: { kind: 'self', range: 0 }, tags, pending: true, preview: () => invalid('Pendiente del motor.'), perform: () => {} });

const DIRS: Vec2[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

function directionTo(from: Vec2, to: Vec2): Vec2 {
  return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

/** A 90° cone of `length` tiles from `origin` towards `toward`. */
export function coneTiles(state: GameState, origin: Vec2, toward: Vec2, length: number): Vec2[] {
  const d = directionTo(origin, toward);
  if (!d.x && !d.y) return [];
  return areaTiles(state, origin, length).filter((p) => {
    const vx = p.x - origin.x;
    const vy = p.y - origin.y;
    if (!vx && !vy) return false;
    if (d.x && d.y) return vx * d.x >= 0 && vy * d.y >= 0;
    if (d.x) return vx * d.x > 0 && Math.abs(vy) <= vx * d.x;
    return vy * d.y > 0 && Math.abs(vx) <= vy * d.y;
  });
}

/** Tiles in a straight line from `origin` towards `toward` (8 directions), up to `length`, stopping at walls. */
export function lineTiles(state: GameState, origin: Vec2, toward: Vec2, length: number): Vec2[] {
  const d = directionTo(origin, toward);
  const out: Vec2[] = [];
  for (let i = 1; i <= length && (d.x || d.y); i++) {
    const p = { x: origin.x + d.x * i, y: origin.y + d.y * i };
    const t = tileAt(state.map, p);
    if (!t || (!t.walkable && t.terrain !== 'void')) break;
    out.push(p);
  }
  return out;
}

function hostilesOn(state: GameState, actor: Entity, tiles: Vec2[]): Entity[] {
  return creaturesIn(state, tiles).filter((e) => isHostile(e, actor));
}

/** «Repertorio corto»: the same song twice in a row lasts a turn less. */
function songTurns(r: Resolver, actorId: string, abilityId: string, base: number): number {
  const last = String(r.state.flags[lastAbilityFlag(actorId)] ?? '');
  if (!last.startsWith(`hab:${abilityId}|`) || !hasTrait(r.entity(actorId), 'repertorio-corto')) return base;
  if (skillLevel(r.entity(actorId), 'bis') >= 5 && hasCondition(r.entity(actorId), 'bis-activo')) return base;
  r.emit({ type: 'traitTriggered', entityId: actorId, rasgo: 'repertorio-corto' } as WillyEvent);
  return Math.max(1, base - 1);
}

const withinRange = (a: Entity, t: Entity, range: number) => gridDistance(a.position, t.position) <= range;

Object.assign(HANDLERS, {
  // ---- Influencer ----
  'hab:flash-del-selfie': {
    target: { kind: 'tile', range: 4 },
    tags: ['control', 'area'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      if (!t.tile) return invalid('¿Hacia dónde haces la foto?');
      const tiles = coneTiles(s, a.position, t.tile, skillLevel(a, 'flash-del-selfie') >= 2 ? 4 : 3);
      return { valid: true, affectedTiles: tiles, chance: 1 };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'flash-del-selfie');
      const victims = hostilesOn(r.state, me, coneTiles(r.state, me.position, t.tile!, lvl >= 2 ? 4 : 3));
      for (const v of victims) {
        r.apply({ type: 'applyCondition', entityId: v.id, condition: 'cegado', remainingTurns: lvl >= 3 ? 2 : 1 });
        if (lvl >= 4) dealDamage(r, v.id, rollDice(r.rng, dice('1d4')), 'golpe', id, 'verguenza');
        if (lvl >= 5 && standing(r.entity(v.id))) r.apply({ type: 'applyCondition', entityId: v.id, condition: 'mareado', remainingTurns: 1 });
      }
      if (victims.length) countUse(r, id, 'flash-del-selfie');
    },
  },
  'hab:viral': {
    target: { kind: 'self', range: 0 },
    tags: ['buff', 'audience'],
    preview: () => ({ valid: true }),
    perform: (r: Resolver, id: string) => {
      const lvl = skillLevel(r.entity(id), 'viral');
      // The audience system reads it: the next spectacular moment is worth ×3 (×4 at level 4).
      r.apply({ type: 'applyCondition', entityId: id, condition: 'viral' });
      if (lvl >= 3) heal(r, id, 5);
      countUse(r, id, 'viral');
      r.emit({ type: 'skillUsed', entityId: id, habilidad: 'viral', multiplicador: lvl >= 4 ? 4 : 3, momentos: lvl >= 2 ? 2 : 1 } as WillyEvent);
    },
  },
  'hab:cancelacion': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['control'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿A quién cancelas?');
      const lvl = skillLevel(a, 'cancelacion');
      if (!withinRange(a, target, lvl >= 2 ? 6 : 4)) return invalid('Demasiado lejos.');
      if (isBoss(target) && lvl < 5) return invalid('A los jefes no se les cancela tan fácil.');
      return { valid: true, chance: 1 };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'cancelacion');
      const main = r.entity(t.entityId!);
      const victims = [main, ...(lvl >= 3 ? hostilesAround(r.state, me, main.position, 1).filter((e) => e.id !== main.id) : [])];
      for (const v of victims) {
        for (const c of ['animado', 'compulsado', 'afortunado', 'protegidoFuego', 'pasodoble', 'viral']) r.apply({ type: 'removeCondition', entityId: v.id, condition: c });
        r.apply({ type: 'applyCondition', entityId: v.id, condition: 'asustado', sourceId: id, remainingTurns: isBoss(v) ? 2 : lvl >= 4 ? 4 : 3 });
      }
      countUse(r, id, 'cancelacion');
    },
  },

  // ---- Bardo de verbena ----
  'hab:paquito': {
    target: { kind: 'self', range: 0 },
    tags: ['control', 'area', 'song'],
    preview: (s: GameState, a: Entity) => ({ valid: true, affectedTiles: areaTiles(s, a.position, skillLevel(a, 'paquito') >= 2 ? 3 : 2) }),
    perform: (r: Resolver, id: string) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'paquito');
      const turns = songTurns(r, id, 'paquito', lvl >= 4 ? 3 : 2);
      const victims = hostilesAround(r.state, me, me.position, lvl >= 2 ? 3 : 2);
      for (const v of victims) r.apply({ type: 'applyCondition', entityId: v.id, condition: 'bailando', sourceId: id, remainingTurns: turns });
      if (victims.length) countUse(r, id, 'paquito');
    },
  },
  'hab:pasodoble': {
    target: { kind: 'self', range: 0 },
    tags: ['buff', 'song'],
    preview: () => ({ valid: true }),
    perform: (r: Resolver, id: string) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'pasodoble');
      const turns = songTurns(r, id, 'pasodoble', lvl >= 4 ? 4 : 3);
      const who = [me, ...(lvl >= 3 ? Object.values(r.state.entities).filter((e) => e.id !== id && standing(e) && !isHostile(e, me) && gridDistance(e.position, me.position) <= 2) : [])];
      for (const w of who) r.apply({ type: 'applyCondition', entityId: w.id, condition: 'animado', remainingTurns: turns }, { type: 'applyCondition', entityId: w.id, condition: 'pasodoble', remainingTurns: turns });
      countUse(r, id, 'pasodoble');
    },
  },
  'hab:cancion-del-verano': {
    target: { kind: 'self', range: 0 },
    tags: ['control', 'area', 'song'],
    preview: (s: GameState, a: Entity) => ({ valid: true, affectedTiles: areaTiles(s, a.position, skillLevel(a, 'cancion-del-verano') >= 2 ? 4 : 3) }),
    perform: (r: Resolver, id: string) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'cancion-del-verano');
      const turns = songTurns(r, id, 'cancion-del-verano', lvl >= 3 ? 3 : 2);
      const victims = hostilesAround(r.state, me, me.position, lvl >= 2 ? 4 : 3);
      for (const v of victims) {
        r.apply({ type: 'applyCondition', entityId: v.id, condition: 'mareado', remainingTurns: turns });
        if (lvl >= 4 && (v.resources.acciones?.current ?? 0) > 0) r.apply({ type: 'modifyResource', entityId: v.id, resource: 'acciones', delta: -1 });
      }
      if (victims.length) countUse(r, id, 'cancion-del-verano');
    },
  },
  'hab:bis': {
    target: { kind: 'self', range: 0 },
    tags: ['song'],
    preview: (s: GameState, a: Entity) => {
      const last = String(s.flags[lastAbilityFlag(a.id)] ?? '');
      if (!last) return invalid('Todavía no has tocado nada que repetir.');
      const [actionId, rawTarget] = last.split('|') as [string, string];
      const h = HANDLERS[actionId];
      if (!h || actionId === 'hab:bis') return invalid('Eso no se puede repetir.');
      return h.preview(s, a, JSON.parse(rawTarget) as ActionTarget);
    },
    perform: (r: Resolver, id: string) => {
      const [actionId, rawTarget] = String(r.state.flags[lastAbilityFlag(id)]).split('|') as [string, string];
      r.apply({ type: 'applyCondition', entityId: id, condition: 'bis-activo', remainingTurns: 1 });
      HANDLERS[actionId]!.perform(r, id, JSON.parse(rawTarget) as ActionTarget);
      r.apply({ type: 'removeCondition', entityId: id, condition: 'bis-activo' });
      countUse(r, id, 'bis');
    },
  },
  'hab:orquesta-completa': {
    target: { kind: 'self', range: 0 },
    tags: ['control', 'heal', 'song'],
    preview: () => ({ valid: true }),
    perform: (r: Resolver, id: string) => {
      const me = r.entity(id);
      const turns = songTurns(r, id, 'orquesta-completa', skillLevel(me, 'orquesta-completa') >= 2 ? 4 : 3);
      r.apply({ type: 'applyCondition', entityId: id, condition: 'orquesta', remainingTurns: turns });
      for (const v of hostilesAround(r.state, me, me.position, 6)) r.apply({ type: 'applyCondition', entityId: v.id, condition: 'bailando', sourceId: id, remainingTurns: 1 });
      countUse(r, id, 'orquesta-completa');
    },
  },

  // ---- Socorrista ----
  'hab:rescate': {
    target: { kind: 'creature', range: 5, filter: 'any' },
    tags: ['control', 'pull'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t);
      if (!target || target.id === a.id) return invalid('¿A quién rescatas?');
      if (!withinRange(a, target, skillLevel(a, 'rescate') >= 2 ? 5 : 4)) return invalid('Demasiado lejos.');
      if (hasTrait(target, 'plaza-en-propiedad')) return invalid('No hay quien lo mueva de ahí.');
      return { valid: true, chance: 1 };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const target = r.entity(t.entityId!);
      const res = pushEntity(r, target.id, me.position, -Math.min(3, gridDistance(me.position, target.position) - 1), id);
      if (!isHostile(target, me) && skillLevel(me, 'rescate') >= 4) heal(r, target.id, 3);
      if (res.moved > 0) countUse(r, id, 'rescate');
    },
  },
  'hab:silbatazo': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['control'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿A quién le pitas?');
      if (!withinRange(a, target, 4)) return invalid('Demasiado lejos para el silbato.');
      if (isBoss(target)) return invalid('Los jefes no hacen caso al silbato.');
      if (surfaceAt(s, target.position)?.type === 'agua') return { valid: true, chance: 1 };
      return { valid: true, chance: 1 - chanceD20(saveBonus(target, 'agu'), whistleDif(a)) };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'silbatazo');
      const targets = new Set([t.entityId!]);
      if (lvl >= 3) for (const e of hostilesAround(r.state, me, me.position, 6)) if (surfaceAt(r.state, e.position)?.type === 'agua' && !isBoss(e)) targets.add(e.id);
      let any = false;
      for (const tid of targets) {
        const inWater = surfaceAt(r.state, r.entity(tid).position)?.type === 'agua';
        if (!inWater && rollSave(r, tid, 'agu', whistleDif(me))) continue;
        r.apply({ type: 'applyCondition', entityId: tid, condition: 'aturdido', remainingTurns: 1 });
        if (lvl >= 5 && inWater) r.apply({ type: 'applyCondition', entityId: tid, condition: 'enredado' });
        any = true;
      }
      if (any) countUse(r, id, 'silbatazo');
    },
  },
  'hab:boya': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['attack', 'ranged', 'push'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿A quién le lanzas la boya?');
      return withPushBonus(s, attackPreviewOf(s, buoySpec(a, target.id)), target.id, a.position, skillLevel(a, 'boya') >= 2 ? 3 : 2);
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'boya');
      const res = resolveAttack(r, buoySpec(me, t.entityId!));
      if (!res.hit) return;
      const at = { ...r.entity(t.entityId!).position };
      pushEntity(r, t.entityId!, me.position, lvl >= 2 ? 3 : 2, id);
      if (lvl >= 3) r.apply({ type: 'spawnSurface', tiles: [at], surface: 'agua' });
      countUse(r, id, 'boya');
    },
  },
  'hab:reanimacion': {
    target: { kind: 'creature', range: 1, filter: 'ally' },
    tags: ['heal'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t) ?? a;
      const used = Number(s.flags[reviveFlag(a.id, s.map.id)] ?? 0);
      if (used >= (skillLevel(a, 'reanimacion') >= 3 ? 2 : 1)) return invalid('Ya has reanimado en esta planta.');
      const max = target.resources.vida?.max ?? 0;
      return { valid: true, expectedHealing: Math.floor(max * (skillLevel(a, 'reanimacion') >= 4 ? 2 / 3 : 1 / 2)) };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'reanimacion');
      const target = r.entity(t.entityId ?? id);
      heal(r, target.id, Math.floor((target.resources.vida?.max ?? 0) * (lvl >= 4 ? 2 / 3 : 1 / 2)));
      if (lvl >= 2) for (const c of ['envenenado', 'ardiendo', 'mareado', 'cegado', 'asustado']) r.apply({ type: 'removeCondition', entityId: target.id, condition: c });
      const flag = reviveFlag(id, r.state.map.id);
      r.apply({ type: 'setFlag', flag, value: Number(r.state.flags[flag] ?? 0) + 1 });
      countUse(r, id, 'reanimacion');
    },
  },
  'hab:bandera-roja': {
    target: { kind: 'self', range: 0 },
    tags: ['control', 'area', 'push', 'surface'],
    preview: (s: GameState, a: Entity) => ({ valid: true, affectedTiles: areaTiles(s, a.position, skillLevel(a, 'bandera-roja') >= 2 ? 4 : 3) }),
    perform: (r: Resolver, id: string) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'bandera-roja');
      const radius = lvl >= 2 ? 4 : 3;
      r.apply({ type: 'applyElement', tiles: areaTiles(r.state, me.position, radius), element: 'agua' });
      for (const v of hostilesAround(r.state, me, me.position, radius)) {
        pushEntity(r, v.id, me.position, lvl >= 3 ? 3 : 2, id);
        if (lvl >= 4 && standing(r.entity(v.id))) r.apply({ type: 'applyCondition', entityId: v.id, condition: 'tumbado', remainingTurns: 1 });
      }
      if (lvl >= 5) r.apply({ type: 'spawnSurface', tiles: areaTiles(r.state, me.position, radius + 1).filter((p) => gridDistance(p, me.position) === radius + 1), surface: 'toxico' });
      countUse(r, id, 'bandera-roja');
    },
  },

  // ---- Tasador ----
  'hab:ojo-clinico': {
    target: { kind: 'creature', range: 8, filter: 'hostile' },
    tags: ['buff'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => (targetEntity(s, t) ? { valid: true } : invalid('¿Qué pieza estudias?')),
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      r.apply({ type: 'applyCondition', entityId: t.entityId!, condition: 'estudiado', sourceId: id });
      countUse(r, id, 'ojo-clinico');
    },
  },
  // Needs item values from the game's items.json (the ruleset never reads content/): wired in by the game later.
  'hab:golpe-de-valor': pending(['attack', 'ranged']),
  'hab:pieza-de-museo': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['control'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿Qué pieza petrificas?');
      const lvl = skillLevel(a, 'pieza-de-museo');
      if (!withinRange(a, target, lvl >= 3 ? 6 : 4)) return invalid('Demasiado lejos.');
      if (isBoss(target) && lvl < 5) return invalid('Los jefes no se dejan tasar.');
      return { valid: true, chance: 1 };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const lvl = skillLevel(r.entity(id), 'pieza-de-museo');
      const target = r.entity(t.entityId!);
      r.apply({ type: 'applyCondition', entityId: target.id, condition: 'petrificado', remainingTurns: isBoss(target) ? 1 : lvl >= 2 ? 3 : 2 });
      countUse(r, id, 'pieza-de-museo');
    },
  },

  // ---- Mimo ----
  'hab:cuerda-imaginaria': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['control', 'pull'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿De quién tiras?');
      if (!withinRange(a, target, skillLevel(a, 'cuerda-imaginaria') >= 4 ? 6 : 4)) return invalid('La cuerda no llega.');
      const pull = Math.min(skillLevel(a, 'cuerda-imaginaria') >= 2 ? 3 : 2, gridDistance(a.position, target.position) - 1);
      return { valid: true, chance: 1, expectedDamage: pushExpectedDamage(s, target.id, a.position, -pull) };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const target = r.entity(t.entityId!);
      const pull = Math.min(skillLevel(me, 'cuerda-imaginaria') >= 2 ? 3 : 2, gridDistance(me.position, target.position) - 1);
      const res = pushEntity(r, target.id, me.position, -pull, id);
      if (res.moved > 0 || res.collided) countUse(r, id, 'cuerda-imaginaria');
    },
  },
  'hab:caja-invisible': {
    target: { kind: 'creature', range: 6, filter: 'hostile' },
    tags: ['control'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t);
      if (!target) return invalid('¿A quién encierras?');
      if (!withinRange(a, target, skillLevel(a, 'caja-invisible') >= 4 ? 6 : 4)) return invalid('Demasiado lejos.');
      if (isBoss(target)) return invalid('No hay caja tan grande.');
      return { valid: true, chance: 1 };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      r.apply({ type: 'applyCondition', entityId: t.entityId!, condition: 'encajado', remainingTurns: skillLevel(r.entity(id), 'caja-invisible') >= 2 ? 3 : 2 });
      countUse(r, id, 'caja-invisible');
    },
  },
  'hab:escalera-imaginaria': {
    target: { kind: 'tile', range: 1 },
    tags: ['move', 'climb'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      if (!t.tile) return invalid('¿Adónde subes?');
      const why = jumpCheck(s, a, t.tile, { maxLength: 1, maxUp: 99, safeDown: 99 });
      return why ? invalid(why.replace('saltar', 'subir')) : { valid: true };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      doJump(r, id, t.tile!, { maxLength: 1, maxUp: 99, safeDown: 99 });
      countUse(r, id, 'escalera-imaginaria');
    },
  },
  'hab:contra-el-viento': {
    target: { kind: 'tile', range: 8 },
    tags: ['control', 'push', 'area'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      if (!t.tile) return invalid('¿Hacia dónde sopla?');
      const tiles = lineTiles(s, a.position, t.tile, skillLevel(a, 'contra-el-viento') >= 2 ? 8 : 6);
      return { valid: true, affectedTiles: tiles };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'contra-el-viento');
      const dirs = lvl >= 5 ? DIRS.slice(0, 4).map((d) => ({ x: me.position.x + d.x, y: me.position.y + d.y })) : [t.tile!];
      for (const toward of dirs) {
        // Furthest first, so the ones in front are not blocked by the ones behind.
        const victims = hostilesOn(r.state, me, lineTiles(r.state, me.position, toward, lvl >= 2 ? 8 : 6)).sort((x, y) => gridDistance(y.position, me.position) - gridDistance(x.position, me.position));
        for (const v of victims) pushEntity(r, v.id, me.position, lvl >= 3 ? 4 : 3, id);
      }
      countUse(r, id, 'contra-el-viento');
    },
  },

  // ---- Ingeniero ----
  'hab:arco-voltaico': {
    target: { kind: 'tile', range: 5 },
    tags: ['attack', 'area', 'lightning'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      if (!t.tile) return invalid('¿Hacia dónde descargas?');
      const tiles = lineTiles(s, a.position, t.tile, arcLength(a));
      return { valid: true, chance: 1, affectedTiles: tiles, expectedDamage: hostilesOn(s, a, tiles).length * (skillLevel(a, 'arco-voltaico') >= 4 ? 5.5 : 4.5) };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const tiles = lineTiles(r.state, me.position, t.tile!, arcLength(me));
      const d = dice(skillLevel(me, 'arco-voltaico') >= 4 ? '1d10' : '1d8');
      const victims = creaturesIn(r.state, tiles);
      for (const v of victims) dealDamage(r, v.id, rollDice(r.rng, d), 'rayo', id, 'arco');
      const wet = tiles.filter((p) => surfaceAt(r.state, p)?.type === 'agua');
      if (wet.length) r.apply({ type: 'applyElement', tiles: wet, element: 'rayo' });
      if (victims.some((v) => isHostile(v, me))) countUse(r, id, 'arco-voltaico');
    },
  },
  'hab:red-g': {
    // The target changes with the level: nothing at 5G, one enemy at 6G, areas from 7G on.
    target: (a: Entity) => (skillLevel(a, 'red-g') === 2 ? { kind: 'creature', range: 4, filter: 'hostile' } : { kind: 'self', range: 0 }),
    tags: ['g'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const lvl = skillLevel(a, 'red-g');
      if (lvl === 2 && !targetEntity(s, t)) return invalid('¿A quién se le cuelga el vídeo?');
      if (lvl === 6 && s.flags[tenGFlag(a.id, s.map.id)]) return invalid('La señal absoluta solo una vez por planta.');
      // Before the first try it looks like a weapon; afterwards everyone knows.
      const tried = a.tags.includes(G_TRIED) || (a.resources['uso:red-g']?.current ?? 0) > 0;
      return { valid: true, ...(lvl === 1 ? { breakdown: [{ label: '5G', value: tried ? 'no hace nada' : 'rayo de 5G' }] } : {}) };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => performG(r, id, t),
  },
} satisfies Record<string, Handler>);

function whistleDif(a: Entity): number {
  const lvl = skillLevel(a, 'silbatazo');
  return lvl >= 4 ? 17 : lvl >= 2 ? 15 : 13;
}

function buoySpec(a: Entity, targetId: string): AttackSpec {
  return { attackerId: a.id, targetId, label: 'Boya', melee: false, dice: dice(skillLevel(a, 'boya') >= 4 ? '1d10' : '1d6'), element: 'golpe' };
}

const reviveFlag = (id: string, mapId: string) => `willy:reanimacion:${id}:${mapId}`;
/** Tag on an engineer who has pressed the 5G button at least once. */
export const G_TRIED = 'estrenado:red-g';
const tenGFlag = (id: string, mapId: string) => `willy:10g:${id}:${mapId}`;
const gTurnFlag = (id: string) => `willy:g-turno:${id}`;

function arcLength(a: Entity): number {
  return skillLevel(a, 'arco-voltaico') >= 2 ? 5 : 4;
}

/**
 * The 5G line. Level 1 does nothing (on purpose: the narrator's joke is the first use).
 * Every use in combat counts towards 6G…10G, at most once per turn, even when it does nothing.
 */
function performG(r: Resolver, id: string, t: ActionTarget): void {
  const me = r.entity(id);
  const lvl = skillLevel(me, 'red-g');
  // "Estrenado" is remembered on the engineer, so the joke plays once even if the use doesn't count.
  const firstEver = !me.tags.includes(G_TRIED) && (me.resources['uso:red-g']?.current ?? 0) === 0;
  if (firstEver) r.apply({ type: 'setEntity', entityId: id, addTags: [G_TRIED] });
  r.emit({ type: 'skillUsed', entityId: id, habilidad: 'red-g', nivel: lvl, primeraVez: firstEver } as WillyEvent);
  switch (lvl) {
    case 2:
      if (t.entityId) r.apply({ type: 'applyCondition', entityId: t.entityId, condition: 'mareado', remainingTurns: 1 });
      break;
    case 3:
      for (const e of Object.values(r.state.entities)) {
        if (standing(e) && !isHostile(e, me) && gridDistance(e.position, me.position) <= 6) r.apply({ type: 'applyCondition', entityId: e.id, condition: 'animado', remainingTurns: 2 });
      }
      break;
    case 4:
      for (const v of hostilesAround(r.state, me, me.position, 3)) {
        if (isBoss(v)) r.apply({ type: 'modifyResource', entityId: v.id, resource: 'acciones', delta: -1 });
        else r.apply({ type: 'applyCondition', entityId: v.id, condition: 'aturdido', remainingTurns: 1 });
      }
      break;
    case 5:
      for (const v of hostilesAround(r.state, me, me.position, 8)) {
        dealDamage(r, v.id, rollDice(r.rng, dice('2d6')), 'rayo', id, 'red-g');
        if (standing(r.entity(v.id))) r.apply({ type: 'applyCondition', entityId: v.id, condition: 'electrocutado', remainingTurns: 1 });
      }
      break;
    case 6: {
      for (const v of hostilesAround(r.state, me, me.position, 8)) {
        if (isBoss(v)) dealDamage(r, v.id, Math.ceil((v.resources.vida?.max ?? 0) / 4), 'rayo', id, 'red-g');
        else r.apply({ type: 'applyCondition', entityId: v.id, condition: 'electrocutado', remainingTurns: 3 }, { type: 'applyCondition', entityId: v.id, condition: 'bailando', sourceId: id, remainingTurns: 3 });
      }
      // The show reads these flags: a random sponsor becomes a fan, +60 s on the clock, the narrator loses signal.
      r.apply(
        { type: 'setFlag', flag: tenGFlag(id, r.state.map.id), value: true },
        { type: 'setFlag', flag: 'willy:patrocinadorFanAleatorio', value: r.rng.die(6) },
        { type: 'setFlag', flag: 'willy:relojExtra', value: Number(r.state.flags['willy:relojExtra'] ?? 0) + 60 },
        { type: 'setFlag', flag: 'narrador:sinConexion', value: true },
      );
      break;
    }
  }
  // Counts in combat, once per turn (even at 5G, where it does nothing).
  const turnKey = `${r.state.turn.round}`;
  if (r.state.turn.mode === 'combat' && r.state.flags[gTurnFlag(id)] !== turnKey) {
    r.apply({ type: 'setFlag', flag: gTurnFlag(id), value: turnKey });
    countUse(r, id, 'red-g');
  }
}
