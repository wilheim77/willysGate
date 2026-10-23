import type { ActionOutcome, Effect, GameEvent, GameState, RngCursor, Ruleset } from '../../engine';
import { rollItem } from './loot';
import { RARITIES, type Rarity, cloneMeta, metaOf, setMeta, willyContent } from './meta';

/**
 * The chests around a procedural floor (loot-tables.json → cofresDePlanta: one item and some
 * tokens, no box animation). A chest is a prop tagged `cofre` and `dialogue:cofre`: talking to it
 * (walking up and tapping it) opens the tiny `cofre` conversation, and this hook fills it: the
 * item into the bag, tokens to Willy, and the chest goes. Event: chestOpened { entityId, item,
 * nombre, rareza, fichas }. Mimics (mimicosPct) are not in yet.
 */

export const CHEST_TREE = 'cofre';

interface ChestTables {
  porPlanta: Record<string, { pesosRareza: Record<Rarity, number>; fichas: [number, number] }>;
  tabla: string;
}

export function chestsAfterCommand(_ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  const content = willyContent();
  const tables = (content?.loot as unknown as { cofresDePlanta?: ChestTables } | undefined)?.cofresDePlanta;
  if (!content || !tables) return { effects: [], events: [] };
  const effects: Effect[] = [];
  const out: GameEvent[] = [];
  for (const raw of events as unknown as Record<string, unknown>[]) {
    if (raw.type !== 'dialogueStarted' || raw.treeId !== CHEST_TREE) continue;
    const chest = state.entities[String(raw.partnerId)];
    if (!chest || !chest.tags.includes('cofre')) continue;
    const biome = (state.systems.planta as unknown as { bioma?: number } | undefined)?.bioma ?? 1;
    const spec = tables.porPlanta[String(biome)] ?? tables.porPlanta['1']!;
    const total = RARITIES.reduce((s, r) => s + (spec.pesosRareza[r] ?? 0), 0);
    let roll = rng.die(Math.max(1, total));
    const rarity = RARITIES.find((r) => (roll -= spec.pesosRareza[r] ?? 0) <= 0) ?? 'bronce';
    const meta = cloneMeta(metaOf(state));
    const def = rollItem(state, meta, rng, tables.tabla, rarity, []);
    const [lo, hi] = spec.fichas;
    const fichas = lo + rng.die(hi - lo + 1) - 1;
    if (def) {
      meta.obtenidos[def.id] = (meta.obtenidos[def.id] ?? 0) + 1;
      effects.push({ type: 'giveItem', owner: 'party', item: def.id, count: def.usos ?? 1 });
      out.push({ type: 'itemObtained', item: def.id, nombre: def.nombre, rareza: def.rareza, origen: 'cofre', entityId: chest.id } as GameEvent);
    }
    effects.push(setMeta(meta));
    if (fichas > 0 && state.entities.willy?.resources.fichas) effects.push({ type: 'modifyResource', entityId: 'willy', resource: 'fichas', delta: fichas });
    effects.push({ type: 'despawnEntity', entityId: chest.id });
    out.push({ type: 'chestOpened', entityId: chest.id, ...(def ? { item: def.id, nombre: def.nombre, rareza: def.rareza } : {}), fichas } as GameEvent);
  }
  return { effects, events: out };
}
