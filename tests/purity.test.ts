import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// core/ must stay renderer-agnostic so it can run on a server for multiplayer.
describe('core purity', () => {
  const dir = join(__dirname, '..', 'core');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it.each(files)('%s imports only from core/', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    for (const spec of imports) expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/[\w-]+$/);
  });

  it.each(files)('%s does not touch browser globals', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    expect(src).not.toMatch(/\b(window|document|localStorage|Math\.random|Date\.now)\b/);
  });
});
