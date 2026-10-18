import { type ActionDef, type ActionTarget, type Effect, type Entity, type GameState, type Vec2, gridDistance, hasCondition, hasTag, isHostile } from '../../engine';
import { HANDLERS, type Handler, areaTiles, attackPreviewOf, dice, extraActionSources, invalid, targetEntity, withPushBonus } from './actions';
import { createCreature, level } from './character';
import data from './data/companions.json';
import { type Dice, averageDice, rollDice, stepUp } from './dice';
import { type Resolver, type WillyEvent, chanceD20, dealDamage, defeatHooks, heal, pushEntity, resolveAttack, rollSave, standing } from './resolve';
import type { Attr } from './data';

/**
 * Willy's companions (data/companions.json): one per class, joins at the Camerino after the
 * casting. Player-controlled like Willy, same side, levels with him (synced when a fight starts),
 * and if they fall they are back on the next map. Their 2 abilities are data: 'ataque', 'apoyo'
 * or 'area', run by one generic handler each (`comp:<id>`).
 */

export interface CompanionAbility {
  id: string;
  nombre: string;
  texto: string;
  tipo: 'ataque' | 'apoyo' | 'area';
  coste: { acciones: number; energia?: number };
  alcance: number;
  radio?: number;
  melee?: boolean;
  dano?: string;
  elemento?: string;
  sinTirada?: boolean;
  condicion?: string;
  turnos?: number;
  fuente?: 'dueno';
  empuje?: number;
  tirar?: number;
  quitarAcciones?: number;
  curar?: string;
  quitar?: string[];
  dobleA?: string;
  salvacion?: { atributo: string; dif: number };
  aplicarElemento?: string;
}

export interface CompanionData {
  id: string;
  nombre: string;
  titulo: string;
  genero: string;
  descripcion: string;
  spriteId: string;
  base: { vida: number; def: number; ataque: number; dano: string; movimiento: number; fue: number; energia: number };
  porNivel: { vida: number };
  etiquetas: string[];
  habilidades: CompanionAbility[];
  frases: Record<string, string>;
}

export const COMPANIONS = data.companeros as unknown as Record<string, CompanionData>;
const SCALE = data.escalado;

export const COMPANION_TAG = 'companero';
export const ownerOf = (e: Entity): string | undefined => e.tags.find((t) => t.startsWith('companero-de:'))?.slice('companero-de:'.length);
const fellOnTag = (mapId: string) => `caido-en:${mapId}`;

export function companionOfClass(classId: string): CompanionData | undefined {
  return COMPANIONS[classId];
}

function companionData(e: Entity): CompanionData | undefined {
  const id = e.tags.find((t) => t.startsWith('companero:'))?.slice('companero:'.length);
  return Object.values(COMPANIONS).find((c) => c.id === id);
}

/** Numbers at a level: the scaling in data/companions.json. */
export function companionStats(c: CompanionData, lvl: number): { vida: number; def: number; ataque: number; dano: string } {
  const steps = SCALE.dadoSubeEnNiveles.filter((l) => lvl >= l).length;
  let d: Dice = dice(c.base.dano);
  for (let i = 0; i < steps; i++) d = stepUp(d);
  return {
    vida: c.base.vida + c.porNivel.vida * (lvl - 1),
    def: c.base.def + Math.floor((lvl - 1) / SCALE.defCadaNiveles),
    ataque: c.base.ataque + Math.floor((lvl - 1) / SCALE.ataqueCadaNiveles),
    dano: `${d.count}d${d.sides}${d.bonus ? `+${d.bonus}` : ''}`,
  };
}

/** A class's companion as an entity, next to `owner`, at the owner's level. */
export function createCompanion(classId: string, owner: Entity, position: Vec2): Entity | undefined {
  const c = COMPANIONS[classId];
  if (!c) return undefined;
  const lvl = level(owner);
  const s = companionStats(c, lvl);
  const e = createCreature({
    id: `companero-${c.id}`,
    name: c.nombre,
    controllerId: owner.controllerId,
    factionId: owner.factionId,
    position,
    spriteId: c.spriteId,
    vida: s.vida,
    def: s.def,
    ataque: s.ataque,
    dano: s.dano,
    movimiento: c.base.movimiento,
    fue: c.base.fue,
    tags: [COMPANION_TAG, `companero:${c.id}`, `companero-de:${owner.id}`, ...c.etiquetas],
  });
  return {
    ...e,
    stats: { ...e.stats, nivel: lvl },
    resources: { ...e.resources, energia: { current: c.base.energia, max: c.base.energia } },
  };
}

/**
 * Keeps companions in step with their owner: the owner's level (numbers rescaled, current
 * health keeping its share) and, if they fell on another map, back on their feet at half health.
 * Called when a fight starts (until the engine tells rulesets about map changes).
 */
export function syncCompanions(state: GameState): Effect[] {
  const effects: Effect[] = [];
  for (const e of Object.values(state.entities)) {
    if (!hasTag(e, COMPANION_TAG)) continue;
    const c = companionData(e);
    const owner = state.entities[ownerOf(e) ?? ''];
    if (!c || !owner) continue;
    const vida = e.resources.vida!;
    const fell = e.tags.find((t) => t.startsWith('caido-en:'));
    if (fell && fell !== fellOnTag(state.map.id) && hasCondition(e, 'eliminado')) {
      // Back in play as if summoned: despawn and spawn again, so a fight in progress gives it a turn.
      const back: Entity = {
        ...e,
        // Strip both 'eliminado' (Willy's own) and 'dead' (applied alongside it in resolve.ts's
        // defeat(), for the generic client's corpse/vanish handling) so the sprite comes back.
        conditions: e.conditions.filter((x) => x.id !== 'eliminado' && x.id !== 'dead'),
        resources: { ...e.resources, vida: { ...vida, current: Math.ceil(vida.max / 2) } },
        tags: e.tags.filter((t) => t !== fell),
      };
      effects.push({ type: 'despawnEntity', entityId: e.id }, { type: 'spawnEntity', entity: back, ownerId: owner.id });
    }
    const lvl = level(owner);
    if ((e.stats.nivel ?? 1) !== lvl) {
      const now = companionStats(c, lvl);
      const was = companionStats(c, e.stats.nivel ?? 1);
      effects.push({ type: 'modifyStat', entityId: e.id, stat: 'nivel', delta: lvl - (e.stats.nivel ?? 1) });
      effects.push({ type: 'modifyStat', entityId: e.id, stat: 'ataque', delta: now.ataque - was.ataque });
      effects.push({ type: 'modifyStat', entityId: e.id, stat: 'armadura', delta: now.def - was.def });
      effects.push({ type: 'modifyResourceMax', entityId: e.id, resource: 'vida', delta: now.vida - was.vida });
      effects.push({ type: 'setEntity', entityId: e.id, removeTags: [`arma:${was.dano}`], addTags: [`arma:${now.dano}`] });
    }
  }
  return effects;
}

/** Remember where a companion fell, so it comes back on the next map. */
export function markFallen(r: Resolver, id: string): void {
  const e = r.entity(id);
  if (hasTag(e, COMPANION_TAG)) {
    r.apply({ type: 'setEntity', entityId: id, addTags: [fellOnTag(r.state.map.id)] });
    r.emit({ type: 'companeroCae', entityId: id } as WillyEvent);
  }
}

// --- Abilities ------------------------------------------------------------------------------------

function scaled(e: Entity, text: string): Dice {
  let d = dice(text);
  const steps = SCALE.dadoSubeEnNiveles.filter((l) => (e.stats.nivel ?? 1) >= l).length;
  for (let i = 0; i < steps; i++) d = stepUp(d);
  return d;
}

function healAmount(e: Entity, a: CompanionAbility, target: Entity, rng: Parameters<typeof rollDice>[0]): number {
  const base = rollDice(rng, dice(a.curar!)) + Math.floor((e.stats.nivel ?? 1) / 2);
  return a.dobleA && hasTag(target, a.dobleA) ? base * 2 : base;
}

function alliesAround(state: GameState, actor: Entity, centre: Vec2, radius: number): Entity[] {
  return Object.values(state.entities).filter((o) => standing(o) && !o.tags.includes('object') && !isHostile(o, actor) && gridDistance(o.position, centre) <= radius);
}

function enemiesAround(state: GameState, actor: Entity, centre: Vec2, radius: number): Entity[] {
  return Object.values(state.entities).filter((o) => standing(o) && !o.tags.includes('object') && isHostile(o, actor) && gridDistance(o.position, centre) <= radius);
}

function applyRider(r: Resolver, actorId: string, targetId: string, a: CompanionAbility): void {
  const t = r.entity(targetId);
  if (!standing(t)) return;
  if (a.condicion && !hasTag(t, `inmune:${a.condicion}`)) {
    const source = a.fuente === 'dueno' ? ownerOf(r.entity(actorId)) ?? actorId : actorId;
    r.apply({ type: 'applyCondition', entityId: targetId, condition: a.condicion, sourceId: source, ...(a.turnos ? { remainingTurns: a.turnos } : {}) });
  }
  if (a.quitarAcciones && (t.resources.acciones?.current ?? 0) > 0) r.apply({ type: 'modifyResource', entityId: targetId, resource: 'acciones', delta: -Math.min(a.quitarAcciones, t.resources.acciones!.current) });
  const me = r.entity(actorId);
  if (a.empuje) pushEntity(r, targetId, me.position, a.empuje, actorId);
  if (a.tirar) {
    // Pulled towards the actor: a push "from" the far side.
    const from = { x: t.position.x + Math.sign(t.position.x - me.position.x), y: t.position.y + Math.sign(t.position.y - me.position.y) };
    if (gridDistance(t.position, me.position) > 1) pushEntity(r, targetId, from, a.tirar, actorId);
  }
}

function attackSpec(actor: Entity, targetId: string, a: CompanionAbility) {
  return { attackerId: actor.id, targetId, label: a.nombre, melee: !!a.melee, dice: scaled(actor, a.dano ?? '1d4'), element: a.elemento ?? 'golpe' };
}

function handlerFor(a: CompanionAbility): Handler {
  if (a.tipo === 'ataque') {
    return {
      target: { kind: 'creature', range: a.alcance, filter: 'hostile' },
      tags: ['attack', a.melee ? 'melee' : 'ranged', ...(a.empuje ? ['push'] : [])],
      preview: (s, actor, t) => {
        const target = targetEntity(s, t);
        if (!target) return invalid('Elige un enemigo.');
        if (a.sinTirada) return { valid: true, chance: 1 };
        const p = attackPreviewOf(s, attackSpec(actor, target.id, a));
        return a.empuje ? withPushBonus(s, p, target.id, actor.position, a.empuje) : p;
      },
      perform: (r, id, t) => {
        if (a.sinTirada) {
          applyRider(r, id, t.entityId!, a);
          return;
        }
        const res = resolveAttack(r, attackSpec(r.entity(id), t.entityId!, a));
        if (res.hit) applyRider(r, id, t.entityId!, a);
      },
    };
  }
  if (a.tipo === 'apoyo') {
    const self = (a.radio ?? 0) > 0 || a.alcance === 0;
    return {
      target: self ? { kind: 'self', range: 0 } : { kind: 'creature', range: a.alcance, filter: 'ally' },
      tags: ['support', ...(a.curar ? ['heal'] : [])],
      preview: (s, actor, t) => {
        if (self) return alliesAround(s, actor, actor.position, a.radio ?? 0).length ? { valid: true, chance: 1 } : invalid('No hay nadie a quien ayudar.');
        const target = targetEntity(s, t);
        if (!target || !standing(target)) return invalid('Elige un aliado.');
        if (a.curar && !a.condicion && target.resources.vida!.current >= target.resources.vida!.max) return invalid('Está como nuevo.');
        return { valid: true, chance: 1 };
      },
      perform: (r, id, t) => {
        const me = r.entity(id);
        const targets = self ? alliesAround(r.state, me, me.position, a.radio ?? 0) : [r.entity(t.entityId!)];
        for (const target of targets) {
          if (a.curar) heal(r, target.id, healAmount(me, a, target, r.rng));
          for (const c of a.quitar ?? []) if (hasCondition(r.entity(target.id), c)) r.apply({ type: 'removeCondition', entityId: target.id, condition: c });
          if (a.condicion) r.apply({ type: 'applyCondition', entityId: target.id, condition: a.condicion, sourceId: id, ...(a.turnos ? { remainingTurns: a.turnos } : {}) });
        }
      },
    };
  }
  // 'area': on a tile (or around the actor when alcance is 0).
  const self = a.alcance === 0;
  return {
    target: self ? { kind: 'self', range: 0 } : { kind: 'tile', range: a.alcance },
    tags: ['area', ...(a.dano ? ['attack'] : ['control'])],
    preview: (s, actor, t) => {
      const centre = self ? actor.position : t.tile;
      if (!centre) return invalid('Elige una casilla.');
      const hit = enemiesAround(s, actor, centre, a.radio ?? 0);
      if (!hit.length) return invalid('Ahí no hay enemigos.');
      const save = a.salvacion ? 1 - chanceD20(0, a.salvacion.dif) : 1;
      const expected = a.dano ? averageDice(scaled(actor, a.dano)) * hit.length : 0;
      return { valid: true, chance: save, expectedDamage: expected, affectedTiles: areaTiles(s, centre, a.radio ?? 0) };
    },
    perform: (r, id, t) => {
      const me = r.entity(id);
      const centre = self ? { ...me.position } : t.tile!;
      for (const v of enemiesAround(r.state, me, centre, a.radio ?? 0)) {
        if (a.dano) dealDamage(r, v.id, rollDice(r.rng, scaled(me, a.dano)), a.elemento ?? 'golpe', id, a.nombre);
        if (!standing(r.entity(v.id))) continue;
        if (a.salvacion && rollSave(r, v.id, a.salvacion.atributo as Attr, a.salvacion.dif)) continue;
        applyRider(r, id, v.id, { ...a, empuje: 0, tirar: 0 });
      }
      if (a.aplicarElemento) r.apply({ type: 'applyElement', tiles: areaTiles(r.state, centre, a.radio ?? 0), element: a.aplicarElemento });
    },
  };
}

for (const c of Object.values(COMPANIONS)) for (const a of c.habilidades) HANDLERS[`comp:${a.id}`] = handlerFor(a);
extraActionSources.push((state, e) => companionActions(state, e));
defeatHooks.push(markFallen);

/** The companion's own abilities, for listActions. */
export function companionActions(state: GameState, e: Entity): ActionDef[] {
  const c = companionData(e);
  if (!c) return [];
  return c.habilidades.map((a) => {
    const h = HANDLERS[`comp:${a.id}`]!;
    const target = typeof h.target === 'function' ? h.target(e, state) : h.target;
    return { id: `comp:${a.id}`, label: a.nombre, description: a.texto, cost: { acciones: a.coste.acciones, ...(a.coste.energia ? { energia: a.coste.energia } : {}) }, target, tags: ['ability', ...h.tags] };
  });
}

export function isCompanionAbility(e: Entity, actionId: string): boolean {
  return !!companionData(e)?.habilidades.some((a) => `comp:${a.id}` === actionId);
}

export type { ActionTarget };
