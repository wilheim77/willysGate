// Copies a game's ability/spell FX table (content/<game>/art/<preset>/fx.json) into the manifest's
// `fx`, after checking that every prop it names exists. The client plays an ability's visual from
// manifest.fx[abilityId]; the entry shapes are documented in docs/ART_CATALOG.md ("Tabla fx").
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FX_FIELDS = ['fx', 'impactFx', 'beadFx', 'extraFx'];

export function applyFxTable(manifest: { props?: Record<string, unknown>; fx?: unknown }, gameDir: string, preset: string): number {
  const path = join(gameDir, 'art', preset, 'fx.json');
  if (!existsSync(path)) return 0;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>;
  const table = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('$')));
  for (const [id, entry] of Object.entries(table)) {
    for (const f of FX_FIELDS) {
      const prop = entry[f];
      if (typeof prop === 'string' && !manifest.props?.[prop]) throw new Error(`fx.json: "${id}".${f} names unknown prop "${prop}"`);
    }
  }
  manifest.fx = table;
  return Object.keys(table).length;
}
