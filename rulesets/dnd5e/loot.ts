import type { Effect, Entity, GameEvent, GameState } from '../../engine';
import { RngCursor, deriveSeed, seedRng, tagValue } from '../../engine';
import lootJson from './data/loot.json';
import { MONSTERS } from './data';

/**
 * Enemy drop tables (SRD magic items, Potions of Healing, coin). Data lives in
 * data/loot.json, keyed by "tier" rather than by monster id directly, so new monster ids
 * (added by the bestiary) fall into a sane default (their `type:` tag) without this file
 * having to be touched for every creature. Only a handful of named leaders/bosses and
 * spellcasters are called out explicitly.
 */

interface LootEntry {
  /** Mechanical item id (see data/magic-items.json). Absent means "nothing" for this roll. */
  item?: string;
  /** Inclusive range rolled with the seeded RNG; defaults to exactly 1. */
  count?: [number, number];
  weight: number;
}

const TABLES = (lootJson as unknown as { tables: Record<string, LootEntry[]> }).tables;

/** Bosses and lieutenants get the richest table regardless of their generic `type:` tag. */
const BOSS_IDS = new Set(['gladiator', 'foreman']);
const LEADER_IDS = new Set(['bandit_captain', 'veteran', 'knight', 'wight']);
/** Spellcasters (cultists included) favour scrolls over steel. */
const CASTER_IDS = new Set(['cultist', 'cult_fanatic', 'acolyte', 'priest', 'mage', 'apprentice']);

function tierFor(monsterId: string): string {
  if (BOSS_IDS.has(monsterId)) return 'boss';
  if (LEADER_IDS.has(monsterId)) return 'leader';
  if (CASTER_IDS.has(monsterId)) return 'caster';
  const m = MONSTERS[monsterId];
  // Beasts (wolves, mastiffs, giant rats, giant spiders...) never carry magic.
  if (m?.tags.includes('type:beast')) return 'beast';
  return m ? 'minion' : 'none';
}

/** Weighted pick: a roll of 1..total, consuming one die from the seeded RNG. */
function rollEntry(table: LootEntry[], rng: RngCursor): LootEntry | undefined {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return undefined;
  let roll = rng.die(total);
  for (const e of table) {
    if (roll <= e.weight) return e.item ? e : undefined;
    roll -= e.weight;
  }
  return undefined;
}

export interface LootDroppedEvent extends GameEvent {
  type: 'lootDropped';
  /** The corpse it came off (for a floating "+1 espada" over the body, or a log line). */
  entityId: string;
  item: string;
  count: number;
}

/**
 * Rolls one loot table per fallen monster, straight into the party's shared inventory
 * (DESIGN.md's "toast" option: no lootable-corpse entity exists yet to drop a bag onto).
 * `fallen` should already be filtered to the losing side's dead, not-yet-looted monsters.
 *
 * Each corpse rolls from its own seed, deriveSeed(state.seed, 'loot', corpseId) — never
 * from the shared combat `rng`. A monster's drop must not depend on how many dice the fight
 * that killed it happened to burn through, and rolling it must not shift every check for
 * the rest of the playthrough (see content/willy/gen/random.ts for the same pattern).
 */
export function rollLoot(state: GameState, fallen: Entity[]): { effects: Effect[]; events: GameEvent[] } {
  const effects: Effect[] = [];
  const events: GameEvent[] = [];
  for (const e of fallen) {
    const monsterId = tagValue(e, 'monster');
    if (!monsterId) continue;
    const table = TABLES[tierFor(monsterId)];
    const rng = new RngCursor(seedRng(deriveSeed(state.seed, 'loot', e.id)));
    const entry = table && rollEntry(table, rng);
    if (!entry?.item) continue;
    const [min, max] = entry.count ?? [1, 1];
    const count = min >= max ? min : min + rng.die(max - min + 1) - 1;
    effects.push({ type: 'giveItem', owner: 'party', item: entry.item, count });
    events.push({ type: 'lootDropped', entityId: e.id, item: entry.item, count } as LootDroppedEvent);
  }
  return { effects, events };
}
