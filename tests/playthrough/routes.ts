import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { dialogueOf, evaluateCondition, hasCondition, hasTag, itemCount, type GameState, type MapZone } from '../../engine';
import { dnd5e } from '../../rulesets/dnd5e';
import { buildActWorld, DEFAULT_PROTAGONIST, makeEngine, type ProtagonistSpec } from './setup';
import {
  checkExits,
  driveDialogue,
  exitsAllowedFrom,
  idleStep,
  interact,
  interactables,
  loadTriggers,
  newDriverCtx,
  type ChoicePolicy,
  type DriverCtx,
  type Engine,
  type Trigger,
} from './driver';

/**
 * The D1xD2xD3xD4 route matrix (review-8 §2), driven by the DOM-free Driver (driver.ts),
 * which replicates src/game/controller.ts's `onIdle` order (encounters -> scenes ->
 * triggers; levelling is the engine's own, after every command), plus interacting with every "dialogue:"-tagged NPC on the map (a separate
 * client action from onIdle, but one a real player does too), plus leaving through an
 * allowed exit once there's nothing left to do locally.
 *
 * Each decision's hub node is scripted directly; everything else (including which NPCs to
 * talk to, and which checked choice to retry for) is left to the generic "progress a
 * not-yet-seen critical flag" policy, with a static look-ahead so a choice whose *check*
 * gates a critical flag gets picked (and its roll forced to succeed) even on a dry run that
 * happened to miss - see driver.ts's `criticalPotential`/`reachableFlags`.
 *
 * As of the turn-order dedup fix (startCombat no longer double-lists allies) all four D1
 * routes reach epilogo_visto; this file now varies D2/D3/D4 on top, plus a second
 * protagonist build (elf rogue) to exercise `rule: race`/`rule: class` dialogue branches.
 */

const D1_HUB = 'noche_antorchas@hub';
// Choice indices at noche_antorchas's "hub" node (stable: only the two `once` info
// questions sit before them, and they never get consumed - see noche_antorchas.json).
export const D1_ROUTES: Record<string, number> = { nada: 5, mediar: 4, unirse: 2, defender: 3 };

const D2_HUB = 'galeria_sellada@decision';
// galeria_sellada.json's "decision" node: 0 encubrir (cover for Garrán), 1 confesar (he'll
// confess), 2 echar (throw him out), 3 pensarlo (postpone - not used here).
export const D2_ROUTES: Record<string, number> = { encubrir: 0, confesar: 1, echar: 2 };

const D3_HUB = 'boveda_collera@callados';
// boveda_collera.json's "callados" node: 0 destruir, 1 ponerme (wear it), 2 sellar (seal the
// mine with powder), 3 escuchar (postpone - not used here).
export const D3_ROUTES: Record<string, number> = { destruir: 0, ponerse: 1, sellar: 2 };

const D4_HUB = 'el_cobro@hub';
// el_cobro.json's "hub" node: 0 embargo, 1 cuadrilla-firma (give the mine to the Cuadrilla,
// forged signature), 4 refinanciar, 5 quemar (burn the deed). Indices 2/3 (the elf-locked
// variant) and 6 (pensarlo) are skipped for this smoke/deep split.
export const D4_ROUTES: Record<string, number> = { embargo: 0, cuadrilla_firma: 1, refinanciar: 4, quemar: 5 };

// door_cripta's lock-picking choice ("Forzar la cerradura", DC 17, no prerequisite) is an
// intentional early shortcut into the mine - content/intereses/dialogues/door_cripta.json's
// own comment calls it "optional... the Pozo always works", i.e. not the intended route.
// The real mine (level-5-ish monsters) is lethal to the level-3/4 party a human player would
// still have at this point in the story: reported separately, and sidestepped here so the
// Driver follows the route the story actually paces - same as a player who reads "needs the
// baron's key" and doesn't try to pick a 400-year-old monastery lock instead.
const SKIP_INTERACTS = new Set(['door_cripta']);

export const MAP_ORDER = ['camino', 'barranco', 'plaza', 'callejon', 'abadia', 'calles', 'escorial', 'tunel', 'mina', 'boveda'];

function criticalFlags(): string[] {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'content', 'intereses', 'flags.json'), 'utf8')) as Record<string, unknown>;
  return Object.entries(raw)
    .filter(([, v]) => typeof v === 'object' && v !== null && (v as Record<string, unknown>).critical === true)
    .map(([k]) => k);
}

/** Maps with a trigger that would fire right now if only the party stood there (its `when`
 *  holds, it hasn't been shown yet) - e.g. noche_antorchas only checks on "plaza", so once
 *  acceso_contrabando is earned somewhere else, that's exactly where to head back to. */
function mapsWithPendingTrigger(engine: Engine, state: GameState, ctx: DriverCtx, triggers: Trigger[]): Set<string> {
  const leader = state.entities[ctx.leaderId];
  if (!leader) return new Set();
  return new Set(
    triggers
      .filter((t) => t.map && !ctx.triggersShown.has(t.id) && engine.content.dialogues[t.dialogue] && evaluateCondition(dnd5e, state, leader.id, t.when))
      .map((t) => t.map!),
  );
}

function pickExit(exits: MapZone[], visited: Set<string>, pending: Set<string>): MapZone {
  const awaited = exits.find((z) => pending.has(String(z.properties.to)));
  if (awaited) return awaited;
  const fresh = exits.find((z) => !visited.has(String(z.properties.to)));
  if (fresh) return fresh;
  // Otherwise head toward whichever allowed exit leads furthest along MAP_ORDER, to avoid
  // oscillating between two already-visited neighbours forever.
  return [...exits].sort((a, b) => MAP_ORDER.indexOf(String(b.properties.to)) - MAP_ORDER.indexOf(String(a.properties.to)))[0] ?? exits[0]!;
}

/** Essential NPCs must never actually die (dnd5e's dropToZero stabilises them instead -
 *  see rulesets/dnd5e/resolve.ts:228,265); coronas must never go negative. The protagonist
 *  ("hero") is NOT essential - dying is a real game-over state, not a bug - so a route that
 *  gets hero killed is reported as "wiped", not asserted against here. */
function assertInvariants(state: GameState, where: string) {
  for (const e of Object.values(state.entities)) {
    if (hasTag(e, 'essential')) expect(hasCondition(e, 'dead'), `${where}: essential NPC "${e.id}" died`).toBe(false);
  }
  expect(itemCount(state, 'party', 'coronas'), `${where}: coronas went negative`).toBeGreaterThanOrEqual(0);
}

export interface Combo {
  d1: keyof typeof D1_ROUTES;
  d2: keyof typeof D2_ROUTES;
  d3: keyof typeof D3_ROUTES;
  d4: keyof typeof D4_ROUTES;
  protagonist?: ProtagonistSpec;
  label?: string;
}

export interface RouteResult {
  state: GameState;
  visited: Set<string>;
  critical: Set<string>;
  steps: number;
  wiped: boolean;
}

export function runRoute(combo: Combo, seed: number, observe?: (state: GameState) => void): RouteResult {
  const engine = makeEngine();
  const ctx = newDriverCtx('hero');
  const triggers = loadTriggers();
  const critical = criticalFlags();
  const seenCritical = new Set<string>();
  const openedInteracts = new Set<string>(SKIP_INTERACTS);
  const policy: ChoicePolicy = {
    choices: {
      [D1_HUB]: D1_ROUTES[combo.d1]!,
      [D2_HUB]: D2_ROUTES[combo.d2]!,
      [D3_HUB]: D3_ROUTES[combo.d3]!,
      [D4_HUB]: D4_ROUTES[combo.d4]!,
    },
    // "Mediar" means the mediation works (the truce): a failed roll is the "nada" outcome
    // (the baron hangs), which would make D4's baron-alive choices unavailable by chance.
    ...(combo.d1 === 'mediar' ? { forcedChecks: { 'noche_antorchas@mediar_hub': 'success' as const } } : {}),
  };

  let state = buildActWorld(engine, seed, 'camino', combo.protagonist ?? DEFAULT_PROTAGONIST);
  const visited = new Set<string>([state.map.id]);
  assertInvariants(state, 'fresh game');
  observe?.(state);

  let steps = 0;
  let stall = 0;
  let wiped = false;
  const MAX_STEPS = 2000;
  const MAX_STALL = 20; // pure travel with nothing new happening, for this many hops in a row
  for (; steps < MAX_STEPS && stall < MAX_STALL; steps++) {
    if (hasCondition(state.entities.hero!, 'dead')) {
      wiped = true; // a real game-over, not a harness bug - stop rather than flail forever.
      break;
    }
    if (dialogueOf(state)) {
      state = driveDialogue(engine, state, ctx, policy, seenCritical, critical);
      assertInvariants(state, `after dialogue (map ${state.map.id})`);
      observe?.(state);
      stall = 0;
      continue;
    }
    const idled = idleStep(engine, state, ctx, triggers);
    if (idled) {
      state = idled;
      assertInvariants(state, `after idle step (map ${state.map.id})`);
      observe?.(state);
      stall = 0;
      continue;
    }
    const candidate = interactables(state, ctx).find((c) => !openedInteracts.has(c.treeId));
    if (candidate) {
      openedInteracts.add(candidate.treeId);
      const r = interact(engine, state, ctx, candidate.entityId);
      if (r) {
        state = r;
        assertInvariants(state, `after interacting with ${candidate.entityId} (map ${state.map.id})`);
        observe?.(state);
        stall = 0;
      }
      continue;
    }
    const exits = exitsAllowedFrom(state);
    if (!exits.length) break; // nothing left to do here, nowhere allowed to go: done.
    const exit = pickExit(exits, visited, mapsWithPendingTrigger(engine, state, ctx, triggers));
    const next = checkExits(state, engine, ctx, exit);
    if (!next) break; // travel refused for some other reason; stop rather than loop.
    state = next;
    visited.add(state.map.id);
    assertInvariants(state, `after travelling to ${state.map.id}`);
    observe?.(state);
    stall++; // travelling alone isn't progress - only reset once something actually happens
  }
  expect(steps, `${comboLabel(combo)} (seed ${seed}) did not settle within ${MAX_STEPS} steps - possible loop`).toBeLessThan(MAX_STEPS);
  // A stall (pure travel, nothing new for MAX_STALL hops) means this greedy run has gone as
  // far as it currently can - reported via epilogo_visto/visited below, not a hard failure:
  // it may be the driver's own routing/policy running out of ideas rather than a softlock
  // (MAX_STEPS above is the actual infinite-loop guard).

  for (const f of Object.keys(state.flags)) if (state.flags[f] === true && critical.includes(f)) seenCritical.add(f);
  return { state, visited, critical: seenCritical, steps, wiped };
}

export function comboLabel(c: Combo): string {
  return c.label ?? `D1=${c.d1} D2=${c.d2} D3=${c.d3} D4=${c.d4}${c.protagonist ? ' (elf rogue)' : ''}`;
}

/** Per flags.json's own description, each D1/D2/D3/D4 choice sets a specific, documented
 *  "which branch did I take" flag (independent of the critical ones) - asserting those
 *  lets us confirm the run actually took the SCRIPTED branch, not just that it reached the
 *  epilogue by some other route. This is the lighter stand-in for review-8's full
 *  "combination -> exact epilogue nodes visited" table (out of scope for this pass). */
export const BRANCH_FLAG: Record<string, string> = {
  nada: 'd1_nada', mediar: 'd1_mediar', unirse: 'd1_cuadrilla', defender: 'd1_abadia',
  encubrir: 'd2_encubierto', confesar: 'd2_confesara', echar: 'd2_expulsado',
  destruir: 'd3_destruida', ponerse: 'd3_puesta', sellar: 'd3_sellada',
  embargo: 'd4_embargo', cuadrilla_firma: 'd4_cuadrilla', refinanciar: 'd4_refinanciar', quemar: 'd4_quemar',
};

// Some D4 choices are only on offer when the baron is alive (el_cobro.json's
// "cuadrilla_firma"/"refinanciar" both require `not: {flag: baron_muerto}`), and D1=nada
// kills him (noche_antorchas.json's "nada_2" sets baron_muerto). Review-8 §2 calls this out
// by name as an expected invalid combination, not a bug: the driver falls back to whatever
// D4 choice IS available (see driver.ts), so this combo's branch flag just won't match -
// skip the branch-taken assertion for it rather than fail on something the content means
// to disallow.
export function d4UnavailableFor(combo: Combo): boolean {
  return combo.d1 === 'nada' && (combo.d4 === 'cuadrilla_firma' || combo.d4 === 'refinanciar');
}

// Heavy run: `QA_DEEP=1 npm run test:qa`. Plain `npm test`/`npm run check` only runs 4 smoke
// combos (one per D1 option, varying D2/D3/D4 together) so the regular dev loop stays fast.
export const DEEP = process.env.QA_DEEP === '1';

export const SMOKE_COMBOS: Combo[] = [
  { d1: 'nada', d2: 'encubrir', d3: 'destruir', d4: 'embargo' },
  { d1: 'mediar', d2: 'confesar', d3: 'ponerse', d4: 'refinanciar' },
  { d1: 'unirse', d2: 'echar', d3: 'sellar', d4: 'quemar' },
  { d1: 'defender', d2: 'encubrir', d3: 'destruir', d4: 'cuadrilla_firma' },
];

export const ALL_COMBOS: Combo[] = DEEP
  ? (Object.keys(D1_ROUTES) as (keyof typeof D1_ROUTES)[]).flatMap((d1) =>
      (Object.keys(D2_ROUTES) as (keyof typeof D2_ROUTES)[]).flatMap((d2) =>
        (Object.keys(D3_ROUTES) as (keyof typeof D3_ROUTES)[]).flatMap((d3) =>
          (Object.keys(D4_ROUTES) as (keyof typeof D4_ROUTES)[]).map((d4) => ({ d1, d2, d3, d4 })),
        ),
      ),
    )
  : SMOKE_COMBOS;

