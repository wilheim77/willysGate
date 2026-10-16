import { SCHEMA_VERSION, type GameState } from './state';

export class SaveError extends Error {
  override name = 'SaveError';
}

/**
 * Migrations from version N to N+1, applied in order on load.
 * Example: migrations[1] = (raw) => ({ ...raw, schemaVersion: 2, newField: default })
 */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('El archivo de partida no es JSON válido.');
  }
  if (!isRecord(raw) || typeof raw.schemaVersion !== 'number') {
    throw new SaveError('El archivo no parece una partida guardada.');
  }
  if (raw.schemaVersion > SCHEMA_VERSION) {
    throw new SaveError('La partida es de una versión más reciente del juego.');
  }
  let data: Record<string, unknown> = raw;
  while ((data.schemaVersion as number) < SCHEMA_VERSION) {
    const migrate = migrations[data.schemaVersion as number];
    if (!migrate) throw new SaveError(`No hay migración desde la versión ${String(data.schemaVersion)}.`);
    data = migrate(data);
  }
  validate(data);
  return data as unknown as GameState;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isUint32 = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;

/** Structural sanity check; guards against corrupted or hand-edited saves. */
function validate(d: Record<string, unknown>): void {
  const bad = (what: string): never => {
    throw new SaveError(`Partida corrupta: ${what}.`);
  };
  if (!isUint32(d.seed)) bad('semilla');
  const rng = d.rng;
  if (!isRecord(rng) || !['a', 'b', 'c', 'd'].every((k) => isUint32(rng[k]))) bad('estado del RNG');

  const map = d.map;
  if (!isRecord(map) || typeof map.width !== 'number' || typeof map.height !== 'number' || !Array.isArray(map.tiles)) {
    bad('mapa');
  }
  const m = map as { width: number; height: number; tiles: unknown[] };
  if (m.tiles.length !== m.width * m.height) bad('tamaño del mapa');

  if (!isRecord(d.entities)) bad('entidades');
  for (const e of Object.values(d.entities as Record<string, unknown>)) {
    if (!isRecord(e) || typeof e.id !== 'string' || typeof e.controllerId !== 'string' || !isRecord(e.position)) {
      bad('entidad');
    }
  }
  if (!isRecord(d.flags)) bad('flags');
  if (!isRecord(d.turn)) bad('turno');
}
