import {
  type ActionDef,
  type ActionOutcome,
  type ActionPreview,
  type ActionTarget,
  type CommandHandler,
  type Effect,
  type Entity,
  type GameEvent,
  type GameState,
  type JsonValue,
  type LightSource,
  type RngCursor,
  type Ruleset,
  type Vec2,
  applyEffects,
  fail,
  gridDistance,
  hasCondition,
  hasLineOfSight,
  inventoriesOf,
  isHostile,
  itemCount,
  storedLighting,
  surfaceAt,
  tileAt,
} from '../../engine';
import { HANDLERS, type Handler, areaTiles, attackPreviewOf, extraActionSources, invalid, targetEntity } from './actions';
import { type Dice, averageDice, parseDice, rollDice } from './dice';
import { type ItemDef, type ItemEffect, cloneMeta, equippedOf, hasEquipped, itemDef, metaOf, onConfigure, setMeta, willyContent } from './meta';
import { type Resolver, type WillyEvent, dealDamage, heal, pushEntity, resolveAttack, standing } from './resolve';

/**
 * Items (content/willy/data/items.json) as rules. A consumable in the party's bag, or a tool in
 * someone's hand, is an action «obj:<id>» like any ability: in combat it costs what the item says
 * (usually 1 action, coffee is free); out of combat it goes through the same `act` command.
 * Equipment changes stats while worn (modifyStat), grants immunities and carries lights.
 *
 * Effect macros (items.json → usar.efectos): damage, heal, applyCondition, removeCondition,
 * modifyResource, spawnSurface (fire/cold/lightning are elements and react with surfaces), push,
 * teleport. $self, $target, $tile and $each (everyone in the area that the filter allows).
 */

export const BAG = 'party';
export const itemActionId = (id: string) => `obj:${id}`;

/** Party members: Willy, his companion, their summons. */
export function inParty(e: Entity): boolean {
  return e.controllerId.startsWith('player');
}

// --- Targets -----------------------------------------------------------------------------------

function targetOf(def: ItemDef): ActionDef['target'] {
  const u = def.usar!;
  switch (u.objetivo) {
    case 'self':
      return { kind: 'self', range: 0 };
    case 'aliado':
      return { kind: 'creature', range: u.alcance ?? 1, filter: 'ally' };
    case 'enemigo':
      return { kind: 'creature', range: u.alcance ?? 1, filter: 'hostile' };
    case 'area':
      return u.centro === '$self' ? { kind: 'self', range: 0 } : { kind: 'tile', range: u.alcance ?? 3 };
    default:
      return { kind: 'tile', range: u.alcance ?? 3 };
  }
}

/** Tiles an item's area covers, from where it lands. */
function areaOf(state: GameState, def: ItemDef, actor: Entity, target: ActionTarget): Vec2[] {
  const u = def.usar!;
  const centre = u.centro === '$self' ? actor.position : (target.tile ?? actor.position);
  if (u.objetivo === 'cono' || u.objetivo === 'linea') {
    const to = target.tile ?? actor.position;
    const dx = Math.sign(to.x - actor.position.x);
    const dy = Math.sign(to.y - actor.position.y);
    const reach = u.alcance ?? 3;
    const tiles: Vec2[] = [];
    for (let i = 1; i <= reach; i++) {
      const p = { x: actor.position.x + dx * i, y: actor.position.y + dy * i };
      if (!tileAt(state.map, p)?.walkable) break;
      tiles.push(p);
      // A cone widens one tile each side per step.
      if (u.objetivo === 'cono' && i > 1) {
        for (const s of [-1, 1]) {
          const side = dx && dy ? [{ x: p.x - dx * (i > 1 ? 1 : 0), y: p.y }, { x: p.x, y: p.y - dy }] : [{ x: p.x + (dy ? s : 0), y: p.y + (dx ? s : 0) }];
          for (const q of side) if (tileAt(state.map, q)?.walkable && !tiles.some((t) => t.x === q.x && t.y === q.y)) tiles.push(q);
        }
      }
    }
    return tiles;
  }
  return areaTiles(state, centre, u.radio ?? 0);
}

function entitiesIn(state: GameState, actor: Entity, tiles: Vec2[], filter: string | undefined): Entity[] {
  return Object.values(state.entities).filter((e) => {
    if (!standing(e) || !tiles.some((t) => t.x === e.position.x && t.y === e.position.y)) return false;
    if (filter === 'enemigos') return isHostile(e, actor);
    if (filter === 'aliados') return !isHostile(e, actor);
    return true;
  });
}

// --- Effects ------------------------------------------------------------------------------------

function amountOf(text: string, e: Entity): number | Dice {
  const pct = /^(\d+)%vidaMax$/.exec(text);
  if (pct) return Math.ceil(((e.resources.vida?.max ?? 0) * Number(pct[1])) / 100);
  return /d/.test(text) ? parseDice(text) : Number(text);
}

const ELEMENTS: Record<string, string> = { fuego: 'fuego', frio: 'frio', rayo: 'rayo' };

/** A tool hit at an enemy is an attack roll; anything thrown or blasted just lands. */
function isWeaponHit(def: ItemDef, fx: ItemEffect): boolean {
  return fx.type === 'damage' && fx.entityId === '$target' && def.usar?.objetivo === 'enemigo';
}

function weaponSpec(def: ItemDef, fx: ItemEffect, actorId: string, targetId: string, target: Entity | undefined) {
  const bonusIf = fx.bonusSi as { condicion?: string; bonus?: number } | undefined;
  return {
    attackerId: actorId,
    targetId,
    label: def.nombre,
    melee: (def.usar?.alcance ?? 1) <= 1,
    dice: parseDice(String(fx.amount)),
    element: String(fx.element ?? 'golpe'),
    ...(bonusIf?.condicion && target && hasCondition(target, bonusIf.condicion) ? { extraDamage: bonusIf.bonus ?? 0 } : {}),
    ...(fx.multiplicadorCritico ? { critOn: 20 } : {}),
  };
}

function resolveIds(r: Resolver, who: JsonValue | undefined, actorId: string, target: ActionTarget, each: Entity[]): string[] {
  if (who === '$self') return [actorId];
  if (who === '$target') return target.entityId ? [target.entityId] : [];
  if (who === '$each') return each.map((e) => e.id);
  return typeof who === 'string' && r.state.entities[who] ? [who] : [];
}

function performItem(r: Resolver, def: ItemDef, actorId: string, target: ActionTarget): void {
  const actor = r.entity(actorId);
  const u = def.usar!;
  const tiles = areaOf(r.state, def, actor, target);
  const each = entitiesIn(r.state, actor, tiles, u.filtro ?? (u.objetivo === 'area' || u.objetivo === 'cono' || u.objetivo === 'linea' ? 'enemigos' : 'todos')).filter((e) => e.id !== actorId);
  const tile = target.tile ?? (target.entityId ? r.state.entities[target.entityId]?.position : undefined) ?? actor.position;
  for (const fx of u.efectos) {
    const sub = fx.area as { radio?: number } | undefined;
    const group = sub ? entitiesIn(r.state, actor, areaTiles(r.state, tile, sub.radio ?? 0), 'todos').filter((e) => e.id !== actorId) : each;
    const ids = resolveIds(r, fx.entityId, actorId, target, group);
    const cond = fx.si as { condicion?: string } | undefined;
    const ok = (id: string) => !cond?.condicion || hasCondition(r.entity(id), cond.condicion);
    switch (fx.type) {
      case 'damage':
        for (const id of ids) {
          if (!standing(r.entity(id))) continue;
          if (isWeaponHit(def, fx)) resolveAttack(r, weaponSpec(def, fx, actorId, id, r.entity(id)));
          else {
            const a = amountOf(String(fx.amount), r.entity(id));
            dealDamage(r, id, typeof a === 'number' ? a : rollDice(r.rng, a), String(fx.element ?? 'golpe'), actorId, 'objeto');
          }
        }
        break;
      case 'heal':
        for (const id of ids) {
          const a = amountOf(String(fx.amount), r.entity(id));
          heal(r, id, typeof a === 'number' ? a : rollDice(r.rng, a));
        }
        break;
      case 'applyCondition':
        for (const id of ids) if (ok(id) && standing(r.entity(id))) r.apply({ type: 'applyCondition', entityId: id, condition: String(fx.condition), sourceId: actorId, ...(typeof fx.remainingTurns === 'number' ? { remainingTurns: fx.remainingTurns } : {}) });
        break;
      case 'removeCondition':
        for (const id of ids) if (hasCondition(r.entity(id), String(fx.condition))) r.apply({ type: 'removeCondition', entityId: id, condition: String(fx.condition) });
        break;
      case 'modifyResource':
        for (const id of ids) {
          const res = r.entity(id).resources[String(fx.resource)];
          if (res) r.apply({ type: 'modifyResource', entityId: id, resource: String(fx.resource), delta: Math.min(Number(fx.delta), res.max * 4) });
        }
        break;
      case 'spawnSurface': {
        const at = fx.at === '$self' ? actor.position : tile;
        const where = areaTiles(r.state, at, Number(fx.radius ?? 0));
        const surface = String(fx.surface);
        if (ELEMENTS[surface]) r.apply({ type: 'applyElement', tiles: where, element: ELEMENTS[surface]! });
        else r.apply({ type: 'spawnSurface', tiles: where, surface });
        break;
      }
      case 'push': {
        const from = fx.from === '$tile' ? tile : actor.position;
        for (const id of ids) if (id !== actorId) pushEntity(r, id, from, Number(fx.distance ?? 1), actorId);
        break;
      }
      case 'teleport': {
        const to = target.tile;
        const free = to && tileAt(r.state.map, to)?.walkable && !Object.values(r.state.entities).some((e) => standing(e) && e.position.x === to.x && e.position.y === to.y);
        if (free) r.apply({ type: 'setPosition', entityId: actorId, position: { ...to } });
        break;
      }
      default:
        // Clock, audience and map reveals belong to systems still to come: the item says so.
        break;
    }
  }
}

function previewItem(state: GameState, def: ItemDef, actor: Entity, target: ActionTarget): ActionPreview {
  const u = def.usar!;
  const aimed = targetEntity(state, target);
  if (u.objetivo === 'enemigo' && !aimed) return invalid('Elige a quién.');
  if (u.objetivo === 'aliado' && !aimed) return invalid('Elige a quién se lo das.');
  if (u.lineaDeVision && aimed && !hasLineOfSight(state, actor.position, aimed.position)) return invalid('No lo ves desde aquí.');
  const weapon = u.efectos.find((fx) => isWeaponHit(def, fx));
  if (weapon && aimed) return attackPreviewOf(state, weaponSpec(def, weapon, actor.id, aimed.id, aimed), { description: def.regla } as Partial<ActionPreview>);
  const healFx = u.efectos.find((fx) => fx.type === 'heal');
  const who = u.objetivo === 'aliado' ? aimed : actor;
  if (healFx && who) {
    const a = amountOf(String(healFx.amount), who);
    const v = who.resources.vida;
    const amount = typeof a === 'number' ? a : averageDice(a);
    return { valid: true, chance: 1, expectedHealing: v ? Math.min(amount, v.max - v.current) : amount, breakdown: [{ label: def.regla }] };
  }
  const dmg = u.efectos.find((fx) => fx.type === 'damage');
  const out: ActionPreview = { valid: true, chance: 1, breakdown: [{ label: def.regla }] };
  if (dmg) out.expectedDamage = averageDice(parseDice(String(dmg.amount)));
  if (u.objetivo !== 'self' && u.objetivo !== 'aliado' && u.objetivo !== 'enemigo') out.affectedTiles = areaOf(state, def, actor, target);
  return out;
}

/** Who may use what: consumables from the shared bag, tools from one's own hands. */
function usableItems(state: GameState, e: Entity): ItemDef[] {
  if (!inParty(e) || !willyContent()) return [];
  const bag = inventoriesOf(state)[BAG] ?? {};
  const out: ItemDef[] = [];
  for (const [id, n] of Object.entries(bag)) {
    const def = itemDef(id);
    if (n > 0 && def?.usar && (def.tipo === 'consumible' || def.tipo === 'chatarra')) out.push(def);
  }
  for (const id of Object.values(equippedOf(state, e.id))) {
    const def = itemDef(id);
    if (def?.usar && def.tipo !== 'consumible') out.push(def);
  }
  return out;
}

function costOf(def: ItemDef): Record<string, number> {
  const c = def.usar?.coste ?? {};
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v > 0));
}

export function itemActions(state: GameState, e: Entity): ActionDef[] {
  return usableItems(state, e).map((def) => {
    const n = itemCount(state, BAG, def.id);
    return {
      id: itemActionId(def.id),
      label: `${def.nombre}${def.tipo === 'consumible' && n > 1 ? ` ×${n}` : ''}`,
      description: def.regla,
      cost: costOf(def),
      target: targetOf(def),
      tags: ['item', def.tipo, ...(def.etiquetas ?? [])],
    };
  });
}

function registerItemHandlers(): void {
  const content = willyContent();
  if (!content) return;
  for (const def of content.items) {
    if (!def.usar) continue;
    const handler: Handler = {
      target: targetOf(def),
      tags: ['item', def.tipo],
      preview: (state, actor, target) => {
        if (!usableItems(state, actor).some((d) => d.id === def.id)) return invalid('No lo llevas.');
        return previewItem(state, def, actor, target);
      },
      perform: (r, actorId, target) => {
        const actor = r.entity(actorId);
        const before = actor.conditions.map((c) => c.id);
        r.emit({ type: 'itemUsed', actorId, item: def.id, nombre: def.nombre, etiquetas: def.etiquetas ?? [], actor: { id: actorId, condiciones: before }, vidaLlena: (actor.resources.vida?.current ?? 0) >= (actor.resources.vida?.max ?? 0), enCombate: r.state.turn.mode === 'combat' } as unknown as WillyEvent);
        if (def.tipo === 'consumible' || def.tipo === 'chatarra') r.apply({ type: 'giveItem', owner: BAG, item: def.id, count: -1 });
        if (def.etiquetas?.includes('curacion')) {
          const meta = cloneMeta(metaOf(r.state));
          meta.consumiblesCuracionUsados++;
          r.apply(setMeta(meta));
        }
        performItem(r, def, actorId, target);
      },
    };
    HANDLERS[itemActionId(def.id)] = handler;
  }
}

onConfigure(() => registerItemHandlers());
extraActionSources.push((state, e) => itemActions(state, e));

// --- Equipment ----------------------------------------------------------------------------------

/** Stats an item changes while worn, as effects (sign −1 takes them back off). */
function passiveEffects(def: ItemDef, entity: Entity, sign: 1 | -1): Effect[] {
  const fx: Effect[] = [];
  for (const p of def.pasivo ?? []) {
    if (p.stat === 'vidaMax') fx.push({ type: 'modifyResourceMax', entityId: entity.id, resource: 'vida', delta: sign * p.delta });
    else fx.push({ type: 'modifyStat', entityId: entity.id, stat: p.stat, delta: sign * p.delta });
  }
  const tags = (def.inmunidades ?? []).filter((i) => i.efecto === 'push').map(() => 'inmune:empuje');
  if (tags.length) fx.push({ type: 'setEntity', entityId: entity.id, ...(sign > 0 ? { addTags: tags } : { removeTags: tags }) });
  return fx;
}

export function slotOf(def: ItemDef): string | undefined {
  if (def.tipo === 'equipo' || def.tipo === 'herramienta') return def.ranura ?? (def.tipo === 'herramienta' ? 'mano' : 'amuleto');
  return undefined;
}

const inSafeZone = (state: GameState) => state.map.id.startsWith('camerino');

interface EquipCommand {
  type: string;
  issuer: string;
  entityId: string;
  item: string;
}

export const equipItem: CommandHandler<EquipCommand> = (state, cmd, { ruleset }) => {
  const e = state.entities[cmd.entityId];
  const def = itemDef(cmd.item);
  if (!e || e.controllerId !== cmd.issuer) return fail('not_your_entity', 'Not yours');
  if (!def || !slotOf(def)) return fail('invalid_target', 'Not equipment');
  if (itemCount(state, BAG, def.id) < 1) return fail('invalid_target', 'Not in the bag');
  if (state.turn.mode === 'combat' && state.turn.activeEntityId !== e.id) return fail('not_your_turn', 'Not your turn');
  const slot = slotOf(def)!;
  const meta = cloneMeta(metaOf(state));
  const slots = { ...(meta.equipo[e.id] ?? {}) };
  const effects: Effect[] = [];
  const old = slots[slot] ? itemDef(slots[slot]!) : undefined;
  if (old?.maldito && !inSafeZone(state)) return fail('action_invalid', 'Cursed');
  if (old) effects.push(...passiveEffects(old, e, -1), { type: 'giveItem', owner: BAG, item: old.id, count: 1 });
  slots[slot] = def.id;
  meta.equipo[e.id] = slots;
  effects.push({ type: 'giveItem', owner: BAG, item: def.id, count: -1 }, ...passiveEffects(def, e, 1), setMeta(meta));
  // In combat, changing what you carry takes an action.
  if (state.turn.mode === 'combat') {
    if ((e.resources.acciones?.current ?? 0) < 1) return fail('not_enough_resources', 'Needs an action');
    effects.push({ type: 'modifyResource', entityId: e.id, resource: 'acciones', delta: -1 });
  }
  const applied = applyEffects(ruleset, state, effects);
  return { ok: true, state: withItemLights(applied.state), events: [{ type: 'itemEquipped', entityId: e.id, item: def.id, nombre: def.nombre, objeto: def.nombre, ranura: slot, maldito: !!def.maldito } as GameEvent, ...applied.events] };
};

export const unequipItem: CommandHandler<EquipCommand> = (state, cmd, { ruleset }) => {
  const e = state.entities[cmd.entityId];
  if (!e || e.controllerId !== cmd.issuer) return fail('not_your_entity', 'Not yours');
  const meta = cloneMeta(metaOf(state));
  const slots = { ...(meta.equipo[e.id] ?? {}) };
  const slot = Object.keys(slots).find((s) => slots[s] === cmd.item);
  const def = itemDef(cmd.item);
  if (!slot || !def) return fail('invalid_target', 'Not equipped');
  if (def.maldito && !inSafeZone(state)) return fail('action_invalid', 'Cursed: only in the Camerino');
  if (state.turn.mode === 'combat' && state.turn.activeEntityId !== e.id) return fail('not_your_turn', 'Not your turn');
  delete slots[slot];
  meta.equipo[e.id] = slots;
  const applied = applyEffects(ruleset, state, [...passiveEffects(def, e, -1), { type: 'giveItem', owner: BAG, item: def.id, count: 1 }, setMeta(meta)]);
  return { ok: true, state: withItemLights(applied.state), events: [{ type: 'itemUnequipped', entityId: e.id, item: def.id } as GameEvent, ...applied.events] };
};

/** Lights carried by equipped items (headlamps, the ring light), kept on whatever map we are on. */
function withItemLights(state: GameState): GameState {
  const want: LightSource[] = [];
  for (const [id, slots] of Object.entries(metaOf(state).equipo)) {
    if (!state.entities[id]) continue;
    for (const itemId of Object.values(slots)) {
      const luz = (itemDef(itemId) as (ItemDef & { luz?: Omit<LightSource, 'id'> }) | undefined)?.luz;
      if (luz) want.push({ ...luz, id: `item:${id}:${itemId}`, attachedTo: id });
    }
  }
  const stored = storedLighting(state);
  const others = stored.lights.filter((l) => !l.id.startsWith('item:'));
  const same = JSON.stringify(stored.lights.filter((l) => l.id.startsWith('item:'))) === JSON.stringify(want);
  if (same) return state;
  return { ...state, systems: { ...state.systems, lighting: { ...stored, lights: [...others, ...want] } as unknown as JsonValue } };
}

// --- Passive triggers (after every command) -------------------------------------------------------

/**
 * Worn items that react to what happened: immunities shake off conditions, the bottomless
 * thermos may give an action, the complaints book turns damage into energy, the loaded die
 * makes the first roll of each floor lucky, and carried lights follow us to every map.
 */
export function itemsHook(ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  if (!willyContent()) return { effects: [], events: [] };
  const effects: Effect[] = [];
  const out: GameEvent[] = [];
  const meta = metaOf(state);
  for (const [id, slots] of Object.entries(meta.equipo)) {
    const e = state.entities[id];
    if (!e || !standing(e)) continue;
    const defs = Object.values(slots).map(itemDef).filter((d): d is ItemDef => !!d);
    for (const def of defs) {
      for (const imm of def.inmunidades ?? []) {
        if (!imm.condicion || !hasCondition(e, imm.condicion)) continue;
        // «origen»: only when it came from a surface (water, oil, ice) — i.e. standing on one.
        if (imm.origen && !surfaceAt(state, e.position)) continue;
        effects.push({ type: 'removeCondition', entityId: id, condition: imm.condicion });
        out.push({ type: 'itemProtected', entityId: id, item: def.id, condicion: imm.condicion } as GameEvent);
      }
    }
    for (const raw of events as unknown as Record<string, unknown>[]) {
      if (raw.type === 'turnStarted' && raw.entityId === id && hasEquipped(state, id, 'termo-sin-fondo') && rng.die(4) === 1) {
        effects.push({ type: 'modifyResource', entityId: id, resource: 'acciones', delta: 1 });
        out.push({ type: 'traitTriggered', entityId: id, rasgo: 'termo-sin-fondo' } as GameEvent);
      }
      if (raw.type === 'damageDealt' && raw.targetId === id && hasEquipped(state, id, 'cuaderno-de-quejas') && e.resources.energia) {
        effects.push({ type: 'modifyResource', entityId: id, resource: 'energia', delta: 1 });
      }
      if (raw.type === 'combatStarted' && hasEquipped(state, id, 'dado-trucado')) {
        const key = `dado-trucado:${id}@${state.map.id}`;
        if (!meta.gastados.includes(key)) {
          const m = cloneMeta(meta);
          m.gastados.push(key);
          effects.push({ type: 'applyCondition', entityId: id, condition: 'afortunado' }, setMeta(m));
        }
      }
    }
  }
  const lit = withItemLights(state);
  if (lit !== state) effects.push({ type: 'setSystem', system: 'lighting', value: lit.systems.lighting! });
  void ruleset;
  return { effects, events: out };
}

/** Class starting items (classes.json → objetosIniciales): tools and equipment worn, the rest in the bag. */
export function startingItemEffects(state: GameState, entity: Entity, itemIds: string[]): { effects: Effect[]; equipo: Record<string, string> } {
  const effects: Effect[] = [];
  const equipo: Record<string, string> = {};
  for (const id of itemIds) {
    const def = itemDef(id);
    if (!def) continue;
    const slot = slotOf(def);
    if (slot && !equipo[slot]) {
      equipo[slot] = id;
      effects.push(...passiveEffects(def, entity, 1));
    } else effects.push({ type: 'giveItem', owner: BAG, item: id, count: def.usos ?? 1 });
  }
  void state;
  return { effects, equipo };
}
