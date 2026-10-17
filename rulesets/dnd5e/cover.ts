import { type Entity, type GameState, type Vec2, OBSTACLE_TAG, gridDistance, hasCondition, hasLineOfSight, obstructionsBetween } from '../../engine';

/** Intact scenery: a smashed crate no longer hides anyone. */
const intact = (e: Entity | undefined): boolean => !!e && e.tags.includes(OBSTACLE_TAG) && !hasCondition(e, 'dead') && (e.resources.hp?.current ?? 1) > 0;

export interface CoverInfo {
  /** Bonus to AC: +2 half cover, +5 three-quarters. */
  bonus: number;
  label?: string;
  lineOfSight: boolean;
}

/**
 * Cover from obstacles between attacker and target (crates, barrels, pillars) and low
 * terrain. Creatures never give cover (approved simplification: easier to read).
 */
export function coverBetween(state: GameState, from: Vec2, to: Vec2): CoverInfo {
  if (!hasLineOfSight(state, from, to)) return { bonus: 0, lineOfSight: false };
  if (gridDistance(from, to) <= 1) return { bonus: 0, lineOfSight: true };
  const obstructions = obstructionsBetween(state, from, to).filter((o) => o.kind === 'entity' && intact(state.entities[o.entityId!]));
  if (obstructions.length >= 2) return { bonus: 5, label: 'cobertura de tres cuartos', lineOfSight: true };
  if (obstructions.length === 1) return { bonus: 2, label: 'cobertura media', lineOfSight: true };
  return { bonus: 0, lineOfSight: true };
}

