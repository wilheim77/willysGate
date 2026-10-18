import { type ActionTarget, type Entity, type GameState, type Vec2, OBJECT_TAG, OBSTACLE_TAG, gridDistance, hasTag, tileAt } from '../../engine';
import { HANDLERS, areaTiles, dice, hostilesAround, invalid, targetEntity } from './actions';
import { createCreature, skillLevel } from './character';
import { CLASSES } from './data';
import { rollDice } from './dice';
import { Resolver, type WillyEvent, countUse, dealDamage, heal, standing } from './resolve';

/**
 * Summons and temporary barriers, on the engine's spawnEntity/despawnEntity (R13).
 * Summons join the turn order right after their owner. Timed ones leave at the end of their
 * rounds (engine); "until the end of the fight" ones leave in onCombatEnd. All are tagged
 * `invocado-por:<owner>` and leave too if the owner is eliminated.
 */

export interface SummonData {
  nombre: string;
  spriteId: string;
  vida: number;
  def: number;
  ataque?: number;
  dano?: string;
  movimiento: number;
  control: 'jugador' | 'ia-aliada';
  etiquetas?: string[];
}

/** Summon templates from the class data (fan, automaton, antenna, Chencho). */
export function summonData(id: string): SummonData | undefined {
  for (const c of Object.values(CLASSES)) {
    const s = (c as unknown as { invocaciones?: Record<string, SummonData> }).invocaciones?.[id];
    if (s) return s;
  }
  return undefined;
}

const ownerTag = (ownerId: string) => `invocado-por:${ownerId}`;
const counterFlag = (ownerId: string) => `willy:invocaciones:${ownerId}`;

export function summonsOf(state: GameState, ownerId: string, template?: string): Entity[] {
  return Object.values(state.entities).filter((e) => hasTag(e, ownerTag(ownerId)) && standing(e) && (!template || hasTag(e, `plantilla:${template}`)));
}

function free(state: GameState, p: Vec2): boolean {
  const t = tileAt(state.map, p);
  return !!t?.walkable && !Object.values(state.entities).some((e) => e.position.x === p.x && e.position.y === p.y && (standing(e) || hasTag(e, 'barrera')));
}

/** Free tiles within `radius`, nearest first (deterministic order). */
export function freeTilesNear(state: GameState, centre: Vec2, radius: number): Vec2[] {
  return areaTiles(state, centre, radius)
    .filter((p) => (p.x !== centre.x || p.y !== centre.y) && free(state, p))
    .sort((a, b) => gridDistance(a, centre) - gridDistance(b, centre) || a.y - b.y || a.x - b.x);
}

export interface SummonOptions {
  rounds?: number;
  vida?: number;
  dano?: string;
  extraTags?: string[];
}

/** Spawns a summon for `ownerId` at `at`. Returns its id, or null if the tile was taken. */
export function summon(r: Resolver, ownerId: string, template: string, at: Vec2, opts: SummonOptions = {}): string | null {
  const data = summonData(template);
  if (!data || !free(r.state, at)) return null;
  const owner = r.entity(ownerId);
  const n = Number(r.state.flags[counterFlag(ownerId)] ?? 0) + 1;
  const id = `${template}#${ownerId}#${n}`;
  const entity = createCreature({
    id,
    name: data.nombre,
    controllerId: data.control === 'jugador' ? owner.controllerId : 'ai',
    factionId: owner.factionId,
    position: at,
    spriteId: data.spriteId,
    vida: opts.vida ?? data.vida,
    def: data.def,
    ataque: data.ataque ?? 0,
    dano: opts.dano ?? data.dano ?? '1d4',
    movimiento: data.movimiento,
    tags: ['invocacion', ownerTag(ownerId), `plantilla:${template}`, ...(data.etiquetas ?? []), ...(opts.extraTags ?? [])],
  });
  r.apply(
    { type: 'setFlag', flag: counterFlag(ownerId), value: n },
    { type: 'spawnEntity', entity, ownerId, ...(opts.rounds !== undefined ? { rounds: opts.rounds } : {}) },
  );
  return r.state.entities[id] ? id : null;
}

/** Temporary walls (Pared invisible, Ventanilla cerrada): objects that block, count as walls and never act. */
export function barrier(r: Resolver, ownerId: string, kind: 'pared-invisible' | 'persiana-de-ventanilla', tiles: Vec2[], rounds: number): number {
  let made = 0;
  const label = kind === 'pared-invisible' ? 'Pared invisible' : 'Ventanilla cerrada';
  for (const at of tiles) {
    if (!free(r.state, at)) continue;
    const n = Number(r.state.flags[counterFlag(ownerId)] ?? 0) + 1;
    const id = `${kind}#${ownerId}#${n}`;
    const entity: Entity = {
      id,
      name: label,
      controllerId: 'none',
      factionId: 'escenario',
      position: at,
      spriteId: kind,
      stats: { fue: 99, agi: 0, man: 0, agu: 99, car: 0, sue: 0, nivel: 1, armadura: 20 },
      resources: { vida: { current: 99, max: 99 } },
      conditions: [],
      tags: [OBJECT_TAG, OBSTACLE_TAG, 'barrera', `barrera:${kind}`, 'inmune:empuje', ownerTag(ownerId)],
    };
    r.apply({ type: 'setFlag', flag: counterFlag(ownerId), value: n }, { type: 'spawnEntity', entity, rounds });
    if (r.state.entities[id]) made++;
  }
  return made;
}

/** A line of `length` tiles centred on `centre`, perpendicular to the direction from `from`. */
export function wallTiles(from: Vec2, centre: Vec2, length: number): Vec2[] {
  const dx = Math.sign(centre.x - from.x);
  const dy = Math.sign(centre.y - from.y);
  // Perpendicular: (−dy, dx); for diagonals that is the other diagonal.
  const px = -dy || (dx ? 0 : 1);
  const py = dx || (dy ? 0 : 0);
  const tiles: Vec2[] = [centre];
  for (let i = 1; tiles.length < length; i++) {
    tiles.push({ x: centre.x + px * i, y: centre.y + py * i });
    if (tiles.length < length) tiles.push({ x: centre.x - px * i, y: centre.y - py * i });
  }
  return tiles;
}

/** Summons that last "until the end of the fight" leave here; everyone's summons leave if their owner falls. */
export function dismissSummons(r: Resolver, ownerId?: string): void {
  for (const e of Object.values(r.state.entities)) {
    const owner = e.tags.find((t) => t.startsWith('invocado-por:'))?.slice('invocado-por:'.length);
    if (!owner || (ownerId && owner !== ownerId)) continue;
    r.apply({ type: 'despawnEntity', entityId: e.id });
  }
}

/** Antennas fire a free Arco voltaico at the nearest enemy when their owner's turn starts. */
export function antennaShots(r: Resolver, ownerId: string): void {
  const owner = r.entity(ownerId);
  for (const ant of summonsOf(r.state, ownerId, 'antena-repetidora')) {
    const target = hostilesAround(r.state, owner, ant.position, 4).sort((a, b) => gridDistance(a.position, ant.position) - gridDistance(b.position, ant.position))[0];
    if (!target) continue;
    r.emit({ type: 'traitTriggered', entityId: ant.id, rasgo: 'antena-repetidora', objetivoId: target.id } as WillyEvent);
    dealDamage(r, target.id, rollDice(r.rng, dice(skillLevel(owner, 'arco-voltaico') >= 4 ? '1d10' : '1d8')), 'rayo', ownerId, 'antena');
  }
}

// --- Handlers ---------------------------------------------------------------------------------

const near = (s: GameState, a: Entity, radius: number) => freeTilesNear(s, a.position, radius);

Object.assign(HANDLERS, {
  'hab:colaboracion': {
    target: { kind: 'self', range: 0 },
    tags: ['summon'],
    preview: (s: GameState, a: Entity) => (near(s, a, 1).length ? { valid: true } : invalid('No hay sitio para tu fan.')),
    perform: (r: Resolver, id: string) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'colaboracion');
      const count = lvl >= 3 ? 2 : 1;
      for (const at of near(r.state, me, 1).slice(0, count)) summon(r, id, 'fan-entusiasta', at, { rounds: lvl >= 2 ? 4 : 3, ...(lvl >= 4 ? { vida: 18 } : {}) });
      countUse(r, id, 'colaboracion');
    },
  },
  'hab:construir-automata': {
    target: { kind: 'tile', range: 1 },
    tags: ['summon'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      if (!t.tile || !free(s, t.tile)) return invalid('Elige una casilla libre a tu lado.');
      if (summonsOf(s, a.id, 'automata-repetidor').length >= (skillLevel(a, 'construir-automata') >= 3 ? 2 : 1)) return invalid('Ya tienes todos los autómatas que puedes controlar.');
      return { valid: true };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const lvl = skillLevel(r.entity(id), 'construir-automata');
      const made = summon(r, id, 'automata-repetidor', t.tile!, lvl >= 2 ? { vida: 14, dano: '1d8' } : {});
      if (made) countUse(r, id, 'construir-automata');
    },
  },
  'hab:actualizacion-de-firmware': {
    target: { kind: 'creature', range: 4, filter: 'ally' },
    tags: ['heal', 'buff'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      const target = targetEntity(s, t);
      if (!target || !hasTag(target, `invocado-por:${a.id}`) || !hasTag(target, 'constructo')) return invalid('Solo se actualizan tus autómatas y antenas.');
      return { valid: true, expectedHealing: skillLevel(a, 'actualizacion-de-firmware') >= 2 ? 9 : 6 };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'actualizacion-de-firmware');
      const targets = lvl >= 4 ? summonsOf(r.state, id).filter((e) => hasTag(e, 'constructo')) : [r.entity(t.entityId!)];
      for (const e of targets) {
        heal(r, e.id, lvl >= 2 ? 9 : 6);
        r.apply({ type: 'applyCondition', entityId: e.id, condition: 'animado', remainingTurns: 3 });
        if (lvl >= 3 && e.resources.acciones) r.apply({ type: 'modifyResource', entityId: e.id, resource: 'acciones', delta: 1 });
      }
      countUse(r, id, 'actualizacion-de-firmware');
    },
  },
  'hab:antena-repetidora': {
    target: { kind: 'tile', range: 3 },
    tags: ['summon'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => {
      if (!t.tile || !free(s, t.tile)) return invalid('Elige una casilla libre.');
      if (summonsOf(s, a.id, 'antena-repetidora').length >= (skillLevel(a, 'antena-repetidora') >= 4 ? 2 : 1)) return invalid('Ya tienes una antena montada.');
      return { valid: true };
    },
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const lvl = skillLevel(r.entity(id), 'antena-repetidora');
      if (summon(r, id, 'antena-repetidora', t.tile!, { rounds: lvl >= 2 ? 4 : 3, extraTags: ['torreta', 'inmune:empuje'] })) countUse(r, id, 'antena-repetidora');
    },
  },
  'hab:despliegue-masivo': {
    target: { kind: 'self', range: 0 },
    tags: ['summon'],
    preview: (s: GameState, a: Entity) => (near(s, a, 2).length ? { valid: true } : invalid('No hay sitio para desplegar.')),
    perform: (r: Resolver, id: string) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'despliegue-masivo');
      for (const at of near(r.state, me, 2).slice(0, lvl >= 3 ? 4 : 3)) {
        const made = summon(r, id, 'automata-repetidor', at, { rounds: lvl >= 2 ? 4 : 3 });
        if (made && lvl >= 4) r.apply({ type: 'applyCondition', entityId: made, condition: 'animado', remainingTurns: 3 });
      }
      countUse(r, id, 'despliegue-masivo');
    },
  },
  'hab:pared-invisible': {
    target: { kind: 'tile', range: 3 },
    tags: ['control', 'barrier'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => (t.tile && free(s, t.tile) ? { valid: true, affectedTiles: wallTiles(a.position, t.tile, wallLength(a)) } : invalid('Elige una casilla libre.')),
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      if (barrier(r, id, 'pared-invisible', wallTiles(me.position, t.tile!, wallLength(me)), skillLevel(me, 'pared-invisible') >= 3 ? 3 : 2)) countUse(r, id, 'pared-invisible');
    },
  },
  'hab:ventanilla-cerrada': {
    target: { kind: 'tile', range: 3 },
    tags: ['control', 'barrier'],
    preview: (s: GameState, a: Entity, t: ActionTarget) => (t.tile && free(s, t.tile) ? { valid: true, affectedTiles: wallTiles(a.position, t.tile, skillLevel(a, 'ventanilla-cerrada') >= 3 ? 5 : 3) } : invalid('Elige dónde bajar la persiana.')),
    perform: (r: Resolver, id: string, t: ActionTarget) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'ventanilla-cerrada');
      if (barrier(r, id, 'persiana-de-ventanilla', wallTiles(me.position, t.tile!, lvl >= 3 ? 5 : 3), lvl >= 2 ? 3 : 2)) countUse(r, id, 'ventanilla-cerrada');
    },
  },
  'hab:tiempo-muerto': {
    target: { kind: 'self', range: 0 },
    tags: ['summon'],
    preview: (s: GameState, a: Entity) => {
      // With Chencho as a companion, the time-out is a pep talk for him instead of a second Chencho.
      if (companionChencho(s, a.id)) return { valid: true };
      if (summonsOf(s, a.id, 'chencho-el-base').length) return invalid('Chencho ya está en la pista.');
      return near(s, a, 1).length ? { valid: true } : invalid('No hay sitio para Chencho.');
    },
    perform: (r: Resolver, id: string) => {
      const me = r.entity(id);
      const lvl = skillLevel(me, 'tiempo-muerto');
      const mate = companionChencho(r.state, id);
      if (mate) {
        heal(r, mate.id, rollDice(r.rng, dice('1d6')) + lvl * 2);
        const en = r.entity(mate.id).resources.energia;
        if (en && en.current < en.max) r.apply({ type: 'modifyResource', entityId: mate.id, resource: 'energia', delta: en.max - en.current });
        r.apply({ type: 'applyCondition', entityId: mate.id, condition: 'animado', remainingTurns: lvl >= 4 ? 3 : 2 });
        countUse(r, id, 'tiempo-muerto');
        r.emit({ type: 'skillUsed', entityId: id, habilidad: 'tiempo-muerto', companero: mate.id } as WillyEvent);
        return;
      }
      const at = near(r.state, me, 1)[0];
      if (!at) return;
      const made = summon(r, id, 'chencho-el-base', at, { ...(lvl >= 5 ? {} : { rounds: lvl >= 2 ? 4 : 3 }), ...(lvl >= 3 ? { vida: 16 } : {}) });
      if (made && lvl >= 4) r.apply({ type: 'applyCondition', entityId: made, condition: 'animado', remainingTurns: 3 });
      if (made) countUse(r, id, 'tiempo-muerto');
    },
  },
});

function companionChencho(state: GameState, ownerId: string): Entity | undefined {
  return Object.values(state.entities).find((e) => hasTag(e, 'chencho') && hasTag(e, `companero-de:${ownerId}`) && standing(e));
}

function wallLength(a: Entity): number {
  const lvl = skillLevel(a, 'pared-invisible');
  return lvl >= 4 ? 3 : lvl >= 2 ? 2 : 1;
}
