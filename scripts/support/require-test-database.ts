/**
 * Refuse to run against a database whose name does not look like a test one.
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
 * This is deliberately its own module with no imports: importing `src/lib/db`
 * constructs a PrismaClient, and the guard has to run before anything can
 * connect. (B7, B8)
 */
export function requireTestDatabase(scriptName: string): void {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      `${scriptName}: DATABASE_URL is not set. This script writes to the database, so it will not guess one.`
    );
  }

  if (!/test/i.test(url)) {
    // Same redaction as e2e/global-setup.ts: enough to identify the target,
    // not enough to leak the password into a terminal or a CI log.
    const redacted = url.replace(/:[^:@]*@/, ':***@');
    throw new Error(
      `${scriptName}: refusing to run against a database whose name does not contain "test": ${redacted}\n` +
        'This script creates and deletes rows. .env points at the hosted pilot database.\n' +
        'Re-run with an explicit local target, e.g.\n' +
        `  DATABASE_URL="postgresql://$USER@localhost:5432/generalschat_test?schema=public" npx tsx ${scriptName}`
    );
  }
}
