import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Layer boundaries (see docs/DESIGN.md):
 *   engine/    imports nothing outside engine/
 *   rulesets/  imports engine/ and other files in rulesets/
 *   neither touches the DOM, Phaser, or non-deterministic globals.
 */
const root = join(__dirname, '..');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

function imports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

function resolvesInside(file: string, spec: string, allowedDirs: string[]): boolean {
  if (!spec.startsWith('.')) return false; // no packages (phaser, node:*) allowed
  const target = relative(root, join(file, '..', spec));
  return allowedDirs.some((d) => target === d || target.startsWith(`${d}/`));
}

const layers = [
  { dir: 'engine', allowed: ['engine'] },
  { dir: 'rulesets', allowed: ['engine', 'rulesets'] },
];

describe.each(layers)('$dir/ layer', ({ dir, allowed }) => {
  const files = tsFiles(join(root, dir));

  it.each(files.map((f) => relative(root, f)))('%s respects layer imports', (file) => {
    for (const spec of imports(join(root, file))) {
      expect(resolvesInside(join(root, file), spec, allowed), `${file} imports ${spec}`).toBe(true);
    }
  });

  it.each(files.map((f) => relative(root, f)))('%s avoids browser and non-deterministic globals', (file) => {
    const src = readFileSync(join(root, file), 'utf8');
    expect(src).not.toMatch(/\b(window|document|localStorage|Math\.random|Date\.now|crypto)\b/);
  });
});
