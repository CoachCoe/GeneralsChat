import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * The suite runs against a dedicated local Postgres database, seeded by
 * global-setup, with Anthropic calls served by a local stub. It previously had
 * no webServer at all ("run dev server manually before tests"), shared one
 * mutable database with no isolation, and relied on a browser-side mock that
 * could not intercept server-side Claude calls. (TEST-1, TEST-3, TEST-21)
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export const STORAGE_STATE = {
  admin: path.join(__dirname, 'e2e/.auth/admin.json'),
  reporter: path.join(__dirname, 'e2e/.auth/reporter.json'),
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  globalTeardown: require.resolve('./e2e/global-teardown.ts'),
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'reporter',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE.reporter },
    },
  ],

  webServer: {
    command: 'npm run build && npm start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      NODE_ENV: 'production',
      // Anthropic calls go to the local stub started in global-setup.
      ANTHROPIC_BASE_URL: `http://localhost:${process.env.CLAUDE_STUB_PORT ?? 3999}`,
      ANTHROPIC_API_KEY: 'stub-key-not-used',
      AUTH_TRUST_HOST: 'true',
      NEXTAUTH_URL: BASE_URL,
    },
  },
});
