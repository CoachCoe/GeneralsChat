import { writeFileSync, mkdirSync } from 'fs';
import type { Server } from 'http';
import { resetDatabase } from './support/seed';
import { startClaudeStub } from './support/claude-stub';

export const CLAUDE_STUB_PORT = 3999;

declare global {
  var __claudeStub: Server | undefined;
}

/**
 * Runs once before the suite.
 *
 * Note on ordering: this comment used to say "the webServer in
 * playwright.config.ts starts after this resolves, so the database is seeded
 * and the Claude stub is listening before the app boots." That is not true of
 * Playwright 1.56 -- the webServer's build output appears before this function
 * runs. It is harmless, because the app reads `ANTHROPIC_BASE_URL` and queries
 * the database per request rather than at boot, but nothing here may *rely* on
 * running first. In particular the free-port check cannot live here; it is the
 * first link of `webServer.command`, in `require-free-port.ts`. (B9)
 */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set for the e2e run');
  }
  if (!/test/i.test(process.env.DATABASE_URL)) {
    throw new Error(
      `Refusing to reset a database whose name does not contain "test": ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`
    );
  }

  const seeded = await resetDatabase();

  // Handed to the specs on disk rather than through a global: Playwright runs
  // them in separate processes, so a module-level value would not survive.
  mkdirSync('e2e/.auth', { recursive: true });
  writeFileSync('e2e/.auth/seed.json', JSON.stringify(seeded, null, 2));

  globalThis.__claudeStub = await startClaudeStub(CLAUDE_STUB_PORT);
}
