import type { GameEvent, GameState } from '../../engine';
import combate from './narrator/combate.json';
import logros from './narrator/logros-y-cajas.json';
import miscelanea from './narrator/miscelanea.json';
import plantas from './narrator/plantas.json';
import cast from './data/cast.json';

/**
 * The Narrador: picks a line for an engine event from the banks in narrator/*.json.
 * A bank matches an event type (`evento`) and its `donde` fields; a line may add its own
 * `si` conditions. Cosmetic only (it never changes the game), so plain Math.random is fine.
 */
type Cond = string | number | boolean | { min?: number; max?: number } | { en: (string | number)[] } | { existe: boolean } | { tiene: string };
interface Line { id: string; texto: string; si?: Record<string, Cond>; prioridadExtra?: number }
interface Bank { id: string; evento: string; donde?: Record<string, Cond>; probabilidad?: number; prioridad?: number; memoria?: number; lineas: Line[] }

const BANKS: Bank[] = [combate, logros, miscelanea, plantas].flatMap((f) => (f as unknown as { bancos: Bank[] }).bancos);
const recent = new Map<string, string[]>();
const CAST: Record<string, string> = { presentador: cast.presentador.nombre, presentadorCorto: cast.presentador.corto, presentadorApodo: cast.presentador.apodo };

function lookup(fields: Record<string, unknown>, path: string): unknown {
  let v: unknown = fields;
  for (const part of path.split('.')) {
    if (v === null || v === undefined || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

function matches(fields: Record<string, unknown>, conds?: Record<string, Cond>): boolean {
  if (!conds) return true;
  return Object.entries(conds).every(([k, c]) => {
    const v = lookup(fields, k);
    if (c !== null && typeof c === 'object') {
      if ('en' in c) return c.en.includes(v as string | number);
      if ('existe' in c) return (v !== undefined && v !== null) === c.existe;
      if ('tiene' in c) return Array.isArray(v) && v.includes(c.tiene);
      const r = c as { min?: number; max?: number };
      return typeof v === 'number' && (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
    }
    return v === c;
  });
}

/** Spanish agreement for {x:el}, {x:un}, {x:del}, {x:al}, {x:o} and {x:Mayus}. */
function inflect(value: string, gender: string, filters: string[]): string {
  const f = gender === 'f';
  let out = value;
  for (const flt of filters) {
    if (flt === 'el') out = `${f ? 'la' : 'el'} ${out}`;
    else if (flt === 'un') out = `${f ? 'una' : 'un'} ${out}`;
    else if (flt === 'del') out = `${f ? 'de la' : 'del'} ${out}`;
    else if (flt === 'al') out = `${f ? 'a la' : 'al'} ${out}`;
    else if (flt === 'o') out = f ? 'a' : 'o';
    else if (flt === 'Mayus') out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}

/** A guess for item names, which carry no gender: «Gaseosa…» is feminine, «Petardo…» is not. */
const guessGender = (name: string) => (/^[^\s]*a\b/i.test(name) && !/^(mapa|sistema|planeta)\b/i.test(name) ? 'f' : 'm');

/** Fills {variables} (with agreement filters) from the event, its context and the cast; null if any stays empty. */
function fill(text: string, fields: Record<string, unknown>, state: GameState): string | null {
  let missing = false;
  const ctx = (fields.contexto as Record<string, unknown> | undefined) ?? {};
  const out = text.replace(/\{(\w+)((?::\w+)*)\}/g, (_, k: string, flt: string) => {
    const filters = flt ? flt.slice(1).split(':') : [];
    const id = fields[`${k}Id`];
    const v = fields[k] ?? ctx[k] ?? CAST[k] ?? (typeof id === 'string' ? state.entities[id]?.name : undefined);
    if (v === undefined || v === null || typeof v === 'object') {
      missing = true;
      return '';
    }
    const gender = String(fields[`${k}Genero`] ?? ctx[`${k}Genero`] ?? (k === 'presentador' ? cast.presentador.genero : guessGender(String(v))));
    return inflect(String(v), gender, filters);
  });
  return missing ? null : out;
}

function pick(event: GameEvent, state: GameState): { text: string; priority: number } | null {
  const fields = event as unknown as Record<string, unknown>;
  const banks = BANKS.filter((b) => b.evento === event.type && matches(fields, b.donde)).sort((a, b) => (b.prioridad ?? 0) - (a.prioridad ?? 0));
  for (const bank of banks) {
    if (Math.random() > (bank.probabilidad ?? 1)) continue;
    const seen = recent.get(bank.id) ?? [];
    const eligible = bank.lineas.filter((l) => matches(fields, l.si) && !seen.includes(l.id));
    if (!eligible.length) continue;
    const top = Math.max(...eligible.map((l) => l.prioridadExtra ?? 0));
    const best = eligible.filter((l) => (l.prioridadExtra ?? 0) === top);
    const line = best[Math.floor(Math.random() * best.length)]!;
    let text = fill(line.texto, fields, state);
    if (!text) continue;
    // An achievement: the generic header, then its own line (achievements.json → narrador).
    if (event.type === 'achievementUnlocked' && typeof fields.frase === 'string') {
      const own = fill(fields.frase, fields, state);
      if (own) text = `${text} ${own}`;
    }
    recent.set(bank.id, [...seen, line.id].slice(-(bank.memoria ?? 0) || -1));
    if (!bank.memoria) recent.delete(bank.id);
    return { text, priority: bank.prioridad ?? 0 };
  }
  return null;
}

export function narrate(event: GameEvent, state: GameState): string | null {
  return pick(event, state)?.text ?? null;
}

/** One line for a whole command: the highest-priority bank wins (an achievement beats a hit). */
export function narrateEvents(events: GameEvent[], state: GameState): string | null {
  let best: { text: string; priority: number } | null = null;
  for (const e of events) {
    const p = pick(e, state);
    if (p && (!best || p.priority > best.priority)) best = p;
  }
  return best?.text ?? null;
}
