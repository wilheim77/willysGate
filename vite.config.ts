import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// One repo, several games. Pick one with GAME=<id> (folder under content/). Default: intereses.
const game = process.env.GAME ?? 'intereses';
const gameDir = resolve(__dirname, 'content', game);
if (!existsSync(resolve(gameDir, 'game.ts'))) throw new Error(`Unknown game "${game}": content/${game}/game.ts not found`);

export default defineConfig({
  // GitHub Pages serves each game under /willysGate/<game>/.
  base: process.env.GITHUB_ACTIONS ? `/willysGate/${game}/` : '/',
  publicDir: resolve(gameDir, 'public'),
  resolve: { alias: { '@game': resolve(gameDir, 'game.ts') } },
  build: {
    outDir: resolve(__dirname, 'dist', game),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600, // Phaser alone is ~1.2 MB minified
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Playthrough and soak tests run real fights; under a parallel full run they need headroom.
    testTimeout: 60_000,
    coverage: {
      include: ['engine/**/*.ts', 'rulesets/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
