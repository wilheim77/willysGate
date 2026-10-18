import { it, expect } from 'vitest';
import { dialogueOf, dialogueChoices, zonesOf, gateSettled, haltsHere } from '../../engine';
import { dnd5e } from '../../rulesets/dnd5e';
import { buildActWorld, makeEngine } from '../playthrough/setup';

it('camino: thinking it over at the miners re-arms the gate; Garran recruited settles his', () => {
  const engine = makeEngine();
  let s = buildActWorld(engine, 1, 'camino');
  const mz = zonesOf(s, 'scenes').find((x) => x.name === 'mineros-cortan-el-paso')!;
  const gz = zonesOf(s, 'scenes').find((x) => x.name === 'garran-en-la-cuneta')!;
  s = engine.applyEffects(s, [{ type: 'setController', entityId: 'garran', controllerId: 'player:1', factionId: 'party' }]).state;
  expect(gateSettled(s, gz as never)).toBe(true);
  const r = engine.apply(s, { type: 'startDialogue', issuer: 'system', treeId: 'camino_mineros', actorId: 'hero', partnerId: 'minero_cabecilla' } as never);
  if (!r.ok) throw new Error(r.error.message);
  s = r.state;
  const tree = engine.content.dialogues.camino_mineros!;
  for (let i = 0; i < 30 && dialogueOf(s); i++) {
    const cs = dialogueChoices(dnd5e, s, tree).filter((c) => c.available);
    const r2 = engine.apply(s, { type: 'chooseOption', issuer: 'player:1', index: cs.length ? cs[cs.length - 1]!.index : 0 } as never);
    if (!r2.ok) throw new Error(r2.error.message);
    s = r2.state;
  }
  expect(gateSettled(s, mz as never)).toBe(false);
  expect(haltsHere(dnd5e, s, { x: mz.x, y: 9 }, { x: mz.x - 1, y: 9 })).toBe(true);
});
