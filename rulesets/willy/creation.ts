import { type CreationChoices, type CreationSpec, type CreationStep, type Entity, type Vec2, pointsSpent } from '../../engine';
import { ATTRS, ATTR_LABELS, createWilly } from './character';
import { type Attr, CLASSES, WILLY } from './data';

/** Free points on top of base 5 + castreño +1 + class: 0..3 each, 3 in total. */
const POINTS: Extract<CreationStep, { kind: 'points' }> = {
  id: 'puntos',
  kind: 'points',
  label: 'Puntos libres',
  help: `Willy empieza con 5 en todo, +1 por ser de Castro y lo que dé su clase. Reparte ${WILLY.puntosLibres} puntos más donde quieras.`,
  stats: ATTRS.map((a) => ({ id: a, label: ATTR_LABELS[a] })),
  min: 0,
  max: 3,
  budget: WILLY.puntosLibres,
  cost: { 0: 0, 1: 1, 2: 2, 3: 3 },
  recommended: (choices) => recommendedPoints(String(choices.clase ?? 'butanero')),
  bonuses: (choices) => {
    const cls = CLASSES[String(choices.clase)];
    return Object.fromEntries(ATTRS.map((a) => [a, WILLY.atributosBase[a] + (WILLY.atributosOrigen[a] ?? 0) + (cls?.atributos[a] ?? 0)]));
  },
};

/** Where the Narrator would put the points: the class's best attribute first. */
function recommendedPoints(classId: string): Record<string, number> {
  const cls = CLASSES[classId];
  const best = (Object.entries(cls?.atributos ?? {}) as [Attr, number][]).sort((a, b) => b[1] - a[1]);
  const out: Record<string, number> = Object.fromEntries(ATTRS.map((a) => [a, 0]));
  if (best[0]) out[best[0][0]] = 2;
  out[best[1]?.[0] ?? 'agu'] = (out[best[1]?.[0] ?? 'agu'] ?? 0) + 1;
  return out;
}

/** Willy is always human: the casting only picks a class (and three free points). */
export const WILLY_CREATION: CreationSpec = {
  steps: [{ id: 'clase', kind: 'pick', label: 'Oficio', options: Object.values(CLASSES).map((c) => ({ id: c.id, label: c.nombre, text: c.resumen })) }, POINTS],
};

export function defaultCreation(): CreationChoices {
  return { clase: 'butanero', puntos: recommendedPoints('butanero') };
}

export function buildWilly(choices: CreationChoices, base: { id: string; controllerId: string; factionId: string; position: Vec2; spriteId?: string; level?: number }): Entity {
  const classId = String(choices.clase);
  if (!CLASSES[classId]) throw new Error(`willy: unknown class "${classId}"`);
  const points = (choices.puntos ?? {}) as Record<string, number>;
  const spent = pointsSpent(POINTS, points);
  if (spent === null || spent > POINTS.budget) throw new Error(`willy: invalid free points (${spent})`);
  return createWilly({ ...base, spriteId: base.spriteId ?? `willy-${classId}`, classId, points: points as Partial<Record<Attr, number>> });
}
