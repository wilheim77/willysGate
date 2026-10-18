import {
  type BaseCommand,
  type CommandHandler,
  type Effect,
  type GameEvent,
  RngCursor,
  applyEffects,
  fail,
  itemCount,
  requireControlled,
} from '../../engine';
import { ITEMS } from './data';
import { tagValues } from './character';
import { parseDice, rollDice, sum } from './dice';

/**
 * Ruleset commands for gear from loot (see loot.ts): equipping magic weapons, armour,
 * rings and cloaks (a tag, not an action — no action economy cost), and drinking a potion
 * outside combat (in combat, potions are a bonus-action item in the normal action list,
 * see actions.ts's `item:<id>` actions).
 */

export interface EquipItemCommand extends BaseCommand {
  type: 'equipItem';
  entityId: string;
  item: string;
}

export interface ItemEquippedEvent extends GameEvent {
  type: 'itemEquipped';
  entityId: string;
  item: string;
  /** Mechanical id of the item that was bumped out of that slot, if any (the UI then asks who keeps it). */
  replaced?: string;
}

const EQUIPPABLE = new Set(['weapon', 'armor', 'ring', 'cloak']);

export const equipItem: CommandHandler<EquipItemCommand> = (state, cmd, { ruleset }) => {
  const r = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!r.ok) return r;
  const item = ITEMS[cmd.item];
  if (!item || !EQUIPPABLE.has(item.kind)) return fail('action_invalid', `"${cmd.item}" no se puede equipar.`);
  if (itemCount(state, 'party', cmd.item) <= 0) return fail('action_invalid', 'No tienes ese objeto.');
  // One equipped item per mechanical slot (kind): equipping a second ring bumps the first out
  // of that slot (the UI then asks who keeps it, or puts it back in the shared bag).
  const replaced = tagValues(r.entity, 'item').find((id) => ITEMS[id]?.kind === item.kind);
  const effects: Effect[] = [];
  // A drop is one physical item: nobody else may be wearing it at the same time.
  for (const other of Object.values(state.entities)) {
    if (other.id !== cmd.entityId && tagValues(other, 'item').includes(cmd.item)) {
      effects.push({ type: 'setEntity', entityId: other.id, removeTags: [`item:${cmd.item}`] });
    }
  }
  effects.push({ type: 'setEntity', entityId: cmd.entityId, removeTags: replaced ? [`item:${replaced}`] : [], addTags: [`item:${cmd.item}`] });
  const applied = applyEffects(ruleset, state, effects);
  const event: ItemEquippedEvent = { type: 'itemEquipped', entityId: cmd.entityId, item: cmd.item, ...(replaced ? { replaced } : {}) };
  return { ok: true, state: applied.state, events: [...applied.events, event] };
};

export interface UseItemCommand extends BaseCommand {
  type: 'useItem';
  entityId: string;
  item: string;
}

export interface ItemUsedEvent extends GameEvent {
  type: 'itemUsed';
  entityId: string;
  item: string;
  amount: number;
}

export const useItem: CommandHandler<UseItemCommand> = (state, cmd, { ruleset }) => {
  const r = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!r.ok) return r;
  if (state.turn.mode === 'combat') return fail('action_invalid', 'En combate, bebe la poción desde el menú de acciones.');
  const item = ITEMS[cmd.item];
  if (!item || item.kind !== 'potion') return fail('action_invalid', 'Solo las pociones se usan así, fuera de combate.');
  if (itemCount(state, 'party', cmd.item) <= 0) return fail('action_invalid', 'No tienes ese objeto.');
  const rng = new RngCursor(state.rng);
  const dice = parseDice(item.heal ?? '0');
  const amount = sum(rollDice(rng, dice.count, dice.sides)) + dice.bonus;
  const effects: Effect[] = [
    { type: 'modifyResource', entityId: cmd.entityId, resource: 'hp', delta: amount },
    { type: 'giveItem', owner: 'party', item: cmd.item, count: -1 },
  ];
  const applied = applyEffects(ruleset, { ...state, rng: rng.state }, effects);
  const event: ItemUsedEvent = { type: 'itemUsed', entityId: cmd.entityId, item: cmd.item, amount };
  return { ok: true, state: applied.state, events: [...applied.events, event] };
};
