import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site under /<repo>/.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/willysGate/' : '/',
  build: {
    chunkSizeWarningLimit: 1600, // Phaser alone is ~1.2 MB minified
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['core/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
