import type { Ruleset } from './ruleset';
import { SCHEMA_VERSION, type GameState } from './state';

export class SaveError extends Error {
  override name = 'SaveError';
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Engine migrations from schema version N to N+1, applied in order on load.
 * Example: migrations[1] = (raw) => ({ ...raw, schemaVersion: 2, newField: default })
 */
const migrations: Record<number, Migration> = {};

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses, migrates and validates a save for the given game and ruleset. Throws SaveError (Spanish message). */
export function deserializeState(json: string, ruleset: Ruleset, gameId: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('El archivo de partida no es JSON válido.');
  }
  if (!isRecord(raw) || typeof raw.schemaVersion !== 'number') {
    throw new SaveError('El archivo no parece una partida guardada.');
  }
  if (raw.gameId !== gameId) throw new SaveError('La partida pertenece a otro juego.');
  if (raw.rulesetId !== ruleset.id) throw new SaveError('La partida usa otro sistema de reglas.');
  if (raw.schemaVersion > SCHEMA_VERSION || (raw.rulesetVersion as number) > ruleset.version) {
    throw new SaveError('La partida es de una versión más reciente del juego.');
  }

  let data = migrate(raw, 'schemaVersion', SCHEMA_VERSION, migrations);
  data = migrate(data, 'rulesetVersion', ruleset.version, ruleset.migrations ?? {});
  validate(data);
  return data as unknown as GameState;
}

function migrate(data: Record<string, unknown>, key: string, target: number, steps: Record<number, Migration>) {
  let d = data;
  while ((d[key] as number) < target) {
    const step = steps[d[key] as number];
    if (!step) throw new SaveError(`No hay migración para ${key} ${String(d[key])}.`);
    d = step(d);
  }
  return d;
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
    if (
      !isRecord(e) ||
      typeof e.id !== 'string' ||
      typeof e.controllerId !== 'string' ||
      !isRecord(e.position) ||
      !isRecord(e.stats) ||
      !isRecord(e.resources) ||
      !Array.isArray(e.conditions) ||
      !Array.isArray(e.tags)
    ) {
      bad('entidad');
    }
  }
  if (!isRecord(d.flags)) bad('flags');
  if (!isRecord(d.turn)) bad('turno');
  if (!isRecord(d.systems)) bad('sistemas');
}
