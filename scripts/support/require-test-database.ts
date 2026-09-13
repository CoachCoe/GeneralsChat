/**
 * Refuse to run against a database that is neither a test one nor a local
 * development one.
 *
 * `e2e/global-setup.ts` has had this guard since the suite was built, with the
 * reasoning recorded in `CLAUDE.md`: "`npm test` needs a Postgres whose
 * database name contains `test` -- `e2e/global-setup.ts` refuses to reset
 * anything else, so a mistyped `DATABASE_URL` cannot wipe real data."
 *
 * The `scripts/test-*.ts` files had no such guard, and they create and delete
 * `User`, `Incident`, `Conversation` and `Policy` rows. They resolve
 * `DATABASE_URL` from `.env`, which points at the hosted Postgres the pilot
 * runs on -- so the safety property the suite has by construction was absent
 * from the files whose names most suggest they have it.
 *
 * `scripts/test-rag.ts` was the sharpest case: it inserts an *active*
 * `district` / `bullying` policy of synthetic text. Bullying is the pilot's
 * only fully covered subject, and the roadmap records that the previous
 * synthetic bullying policy was deactivated precisely because "it would have
 * competed with the real JICK for every bullying query."
 *
 * A local development database is allowed too, because clearing one is routine
 * and the `test` spelling cannot express it. That allowance requires BOTH a
 * `dev` in the database name AND a loopback host, so it grants nothing the
 * guard exists to withhold: a hosted `...-dev` database is still refused, and
 * so is a local database that is neither test nor dev.
 *
 * This is deliberately its own module with no imports: importing `src/lib/db`
 * constructs a PrismaClient, and the guard has to run before anything can
 * connect.
 */

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** Matched against the whole URL, as `e2e/global-setup.ts` does. */
function isTestDatabase(url: string): boolean {
  return /test/i.test(url);
}

/**
 * A `dev` database on this machine. The name is read from the URL path rather
 * than the whole string, so a password or a hostname containing "dev" does not
 * make a production database look local.
 */
function isLocalDevDatabase(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!LOOPBACK_HOSTS.includes(parsed.hostname)) return false;
  return /dev/i.test(parsed.pathname.replace(/^\//, ''));
}

export function requireTestDatabase(scriptName: string): void {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      `${scriptName}: DATABASE_URL is not set. This script writes to the database, so it will not guess one.`
    );
  }

  if (isTestDatabase(url) || isLocalDevDatabase(url)) return;

  // Same redaction as e2e/global-setup.ts: enough to identify the target,
  // not enough to leak the password into a terminal or a CI log.
  const redacted = url.replace(/:[^:@]*@/, ':***@');
  throw new Error(
    `${scriptName}: refusing to run against ${redacted}\n` +
      'This script creates and deletes rows. It accepts a database whose name contains "test",\n' +
      'or one whose name contains "dev" on localhost. .env points at the hosted pilot database.\n' +
      'Re-run with an explicit local target, e.g.\n' +
      `  DATABASE_URL="postgresql://$USER@localhost:5432/generalschat_test?schema=public" npx tsx ${scriptName}`
  );
}
