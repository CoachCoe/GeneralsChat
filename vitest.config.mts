import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the pure logic.
 *
 * Deliberately narrow: these cover functions that decide what an administrator
 * is told about a statutory deadline, where a document gets split, and whether
 * an upload can escape its directory. They need no database, no network and no
 * server, so they run in well under a second and can gate every commit.
 *
 * End-to-end coverage lives in e2e/ under Playwright and is excluded here.
 */
export default defineConfig({
  resolve: {
    // Native tsconfig path resolution, so `@/` works without a plugin.
    tsconfigPaths: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    environment: 'node',
    globals: false,
  },
});
