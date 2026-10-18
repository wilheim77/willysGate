import { type ActionOutcome, type GameEvent, type GameState, type JsonValue, type RngCursor, type Ruleset, dialogueOf, hasCondition, hasTag, tagValue } from '../../engine';

/**
 * Tracks what happened to each procedural rival (docs/willy/DESIGN.md §17) in `systems.rivals`
 * and tells the Narrador about it (`rivalEncountered`, narrator/plantas.json → rivalAparece).
 * The rival's own data (name, race, mania...) lives on the entity as tags, set once when it's
 * generated (content/willy/gen/rivals.ts); this hook never needs the generator or the seed.
 */

interface RivalRecord {
  id: string;
  planta: number;
  ranura: number;
  legendario?: string;
  plantas: number[];
  desenlace?: 'derrotado' | 'pacto' | 'huida';
}

function recordsOf(state: GameState): RivalRecord[] {
  return ((state.systems.rivals as unknown as RivalRecord[] | undefined) ?? []).slice();
}

/** The Narrador's fields for this rival (narrator/plantas.json → rivalAparece), from its tags. */
function rivalFields(state: GameState, id: string, extra: Record<string, JsonValue>): GameEvent {
  const e = state.entities[id];
  return {
    type: 'rivalEncountered',
    rival: id,
    rivalNombre: (e && tagValue(e, 'rnombre')) ?? e?.name ?? id,
    rivalApodo: (e && tagValue(e, 'rapodo')) ?? '',
    rivalApellido: (e && tagValue(e, 'rapellido')) ?? '',
    rivalLugar: (e && tagValue(e, 'rlugar')) ?? '',
    rivalOficio: (e && tagValue(e, 'roficio')) ?? '',
    rivalRaza: (e && tagValue(e, 'rraza')) ?? '',
    rivalMania: (e && tagValue(e, 'rmania')) ?? '',
    rivalGenero: (e && tagValue(e, 'genero')) ?? 'm',
    rivalRazaId: (e && tagValue(e, 'raza')) ?? '',
    comportamiento: (e && tagValue(e, 'comportamiento')) ?? (e && hasTag(e, 'legendario') ? 'legendario' : ''),
    legendario: !!e && hasTag(e, 'legendario'),
    ...extra,
  } as unknown as GameEvent;
}

export function rivalAfterCommand(_ruleset: Ruleset, state: GameState, events: GameEvent[], _rng: RngCursor): ActionOutcome {
  const out: ActionOutcome = { effects: [], events: [] };
  const records = recordsOf(state);
  const byId = new Map(records.map((r) => [r.id, r]));
  let changed = false;

  // 1) A fresh encounter or a new negotiation with one who fled before: the dialogue just opened.
  const started = events.find((e) => e.type === 'dialogueStarted' && (e as unknown as { treeId: string }).treeId === 'rivalEncuentro') as
    | (GameEvent & { partnerId?: string })
    | undefined;
  if (started?.partnerId) {
    const r = byId.get(started.partnerId);
    const primeraVez = !r || r.desenlace === undefined;
    out.events.push(rivalFields(state, started.partnerId, { evento: 'presentacion', primeraVez, ...(r?.desenlace ? { desenlaceAnterior: r.desenlace } : {}) }));
  }

  // 2) The pact or the "dejar ir" node of that same tree resolved this command.
  const resolved = events.find(
    (e) => e.type === 'dialogueNode' && (e as unknown as { treeId: string }).treeId === 'rivalEncuentro' && ['pactoExito', 'huidaOk'].includes((e as unknown as { nodeId: string }).nodeId),
  ) as (GameEvent & { nodeId: string }) | undefined;
  const partnerId = dialogueOf(state)?.partnerId;
  if (resolved && partnerId) {
    const outcome: RivalRecord['desenlace'] = resolved.nodeId === 'pactoExito' ? 'pacto' : 'huida';
    const r = byId.get(partnerId);
    if (r && r.desenlace !== outcome) {
      byId.set(partnerId, { ...r, desenlace: outcome });
      changed = true;
      out.events.push(rivalFields(state, partnerId, { evento: outcome }));
    }
  }

  // 3) Anyone tagged "rival" who's gone down, in this command or an earlier one not yet recorded.
  for (const e of Object.values(state.entities)) {
    if (!hasTag(e, 'rival') || !hasCondition(e, 'eliminado')) continue;
    const r = byId.get(e.id);
    if (!r || r.desenlace === 'derrotado') continue;
    byId.set(e.id, { ...r, desenlace: 'derrotado' });
    changed = true;
    out.events.push(rivalFields(state, e.id, { evento: 'derrota' }));
  }

  // 4) A pact-return showing up: a loyal ally at Willy's side, or a tramposo's betrayal ambush.
  // Both are silent otherwise (no dialogue for a pact return, docs/willy/DESIGN.md §17), so this
  // is the only chance for the Narrador to say so; announced once per rival.
  if (events.some((e) => e.type === 'combatStarted' || e.type === 'mapChanged')) {
    for (const e of Object.values(state.entities)) {
      if (!hasTag(e, 'vuelta:pacto') || hasTag(e, 'anunciado:vuelta')) continue;
      const traiciona = hasTag(e, 'traicion:si');
      out.events.push(rivalFields(state, e.id, traiciona ? { evento: 'traicion', traicion: true } : { evento: 'pacto', comoAliado: true }));
      out.effects.push({ type: 'setEntity', entityId: e.id, addTags: ['anunciado:vuelta'] });
    }
  }

  if (changed) out.effects.push({ type: 'setSystem', system: 'rivals', value: [...byId.values()] as unknown as JsonValue });
  return out;
}
