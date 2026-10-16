import { type CommandHandler, type Ruleset, applyEffects, requireControlled, stat } from '../../engine';

/**
 * A deliberately non-D&D ruleset (vampire-hunter flavoured: Thirst, Faith, 2d6 checks).
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

export const toyRuleset: Ruleset = {
  id: 'toy',
  version: 1,
  stats: { will: { label: 'Voluntad' }, stride: { label: 'Zancada' } },
  resources: {
    blood: { label: 'Sangre', refresh: 'longRest', visible: true },
    thirst: { label: 'Sed', refresh: 'never', visible: true },
    faith: { label: 'Fe', refresh: 'never', visible: true },
  },
  conditions: { bitten: { label: 'Mordido' } },
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
};
