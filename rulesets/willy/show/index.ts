import type { ActionOutcome, CommandHandler, GameEvent, GameState, RngCursor, Ruleset } from '../../../engine';
import { Resolver } from '../resolve';
import { runAudience } from './audience';
import { showConfig } from './config';
import { runShare } from './share';
import { aceptarContrato, rechazarContrato, runSponsors } from './sponsors';

/**
 * «El show»: audience, sponsors and the presenter's Share, run once after every command
 * (Ruleset.afterCommand). Order: audience (from the command's events), then the Share (from
 * the audience's changes), then the sponsors (from the same event views). Does nothing until
 * the game calls configureShow (content/willy/show.ts).
 */
export function showAfterCommand(ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  if (!showConfig() || !state.entities.willy) return { effects: [], events: [] };
  // The show's own events never feed the show again (no audience for an audience change).
  const own = events.filter((e) => !SHOW_EVENTS.has(e.type));
  if (!own.length) return { effects: [], events: [] };
  const r = new Resolver(ruleset, state, rng);
  const { views } = runAudience(r, own);
  runShare(r, own, r.events.slice());
  runSponsors(r, views, own);
  return r.outcome();
}

/**
 * Runs after the achievements (order 110): an achievement unlocked by this same command still
 * gives its audience (audience.json → «logro») and counts for the sponsors. Only that event.
 */
export function showLateAfterCommand(ruleset: Ruleset, state: GameState, events: GameEvent[], rng: RngCursor): ActionOutcome {
  if (!showConfig() || !state.entities.willy) return { effects: [], events: [] };
  const late = events.filter((e) => LATE_EVENTS.has(e.type));
  if (!late.length) return { effects: [], events: [] };
  const r = new Resolver(ruleset, state, rng);
  const { views } = runAudience(r, late);
  runShare(r, late, r.events.slice());
  runSponsors(r, views, late);
  return r.outcome();
}

// npcHelped: rivalAfterCommand (order 55, rivals.ts) runs before the show (order 50), so a
// pacted-with or let-go rival's npcHelped would otherwise never reach a sponsor's taste.
const LATE_EVENTS = new Set(['achievementUnlocked', 'npcHelped']);

const SHOW_EVENTS = new Set([
  'audienceChanged', 'audienceMilestone', 'audienceTier', 'audienceBonus',
  'meterChanged', 'shareCero', 'enAntena', 'turnEnded',
  'sponsorAffinityChanged', 'sponsorStateChanged', 'sponsorMessage', 'sponsorGift', 'sponsorWatching',
  'sponsorWithdrew', 'sponsorReturned', 'sponsorDealOffered', 'sponsorDealAccepted', 'sponsorDealDeclined',
  'sponsorDealProgress', 'sponsorDealCompleted', 'sponsorDealBroken',
  'boxDelivered', 'itemObtained', 'coinsGranted',
  // Handled by the late pass, after the achievements.
  'achievementUnlocked',
]);

export const showCommands: Record<string, CommandHandler> = { aceptarContrato, rechazarContrato };

export { configureShow, showConfig, currentPlanta, type ShowConfig } from './config';
export { audienceOf, floorMinimum, type AudienceState } from './audience';
export { sponsorsOf, sponsorData, dealData, MAX_ACTIVE_DEALS, type SponsorsState } from './sponsors';
export { shareOf, type ShareState } from './share';
export { eventViews, matchPattern, type Pattern, type View } from './patterns';
