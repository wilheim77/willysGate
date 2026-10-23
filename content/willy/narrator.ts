import type { Entity, GameEvent, GameState } from '../../engine';
import { show } from '../../rulesets/willy';
import cast from './data/cast.json';
import floors from './data/floors.json';
import itemsData from './data/items.json';
import classes from '../../rulesets/willy/data/classes.json';
import combate from './narrator/combate.json';
import logros from './narrator/logros-y-cajas.json';
import miscelanea from './narrator/miscelanea.json';
import plantas from './narrator/plantas.json';
import { viewers } from './format';

/**
 * The Narrador: picks a line for an engine event from the banks in narrator/*.json.
 * Banks and lines are written against the show's event views (rulesets/willy/show/patterns.ts):
 * `attackResolved` with `actor.id` and `critico`, `entityDefeated` with `objetivo.tipo`... so a
 * bank's `evento`/`donde` and a line's `si` use the same pattern language as audience rules,
 * sponsor tastes and achievements. Cosmetic only (it never changes the game), so Math.random
 * is fine.
 *
 * Variables (DESIGN.md → «Narrador»): {enemigo}, {objeto}, {patrocinador}, {espectadores},
 * {dano}, {presentador}... with agreement filters: {x:el} el/la, {x:un} un/una, {x:del},
 * {x:al}, {x:o} o/a ending, {x:Mayus} capital first letter. A line whose variables can't all be
 * filled is skipped.
 */
interface Line { id: string; texto: string; si?: Record<string, unknown>; prioridadExtra?: number }
interface Bank { id: string; evento: string; donde?: Record<string, unknown>; probabilidad?: number; prioridad?: number; memoria?: number; enfriamientoTurnos?: number; lineas: Line[] }

const BANKS: Bank[] = [combate, logros, miscelanea, plantas].flatMap((f) => (f as unknown as { bancos: Bank[] }).bancos);
const recent = new Map<string, string[]>();
/** Willy's turns so far, and the turn each bank last spoke (bank `enfriamientoTurnos`). */
let turns = 0;
const spokeAt = new Map<string, number>();

/** Grammatical gender of things the Narrador names: enemies from floors.json; the rest guessed. */
const GENDER: Record<string, 'm' | 'f'> = {};
for (const p of floors.plantas as unknown as { enemigos?: Record<string, { genero?: string }> }[]) {
  for (const [id, e] of Object.entries(p.enemigos ?? {})) if (e.genero === 'f' || e.genero === 'm') GENDER[id] = e.genero;
}
/** Ability ids → their names, for «{habilidad}» (class abilities and the basic ones). */
const ABILITY_NAMES: Record<string, string> = Object.fromEntries([
  ...(classes.habilidadesBasicas as { id: string; nombre: string }[]).map((h) => [h.id, h.nombre]),
  ...(classes.clases as { habilidades: { id: string; nombre: string }[] }[]).flatMap((c) => c.habilidades.map((h) => [h.id, h.nombre])),
]);

const ITEMS: Record<string, { nombre: string; genero?: string; plural?: boolean; articuloMasculino?: boolean }> = Object.fromEntries(itemsData.items.map((i) => [i.id, i as { nombre: string; genero?: string; plural?: boolean; articuloMasculino?: boolean }]));

/** Something the Narrador names, with the grammar its articles and endings need. `strongA`: a feminine noun taking el/un (el agua). */
interface Named { name: string; gender: 'm' | 'f'; plural?: boolean; strongA?: boolean }

function guessGender(name: string): 'm' | 'f' {
  const first = name.trim().split(/\s+/)[0]!.toLowerCase();
  return /a$/.test(first) && !/ma$/.test(first) ? 'f' : 'm';
}

function entityNamed(e: Entity | undefined): Named | undefined {
  if (!e) return undefined;
  const tag = e.tags.find((t) => t.startsWith('genero:'))?.slice('genero:'.length);
  const gender = tag === 'f' || tag === 'm' ? tag : (GENDER[e.spriteId] ?? guessGender(e.name));
  return { name: e.name, gender };
}

function itemNamed(id: unknown): Named | undefined {
  if (typeof id !== 'string') return undefined;
  const it = ITEMS[id];
  const name = it?.nombre ?? id;
  return { name, gender: it?.genero === 'f' || it?.genero === 'm' ? it.genero : guessGender(name), ...(it?.plural ? { plural: true } : {}), ...(it?.articuloMasculino ? { strongA: true } : {}) };
}

/** Everything a line may name for this event. */
function context(view: Record<string, unknown>, state: GameState): Record<string, Named | string | number> {
  const ctx: Record<string, Named | string | number> = {};
  for (const [k, v] of Object.entries(view)) if (typeof v === 'string' || typeof v === 'number') ctx[k] = v;
  const idOf = (x: unknown) => (x && typeof x === 'object' ? (x as { id?: string }).id : typeof x === 'string' ? x : undefined);
  const foeId = idOf(view.objetivo) ?? idOf(view.targetId) ?? idOf(view.entidad) ?? (typeof view.entityId === 'string' && view.entityId !== 'willy' ? view.entityId : undefined);
  const foe = entityNamed(foeId ? state.entities[foeId] : undefined);
  if (foe) ctx.enemigo = foe;
  const obj = itemNamed(view.item ?? view.objeto) ?? entityNamed(idOf(view.objeto) ? state.entities[idOf(view.objeto)!] : undefined);
  if (obj) ctx.objeto = obj;
  if (typeof view.amount === 'number') ctx.dano = view.amount;
  // Reward boxes: «una caja de {caja}» on an unlock, «{cantidad} objetos» on an opening.
  const reward = view.recompensa as { caja?: unknown } | undefined;
  if (typeof reward?.caja === 'string') ctx.caja = reward.caja;
  if (Array.isArray(view.objetos)) ctx.cantidad = view.objetos.length;
  if (typeof view.clase === 'string') {
    const nombre = (classes.clases as { id: string; nombre: string }[]).find((c) => c.id === view.clase)?.nombre;
    if (nombre) ctx.clase = { name: nombre, gender: 'm' };
  }
  if (typeof view.espectadores === 'number') ctx.espectadores = viewers(Number(view.espectadores));
  if (typeof view.patrocinador === 'string') ctx.patrocinador = view.patrocinador;
  if (typeof view.logro === 'string') ctx.logro = view.logro;
  ctx.presentador = { name: cast.presentador.nombre, gender: cast.presentador.genero === 'f' ? 'f' : 'm' };
  ctx.presentadorCorto = { name: cast.presentador.corto, gender: cast.presentador.genero === 'f' ? 'f' : 'm' };
  ctx.presentadorApodo = cast.presentador.apodo;
  const willy = state.entities.willy;
  if (willy?.resources.vida) ctx.vida = willy.resources.vida.current;
  // Rival variables travel on the event already (rivalNombre...); {rival:o} needs its gender.
  if (typeof view.rivalGenero === 'string') ctx.rival = { name: String(view.rivalNombre ?? ''), gender: view.rivalGenero === 'f' ? 'f' : 'm' };
  return ctx;
}

const ARTICLES = {
  el: { m: 'el', f: 'la' },
  un: { m: 'un', f: 'una' },
  del: { m: 'del', f: 'de la' },
  al: { m: 'al', f: 'a la' },
};
const ARTICLES_PLURAL = {
  el: { m: 'los', f: 'las' },
  un: { m: 'unos', f: 'unas' },
  del: { m: 'de los', f: 'de las' },
  al: { m: 'a los', f: 'a las' },
};

function fill(text: string, ctx: Record<string, Named | string | number>): string | null {
  let missing = false;
  const out = text.replace(/\{([\wÁÉÍÓÚáéíóúñ]+)((?::\w+)*)\}/g, (_, key: string, filters: string) => {
    const v = ctx[key];
    if (v === undefined || v === '') {
      missing = true;
      return '';
    }
    const named: Named = typeof v === 'object' ? v : { name: String(v), gender: 'm' };
    let s = named.name;
    let capital = false;
    for (const f of filters.split(':').filter(Boolean)) {
      if (f === 'Mayus') capital = true;
      else if (f === 'o') s = (named.gender === 'f' ? 'a' : 'o') + (named.plural ? 's' : '');
      else if (f in ARTICLES) {
        const table = named.plural ? ARTICLES_PLURAL : ARTICLES;
        s = `${table[f as keyof typeof ARTICLES][named.strongA ? 'm' : named.gender]} ${s}`;
      }
    }
    return capital ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  });
  return missing ? null : out;
}

/** The event as the data sees it: its show view(s), plus its own raw fields. */
function viewsOf(event: GameEvent, state: GameState): Record<string, unknown>[] {
  const raw = event as unknown as Record<string, unknown>;
  const views = show.eventViews([event], state).map((v) => ({ ...raw, ...v }));
  // The casting line: the first command of a run knows which class Willy is.
  if (event.type === 'runStarted') {
    const cls = state.entities.willy?.tags.find((t) => t.startsWith('clase:'))?.slice('clase:'.length);
    if (cls) return [{ ...raw, evento: 'runStarted', clase: cls }];
  }
  if (event.type === 'combatEnded') {
    const winner = (raw as { winner?: string | null }).winner;
    views.push({ ...raw, evento: 'combatEnded', resultado: winner === state.entities.willy?.factionId ? 'victoria' : winner ? 'derrota' : 'huida' });
  }
  return views.length ? views : [{ ...raw, evento: event.type }];
}

function matches(view: Record<string, unknown>, conds?: Record<string, unknown>): boolean {
  if (!conds) return true;
  return show.matchPattern(view as show.View, { evento: String(view.evento), donde: conds });
}

function pick(event: GameEvent, state: GameState): { text: string; priority: number } | null {
  for (const view of viewsOf(event, state)) {
    const banks = BANKS.filter((b) => b.evento === view.evento && matches(view, b.donde)).sort((a, b) => (b.prioridad ?? 0) - (a.prioridad ?? 0));
    const ctx = context(view, state);
    for (const bank of banks) {
      const last = spokeAt.get(bank.id);
      if (bank.enfriamientoTurnos && last !== undefined && turns - last < bank.enfriamientoTurnos) continue;
      if (Math.random() > (bank.probabilidad ?? 1)) continue;
      let seen = recent.get(bank.id) ?? [];
      const fitting = bank.lineas.filter((l) => matches(view, l.si));
      // All the fitting lines used: forget them, except the very last one (no immediate repeat).
      if (fitting.length && fitting.every((l) => seen.includes(l.id))) {
        seen = seen.slice(-1);
        recent.set(bank.id, seen);
      }
      const eligible = fitting.filter((l) => !seen.includes(l.id));
      if (!eligible.length) continue;
      // The most specific line wins (more `si` conditions), then prioridadExtra.
      const score = (l: Line) => (l.prioridadExtra ?? 0) * 100 + Object.keys(l.si ?? {}).length;
      const top = Math.max(...eligible.map(score));
      const best = eligible.filter((l) => score(l) === top);
      const line = best[Math.floor(Math.random() * best.length)]!;
      let text = fill(line.texto, ctx);
      if (!text) continue;
      // An achievement: the generic header, then its own line (achievements.json → narrador),
      // naming what the unlocking event was about (its `contexto`).
      if (event.type === 'achievementUnlocked' && typeof view.frase === 'string') {
        const own = fill(view.frase, { ...ctx, ...achievementContext(view.contexto) });
        if (own) text = `${text} ${own}`;
      }
      if (bank.memoria) recent.set(bank.id, [...seen, line.id].slice(-bank.memoria));
      spokeAt.set(bank.id, turns);
      return { text, priority: bank.prioridad ?? 0 };
    }
  }
  return null;
}

/** An unlock carries the names of what triggered it: {enemigo} with its gender, {objeto}, {habilidad}. */
function achievementContext(raw: unknown): Record<string, Named | string | number> {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, Named | string | number> = {};
  if (typeof c.enemigo === 'string') out.enemigo = { name: c.enemigo, gender: c.enemigoGenero === 'f' ? 'f' : 'm' };
  const obj = itemNamed(c.objeto);
  if (obj) out.objeto = obj;
  if (typeof c.habilidad === 'string') out.habilidad = ABILITY_NAMES[c.habilidad] ?? c.habilidad;
  if (typeof c.patrocinador === 'string') out.patrocinador = c.patrocinador;
  for (const [k, v] of Object.entries(c)) if (k.startsWith('rival') && typeof v === 'string') out[k] = v;
  if (typeof c.rivalGenero === 'string') out.rival = { name: String(c.rivalNombre ?? ''), gender: c.rivalGenero === 'f' ? 'f' : 'm' };
  return out;
}

export function narrate(event: GameEvent, state: GameState): string | null {
  return pick(event, state)?.text ?? null;
}

/** One line for a whole command: the highest-priority bank wins (an achievement beats a hit). */
export function narrateEvents(events: GameEvent[], state: GameState): { text: string; priority: number } | null {
  turns += events.filter((e) => e.type === 'turnStarted' && (e as unknown as { entityId?: string }).entityId === 'willy').length;
  let best: { text: string; priority: number } | null = null;
  for (const e of events) {
    const p = pick(e, state);
    if (p && (!best || p.priority > best.priority)) best = p;
  }
  return best;
}
