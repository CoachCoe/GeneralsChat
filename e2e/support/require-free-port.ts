import { createServer } from 'net';

/**
 * Refuse to start the e2e server if something is already on its port.
 *
 * `playwright.config.ts` sets `reuseExistingServer: false` with a comment
 * saying why: reusing a server Playwright did not start "silently discards
 * ANTHROPIC_BASE_URL and runs the whole suite against the real API and whatever
 * DATABASE_URL that process was given -- and .env points at production."
 *
 * That option does not deliver it. It governs only whether Playwright *skips
 * starting* its own server; it does not assert the port is free, and the
 * readiness probe accepts any process that answers. Observed with an unrelated
 * local app on port 3100: the `webServer` command's own listen failed, nothing
 * aborted the run, and `auth.setup.ts` drove the *foreign* application's
 * sign-in page.
 *
 * That case failed loudly only because the squatter was a different product.
 * The dangerous one is the same app -- `npm run dev` on this port in another
 * terminal is this application with `.env`, i.e. the hosted pilot Postgres and
 * the real Anthropic API. It would satisfy the `/api/health` readiness probe,
 * and the suite would drive production in a browser while `resetDatabase()`
 * truncated the test database.
 *
 * This runs as the first link of `webServer.command`, because that is the
 * process that binds the port. It cannot live in `globalSetup`: Playwright
 * starts `webServer` *before* `globalSetup`, so by then our own server is
 * already listening and the check would refuse every run. (B9)
 */
export function checkPortFree(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    });
    // No host: Node binds all interfaces, which is what `next start` does.
    // Probing 127.0.0.1 alone would miss a server listening only on `::`.
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port);
  });
}

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

checkPortFree(port)
  .then(free => {
    if (free) return;
    console.error(
      `\nPort ${port} is already in use.\n\n` +
        'The suite would then run against a server Playwright did not start --\n' +
        "with that process's own DATABASE_URL and the real Anthropic API rather\n" +
        'than the stub. If that process is this app started from .env, the\n' +
        'browser would be driving the hosted pilot database.\n\n' +
        'Stop that process, or pick another port:\n' +
        `  PLAYWRIGHT_PORT=<free port> npm run test:e2e\n`
    );
    process.exit(1);
  })
  .catch((error: unknown) => {
    // Any error other than "address in use" means the probe could not answer
    // the question. Refuse rather than assume free -- an unhandled rejection
    // here would let the run continue on toward whatever is on the port.
    console.error(`\nCould not determine whether port ${port} is free: ${String(error)}`);
    process.exit(1);
  });
