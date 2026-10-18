import { type Entity, type GameEvent, type GameState, hasTag } from '../../../engine';

/**
 * The show's event language (DESIGN.md → «Logros»: one pattern language for audience rules,
 * sponsor tastes, achievements and the Narrador). Content data writes patterns against
 * *views*: Spanish, flattened descriptions of what happened («entityDefeated» with
 * `objetivo.tipo`, `causa`, `actor.id`...). `eventViews` turns one command's engine and
 * ruleset events into those views; `matchPattern` checks a `{ evento, donde }` pattern.
 */

export type View = { evento: string } & Record<string, unknown>;

export interface Pattern {
  evento: string;
  donde?: Record<string, unknown>;
}

/** What an entity looks like inside a view. */
export function entityView(e: Entity | undefined): Record<string, unknown> | undefined {
  if (!e) return undefined;
  const hp = e.resources.vida;
  return {
    id: e.id,
    nombre: e.name,
    faccion: e.factionId,
    tipo: hasTag(e, 'elite') || hasTag(e, 'guardian') ? 'elite' : hasTag(e, 'jefe') ? 'jefe' : 'normal',
    etiquetas: e.tags,
    vidaPct: hp && hp.max > 0 ? Math.round((100 * Math.max(0, hp.current)) / hp.max) : 0,
  };
}

/** Defeat causes from the ruleset, in the words the data uses. */
const CAUSES: Record<string, string> = {
  vacio: 'fueraDePlano',
  fueraDePlano: 'fueraDePlano',
  caida: 'caida',
  superficie: 'superficie',
  choque: 'choque',
  colision: 'choque',
  roto: 'decorado',
  explosion: 'explosion',
  trampa: 'trampa',
};

const SURFACE_RESULTS: Record<string, string> = { fuego: 'llamas' };

/** Who did the command: the actor of its first action, ability or move. */
export function commandActor(events: GameEvent[], state: GameState): string | undefined {
  for (const e of events) {
    const f = e as unknown as Record<string, unknown>;
    if (e.type === 'actionPerformed' && typeof f.actorId === 'string') return f.actorId;
    if ((e.type === 'skillUsed' || e.type === 'entityMoved' || e.type === 'showOff') && typeof f.entityId === 'string') return f.entityId;
  }
  return state.turn.mode === 'combat' ? (state.turn.activeEntityId ?? undefined) : undefined;
}

/**
 * Views for one command's events. `state` is the state after the command (entities that fell
 * are still there, eliminated). Some views are synthesised: multiKill (two or more monsters in
 * one command), checkRolled for a natural 1, surfaceReacted for a surface turning into another.
 */
export function eventViews(events: GameEvent[], state: GameState, extra: { firstSkillUse?: Set<string> } = {}): View[] {
  const out: View[] = [];
  const actorId = commandActor(events, state);
  const ent = (id: unknown) => (typeof id === 'string' ? entityView(state.entities[id]) : undefined);
  const monstersHit = events.filter((e) => e.type === 'damageDealt').map((e) => state.entities[(e as unknown as { targetId: string }).targetId]).filter((t) => t && t.factionId !== 'concursantes' && !hasTag(t, 'objeto'));
  let kills = 0;
  for (const e of events) {
    const f = e as unknown as Record<string, unknown>;
    switch (e.type) {
      case 'entityDefeated': {
        const target = state.entities[f.entityId as string];
        const view: View = { evento: 'entityDefeated', objetivo: entityView(target), causa: CAUSES[String(f.cause)] ?? f.cause, causaOriginal: f.cause, actor: ent(f.actorId ?? actorId), elemento: f.element };
        out.push(view);
        if (target && target.factionId === 'monstruos' && !hasTag(target, 'objeto')) kills += 1;
        break;
      }
      case 'attackRolled': {
        const v: View = { evento: 'attackResolved', actor: ent(f.attackerId), objetivo: ent(f.targetId), acierto: !!f.hit, critico: !!f.crit, natural: f.natural, habilidad: f.label };
        out.push(v);
        if (f.natural === 1) out.push({ evento: 'checkRolled', actor: ent(f.attackerId), natural: 1 });
        break;
      }
      case 'exploded':
        out.push({ evento: 'objectDestroyed', explota: true, objeto: ent(f.entityId), enemigosAfectados: monstersHit.length });
        break;
      case 'entityFell':
        out.push({ evento: 'fell', entidad: ent(f.entityId), niveles: f.levels });
        break;
      case 'entityPushed': {
        const c = f.collidedWith as { entityId?: string; wall?: boolean } | undefined;
        out.push({ evento: 'entityPushed', actor: ent(actorId), objetivo: ent(f.entityId), choque: c ? (c.wall ? 'muro' : 'entidad') : f.into === 'void' ? 'vacio' : undefined });
        break;
      }
      case 'surfaceChanged': {
        const changes = (f.changes as { from: string | null; to: string | null }[]) ?? [];
        const reacted = changes.find((c) => c.from && c.to && c.from !== c.to);
        if (reacted) out.push({ evento: 'surfaceReacted', de: reacted.from, resultado: SURFACE_RESULTS[reacted.to!] ?? reacted.to, actor: ent(actorId), enemigosAfectados: monstersHit.length });
        break;
      }
      case 'skillUsed':
        out.push({ ...f, evento: 'skillUsed', actor: ent(f.entityId), primeraVezEnPartida: !!extra.firstSkillUse?.has(`${f.entityId}:${f.habilidad}`) });
        break;
      case 'trapSpotted':
        out.push({ evento: 'trapDetected', actor: ent(f.entityId ?? f.spotterId) });
        break;
      case 'trapTriggered':
        out.push({ evento: 'trapTriggered', entidad: ent(f.entityId) });
        break;
      case 'itemUsed':
      case 'itemSold':
      case 'itemEquipped': {
        // The item stays a plain id (item: 'extintor'); its tags and type are flat keys for
        // patterns like «item.etiquetas» (sponsors.json).
        const tags = (f.etiquetas as string[] | undefined) ?? [];
        out.push({ ...f, evento: e.type, actor: (f.actor as object | undefined) ? { ...ent(f.actorId), ...(f.actor as object) } : ent(f.actorId), 'item.etiquetas': tags, 'item.tipo': f.tipo });
        break;
      }
      case 'turnStarted':
        out.push({ evento: 'turnStarted', entityId: f.entityId, actor: ent(f.entityId) });
        break;
      default:
        // Ruleset and show events already speak the data's language (showOff, skillLevelUp,
        // floorExited, achievementUnlocked, boxOpened, combatEnded is built by the caller...).
        if (e.type !== 'combatEnded') out.push({ ...f, evento: e.type });
    }
  }
  if (kills >= 2) out.push({ evento: 'multiKill', cantidad: kills });
  return out;
}

/** Reads `a.b.c` from a view. */
export function pathValue(view: Record<string, unknown>, path: string): unknown {
  if (path in view) return view[path];
  let v: unknown = view;
  for (const k of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

/** One `donde` condition: a value, {min,max}, {en:[...]}, {tiene:x}, {existe:bool}. */
export function matchValue(actual: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== 'object' || Array.isArray(cond)) return actual === cond;
  const c = cond as Record<string, unknown>;
  if ('existe' in c) return (actual !== undefined && actual !== null) === c.existe;
  if ('en' in c) return Array.isArray(c.en) && c.en.includes(actual);
  if ('tiene' in c) return Array.isArray(actual) && actual.includes(c.tiene);
  if ('min' in c || 'max' in c) {
    if (typeof actual !== 'number') return false;
    return (c.min === undefined || actual >= (c.min as number)) && (c.max === undefined || actual <= (c.max as number));
  }
  return false;
}

export function matchPattern(view: View, pattern: Pattern): boolean {
  if (view.evento !== pattern.evento) return false;
  return Object.entries(pattern.donde ?? {}).every(([path, cond]) => matchValue(pathValue(view, path), cond));
}
