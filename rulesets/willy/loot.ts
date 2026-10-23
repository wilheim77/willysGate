import { type ActionOutcome, type CommandHandler, type Effect, type GameEvent, type GameState, type RngCursor, type Ruleset, OBJECT_TAG, RngCursor as Cursor, applyEffects, fail, hasTag } from '../../engine';
import { type ItemDef, type MetaState, type PendingBox, RARITIES, type Rarity, cloneMeta, hasEquipped, itemDef, metaOf, setMeta, willyContent } from './meta';

/**
 * Loot boxes (docs/willy/DESIGN.md §8): a box is granted (an achievement, a boss, an elite…) and
 * waits in the run until the player opens it. Opening rolls with the run's RNG: per slot a rarity
 * (the box's weights), a category (botin-general), then an item of that rarity and category. The
 * guarantee rerolls the last slot; pity forces gold after 8 boxes without and a legendary after
 * 20. No repeats in a box, unique items once per run, at most 2 copies of tools and equipment.
 * Reloading never changes a result: the RNG lives in the state.
 */

export interface BoxDeliveredEvent extends GameEvent {
  type: 'boxDelivered';
  boxId: string;
  caja: Rarity;
  origen: string;
  motivo?: string;
}

export interface BoxOpenedEvent extends GameEvent {
  type: 'boxOpened';
  boxId: string;
  caja: Rarity;
  objetos: { item: string; rareza: Rarity; nombre: string }[];
  fichas: number;
  rarezaMax: Rarity;
  /** First item's name, for the narrator's {objeto}. */
  objeto: string;
  enCombate: boolean;
  origen: string;
}

const rank = (r: Rarity) => RARITIES.indexOf(r);

/** Adds a box to the run (mutates `meta`) and returns its announcement. */
export function grantBox(meta: MetaState, tier: Rarity, origen: string, motivo?: string): GameEvent {
  meta.cajasEntregadas++;
  const box: PendingBox = { id: `caja-${meta.cajasEntregadas}`, nivel: tier, origen, ...(motivo ? { motivo } : {}) };
  meta.cajas.push(box);
  return { type: 'boxDelivered', boxId: box.id, caja: tier, origen, ...(motivo ? { motivo } : {}) } as BoxDeliveredEvent;
}

/**
 * For other systems (audience milestones, sponsor gifts): a box for the run, as effects and the
 * announcement. Apply the effects to the state you pass (or return them from your hook).
 */
export function grantLootBox(state: GameState, tier: Rarity, reason: string, origen = 'patrocinio'): ActionOutcome {
  const meta = cloneMeta(metaOf(state));
  const ev = grantBox(meta, tier, origen, reason);
  return { effects: [setMeta(meta)], events: [ev] };
}

/** An item straight into the party's bag (a sponsor's gift, a drop), with its announcement. */
export function grantItem(state: GameState, itemId: string, reason: string, count = 1): ActionOutcome {
  const def = itemDef(itemId);
  if (!def) return { effects: [], events: [] };
  const meta = cloneMeta(metaOf(state));
  meta.obtenidos[itemId] = (meta.obtenidos[itemId] ?? 0) + 1;
  return {
    effects: [{ type: 'giveItem', owner: 'party', item: itemId, count: count * (def.usos ?? 1) }, setMeta(meta)],
    events: [{ type: 'itemObtained', item: itemId, nombre: def.nombre, rareza: def.rareza, origen: reason } as GameEvent],
  };
}

function weighted<T>(rng: RngCursor, entries: { value: T; weight: number }[]): T | undefined {
  const total = entries.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return undefined;
  // Weights may be fractional (0.5 %): roll on a fine scale.
  let roll = ((rng.die(1_000_000) - 1) / 1_000_000) * total;
  for (const e of entries) {
    roll -= Math.max(0, e.weight);
    if (roll < 0) return e.value;
  }
  return entries[entries.length - 1]!.value;
}

function between(rng: RngCursor, [lo, hi]: [number, number]): number {
  return lo + rng.die(hi - lo + 1) - 1;
}

/** Items a box may give this run (unlocks, uniques, copies, items kept out for now). */
function eligible(state: GameState, meta: MetaState, def: ItemDef, picked: string[]): boolean {
  const content = willyContent()!;
  if (def.inicial || def.tipo === 'cosmetico' || picked.includes(def.id)) return false;
  if (content.loot.fueraDeCajas?.includes(def.id)) return false;
  if (def.desbloqueo?.startsWith('logro:') && !meta.logros.includes(def.desbloqueo.slice(6)) && !meta.desbloqueos.includes(def.id)) return false;
  const owned = meta.obtenidos[def.id] ?? 0;
  if (def.unico && owned > 0) return false;
  const max = content.loot.piedad.maxCopiasPorPartida[def.tipo];
  if (max !== undefined && owned >= max) return false;
  void state;
  return true;
}

/** The items of one category table, flattened. */
function tableItems(table: string): { item: string; peso: number }[] {
  const t = willyContent()!.loot.tablas[table];
  if (!t) return [];
  return t.entradas.flatMap((e) => ('item' in e ? [e] : tableItems(e.tabla)));
}

/** One item of `rarity` from `table` (botin-general rolls its category first); drops a rarity if empty. */
export function rollItem(state: GameState, meta: MetaState, rng: RngCursor, table: string, rarity: Rarity, picked: string[]): ItemDef | undefined {
  const content = willyContent()!;
  for (let r = rank(rarity); r >= 0; r--) {
    const rar = RARITIES[r]!;
    const pool = (t: string) => tableItems(t).map((e) => ({ def: itemDef(e.item), peso: e.peso })).filter((e) => e.def && e.def.rareza === rar && eligible(state, meta, e.def, picked));
    const top = content.loot.tablas[table]!;
    const cats = top.entradas.filter((e): e is { tabla: string; peso: number } => 'tabla' in e).filter((e) => pool(e.tabla).length > 0);
    const cat = cats.length ? weighted(rng, cats.map((c) => ({ value: c.tabla, weight: c.peso }))) : undefined;
    const items = cat ? pool(cat) : pool(table);
    const pick = weighted(rng, items.map((i) => ({ value: i.def!, weight: i.peso })));
    if (pick) return pick;
  }
  return undefined;
}

export function rollBox(state: GameState, meta: MetaState, rng: RngCursor, tier: Rarity): { items: ItemDef[]; fichas: number; garantia?: Rarity } {
  const box = willyContent()!.loot.cajas[tier];
  const pity = willyContent()!.loot.piedad;
  const picked: string[] = [];
  const items: ItemDef[] = [];
  for (let i = 0; i < box.objetos; i++) {
    const rarity = weighted(rng, RARITIES.map((r) => ({ value: r, weight: box.pesosRareza[r] ?? 0 })))!;
    const def = rollItem(state, meta, rng, box.tabla, rarity, picked);
    if (def) {
      items.push(def);
      picked.push(def.id);
    }
  }
  const best = () => Math.max(-1, ...items.map((d) => rank(d.rareza)));
  // Guarantee, then pity: the last slot is rolled again at the rarity owed.
  let owed: Rarity | null = box.garantia && best() < rank(box.garantia) ? box.garantia : null;
  if (meta.piedad.legendaria + 1 >= pity.legendaria.cajasSin && best() < rank('legendaria')) owed = 'legendaria';
  else if (meta.piedad.oro + 1 >= pity.oro.cajasSin && best() < rank('oro') && (!owed || rank(owed) < rank('oro'))) owed = 'oro';
  let applied: Rarity | undefined;
  if (owed && items.length) {
    const swapped = rollItem(state, meta, rng, box.tabla, owed, picked.slice(0, -1).concat(items[items.length - 1]!.id));
    if (swapped && rank(swapped.rareza) > rank(items[items.length - 1]!.rareza)) {
      items[items.length - 1] = swapped;
      applied = owed;
    }
  }
  meta.piedad.oro = best() >= rank('oro') ? 0 : meta.piedad.oro + 1;
  meta.piedad.legendaria = best() >= rank('legendaria') ? 0 : meta.piedad.legendaria + 1;
  return { items, fichas: between(rng, box.fichas), ...(applied ? { garantia: applied } : {}) };
}

interface OpenBoxCommand {
  type: 'openBox';
  issuer: string;
  boxId: string;
}

/** Opens a waiting box: rolls it and puts everything in the party's bag (and the chips on Willy). */
export const openBox: CommandHandler<OpenBoxCommand & { type: string }> = (state, cmd, { ruleset }) => {
  if (!willyContent()) return fail('unknown_command', 'No loot content');
  if (!cmd.issuer.startsWith('player')) return fail('not_your_entity', 'Only the player opens boxes');
  const meta = cloneMeta(metaOf(state));
  const box = meta.cajas.find((b) => b.id === cmd.boxId);
  if (!box) return fail('invalid_target', 'No such box');
  meta.cajas = meta.cajas.filter((b) => b.id !== box.id);
  meta.cajasAbiertas++;
  const rng = new Cursor(state.rng);
  const { items, fichas, garantia } = rollBox(state, meta, rng, box.nivel);
  const repeated = items.some((d) => (meta.obtenidos[d.id] ?? 0) > 0);
  const effects: Effect[] = [];
  for (const d of items) {
    meta.obtenidos[d.id] = (meta.obtenidos[d.id] ?? 0) + 1;
    effects.push({ type: 'giveItem', owner: 'party', item: d.id, count: d.usos ?? 1 });
  }
  const willy = state.entities.willy;
  if (willy?.resources.fichas && fichas > 0) effects.push({ type: 'modifyResource', entityId: 'willy', resource: 'fichas', delta: fichas });
  effects.push(setMeta(meta));
  const applied = applyEffects(ruleset, { ...state, rng: rng.state }, effects);
  const best = items.reduce<Rarity>((m, d) => (rank(d.rareza) > rank(m) ? d.rareza : m), 'bronce');
  const opened: BoxOpenedEvent = {
    type: 'boxOpened',
    boxId: box.id,
    caja: box.nivel,
    objetos: items.map((d) => ({ item: d.id, rareza: d.rareza, nombre: d.nombre })),
    fichas,
    rarezaMax: best,
    objeto: items[0]?.nombre ?? '',
    enCombate: state.turn.mode === 'combat',
    origen: box.origen,
    // What the Narrador can remark on (narrator/logros-y-cajas.json → cajaResultado).
    ...(garantia ? { garantia } : {}),
    ...(items.some((d) => d.maldito) ? { hayMaldito: true } : {}),
    ...(items.some((d) => d.tipo === 'aviso') ? { hayAviso: true } : {}),
    ...(items.length > 0 && items.every((d) => d.tipo === 'consumible') ? { soloConsumibles: true } : {}),
    ...(repeated ? { hayRepetido: true } : {}),
  };
  const obtained = items.map((d) => ({ type: 'itemObtained', item: d.id, nombre: d.nombre, rareza: d.rareza, origen: 'caja' }) as GameEvent);
  return { ok: true, state: applied.state, events: [{ type: 'boxOpening', boxId: box.id, caja: box.nivel } as GameEvent, opened, ...obtained, ...applied.events] };
};

// --- Enemy drops -------------------------------------------------------------------------------

/** Chips and the odd consumable from what the party knocks down (loot-tables.json → enemigos). */
export function dropsHook(_ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  const content = willyContent();
  const w = state.entities.willy;
  if (!content || !w) return { effects: [], events: [] };
  const effects: Effect[] = [];
  const out: GameEvent[] = [];
  let meta: MetaState | null = null;
  for (const raw of events as unknown as Record<string, unknown>[]) {
    if (raw.type !== 'entityDefeated') continue;
    const e = state.entities[String(raw.entityId)];
    if (!e || e.tags.includes(OBJECT_TAG) || e.factionId === w.factionId || hasTag(e, 'barrera') || e.tags.some((t) => t.startsWith('invocado-por:'))) continue;
    const kind = hasTag(e, 'jefe') ? 'jefe' : hasTag(e, 'elite') || hasTag(e, 'rival') ? 'elite' : 'normal';
    const drop = content.loot.enemigos[kind];
    let chips = between(rng, drop.fichas);
    if (hasEquipped(state, 'willy', 'moneda-de-cinco-duros')) chips = Math.ceil(chips * 1.1);
    if (w.resources.fichas && chips > 0) effects.push({ type: 'modifyResource', entityId: 'willy', resource: 'fichas', delta: chips });
    if (rng.die(1000) <= Math.round(drop.consumible * 1000)) {
      meta ??= cloneMeta(metaOf(state));
      const def = rollItem(state, meta, rng, 'consumibles', kind === 'jefe' ? 'plata' : 'bronce', []);
      if (def) {
        meta.obtenidos[def.id] = (meta.obtenidos[def.id] ?? 0) + 1;
        effects.push({ type: 'giveItem', owner: 'party', item: def.id, count: def.usos ?? 1 });
        out.push({ type: 'itemObtained', item: def.id, nombre: def.nombre, rareza: def.rareza, origen: 'enemigo', entityId: e.id } as GameEvent);
      }
    }
    // Rarely, a piece of magic gear (a tool or equipment): elites and bosses more often and better.
    if (drop.magico && rng.die(1000) <= Math.round(drop.magico * 1000)) {
      meta ??= cloneMeta(metaOf(state));
      const rarity = weighted(rng, RARITIES.map((r) => ({ value: r, weight: drop.pesosRareza?.[r] ?? (r === 'bronce' ? 1 : 0) })))!;
      const table = rng.die(2) === 1 ? 'equipo' : 'herramientas';
      const def = rollItem(state, meta, rng, table, rarity, []);
      if (def) {
        meta.obtenidos[def.id] = (meta.obtenidos[def.id] ?? 0) + 1;
        effects.push({ type: 'giveItem', owner: 'party', item: def.id, count: def.usos ?? 1 });
        out.push({ type: 'itemObtained', item: def.id, nombre: def.nombre, rareza: def.rareza, origen: 'enemigo', entityId: e.id } as GameEvent);
      }
    }
  }
  if (meta) effects.push(setMeta(meta));
  return { effects, events: out };
}
