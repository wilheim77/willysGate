import type { GameEvent, GameState } from '../../engine';
import combate from './narrator/combate.json';
import logros from './narrator/logros-y-cajas.json';
import miscelanea from './narrator/miscelanea.json';
import plantas from './narrator/plantas.json';

/**
 * The Narrador: picks a line for an engine event from the banks in narrator/*.json.
 * A bank matches an event type (`evento`) and its `donde` fields; a line may add its own
 * `si` conditions. Cosmetic only (it never changes the game), so plain Math.random is fine.
 */
type Cond = string | number | boolean | { min?: number; max?: number };
interface Line { id: string; texto: string; si?: Record<string, Cond>; prioridadExtra?: number }
interface Bank { id: string; evento: string; donde?: Record<string, Cond>; probabilidad?: number; prioridad?: number; memoria?: number; lineas: Line[] }

const BANKS: Bank[] = [combate, logros, miscelanea, plantas].flatMap((f) => (f as unknown as { bancos: Bank[] }).bancos);
const recent = new Map<string, string[]>();

function matches(fields: Record<string, unknown>, conds?: Record<string, Cond>): boolean {
  if (!conds) return true;
  return Object.entries(conds).every(([k, c]) => {
    const v = fields[k];
    if (c !== null && typeof c === 'object') return typeof v === 'number' && (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max);
    return v === c;
  });
}

/** Fills {variables} from the event (and entity names for *Id fields); null if any stays empty. */
function fill(text: string, fields: Record<string, unknown>, state: GameState): string | null {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = fields[k] ?? (typeof fields[`${k}Id`] === 'string' ? state.entities[fields[`${k}Id`] as string]?.name : undefined);
    if (v === undefined || v === null) {
      missing = true;
      return '';
    }
    return String(v);
  });
  return missing ? null : out;
}

export function narrate(event: GameEvent, state: GameState): string | null {
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
    const text = fill(line.texto, fields, state);
    if (!text) continue;
    recent.set(bank.id, [...seen, line.id].slice(-(bank.memoria ?? 0) || -1));
    if (!bank.memoria) recent.delete(bank.id);
    return text;
  }
  return null;
}
