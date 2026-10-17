import { type CommandHandler, type Ruleset, applyEffects, requireControlled, stat } from '../../engine';

/**
 * A deliberately non-D&D ruleset (vampire-hunter flavoured: Blood, Thirst, Faith, 2d6).
 * Engine tests run against it to prove the engine has no 5e assumptions.
 */
const pray: CommandHandler<{ type: 'pray'; issuer: string; entityId: string }> = (state, cmd, { ruleset }) => {
  const actor = requireControlled(state, cmd.issuer, cmd.entityId);
  if (!actor.ok) return actor;
  const { state: next, events } = applyEffects(ruleset, state, [
    { type: 'modifyResource', entityId: cmd.entityId, resource: 'faith', delta: 1 },
    { type: 'modifyResource', entityId: cmd.entityId, resource: 'thirst', delta: -1 },
  ]);
  return { ok: true, state: next, events };
};

/** Creatures without a Blood pool (scenery, test dummies) count as standing. */
const blood = (e: { resources: Record<string, { current: number }> }) => e.resources.blood?.current ?? 1;

export const toyRuleset: Ruleset = {
  id: 'toy',
  version: 1,
  stats: { will: { label: 'Voluntad' }, stride: { label: 'Zancada' } },
  resources: {
    blood: { label: 'Sangre', refresh: 'longRest', visible: true, role: 'health' },
    thirst: { label: 'Sed', refresh: 'never', visible: true },
    faith: { label: 'Fe', refresh: 'never', visible: true },
    action: { label: 'Acción', refresh: 'turn' },
    reaction: { label: 'Reacción', refresh: 'turn' },
  },
  conditions: { bitten: { label: 'Mordido' }, staked: { label: 'Estacado' } },
  movement: { maxStep: 2, climbCost: 0 },
  movementBudget: (e) => stat(e, 'stride', 3),
  resolveCheck: (state, req, rng) => {
    const rolls = [rng.die(6), rng.die(6)];
    const will = stat(state.entities[req.actorId]!, 'will');
    const total = rolls[0]! + rolls[1]! + will;
    return {
      check: req.check,
      label: 'Voluntad',
      dice: [{ sides: 6, rolls, kept: rolls }],
      modifiers: [{ label: 'Voluntad', value: will }],
      total,
      target: req.target,
      targetLabel: 'Umbral',
      success: total >= req.target,
    };
  },
  difficulty: (state, id) => 6 + stat(state.entities[id]!, 'will'),
  dialogueConditions: { faithAtLeast: (s, id, p) => (s.entities[id]!.resources.faith?.current ?? 0) >= Number(p.min) },
  commands: { pray },

  rollInitiative: (state, id, rng) => rng.die(6) + rng.die(6) + stat(state.entities[id]!, 'will'),
  canAct: (e) => blood(e) > 0 && !e.conditions.some((c) => c.id === 'staked'),
  isStanding: (e) => blood(e) > 0,
  listActions: () => [
    { id: 'bite', label: 'Morder', cost: { action: 1 }, target: { kind: 'creature', range: 1, filter: 'hostile' }, tags: ['attack', 'melee'] },
    { id: 'mend', label: 'Remendar', cost: { action: 1 }, target: { kind: 'creature', range: 3, filter: 'ally' }, tags: ['heal'] },
  ],
  previewAction: (state, actorId, actionId) => {
    if (actionId === 'bite') return { valid: true, chance: 21 / 36, expectedDamage: 3 * (21 / 36) };
    return { valid: true, chance: 1, expectedHealing: 2 };
  },
  performAction: (state, actorId, actionId, target, rng) => {
    const id = target.entityId!;
    if (actionId === 'mend') return { effects: [{ type: 'modifyResource', entityId: id, resource: 'blood', delta: 2 }], events: [] };
    const hit = rng.die(6) + rng.die(6) >= 7;
    return {
      effects: hit ? [{ type: 'modifyResource', entityId: id, resource: 'blood', delta: -3 }] : [],
      events: [{ type: 'toyBite', hit } as never],
    };
  },
  onLeaveReach: (state, reactorId, moverId) => {
    const reactor = state.entities[reactorId]!;
    if ((reactor.resources.reaction?.current ?? 0) < 1) return null;
    return {
      effects: [
        { type: 'modifyResource', entityId: reactorId, resource: 'reaction', delta: -1 },
        { type: 'modifyResource', entityId: moverId, resource: 'blood', delta: -2 },
      ],
      events: [{ type: 'toyGrab', reactorId } as never],
    };
  },
  glossary: { umbral: { label: 'Umbral', text: 'El número que hay que igualar o superar con 2d6.' } },
  surfaces: {
    holy_water: { label: 'Agua bendita' },
    burning: { label: 'Fuego', durationRounds: 2, light: { radius: 3, intensity: 1 } },
    mud: { label: 'Barro', extraMoveCost: 1 },
    smoke: { label: 'Humo', durationRounds: 2, blocksSight: true },
  },
  surfaceReactions: [
    { surface: 'holy_water', element: 'fire', result: null },
    { surface: 'mud', element: 'fire', result: 'burning' },
    { surface: '', element: 'water', result: 'holy_water' },
  ],
  onSurface: (state, id, surface) => ({
    effects: surface === 'burning' ? [{ type: 'modifyResource', entityId: id, resource: 'blood', delta: -1 }] : [],
    events: [],
  }),
  onFall: (state, id, levels) => ({ effects: [{ type: 'modifyResource', entityId: id, resource: 'blood', delta: -levels }], events: [] }),
};
