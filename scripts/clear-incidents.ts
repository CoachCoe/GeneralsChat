import { requireTestDatabase } from './support/require-test-database';
import { prisma } from '../src/lib/db';

/**
 * Delete every incident and everything hanging off it.
 *
 * This is the most destructive thing in the repo, and it used to have no guard
 * of any kind: five unfiltered `deleteMany({})` against whatever `DATABASE_URL`
 * `.env` supplied -- which `CLAUDE.md` states is the hosted Postgres the pilot
 * runs on. No dry run, no confirmation, no database-name check, and it is wired
 * into no npm script, so it left no trace in the list a maintainer would scan.
 * `CLAUDE.md`'s own warning list named `policies:*`, `prisma`,
 * `scripts/test-phase3.ts` and `scripts/test-rag.ts` and omitted this one.
 *
 * It also deletes `auditLog` first. That table is the only record of who read
 * which student's incident, so one unguarded run destroyed both the reports
 * about minors and the evidence of access to them.
 *
 * Now: refuses any database whose name does not contain "test", and is a dry
 * run unless `--apply` is passed -- the same shape `policies:reindex` already
 * uses, and for the same reason.
 *
 *   npm run incidents:clear                # counts what it would delete
 *   npm run incidents:clear -- --apply     # deletes it
 *
 * (B7, DEAD-90, DOC-24, REPO-23)
 */
const APPLY = process.argv.includes('--apply');

async function clearIncidents() {
  requireTestDatabase('scripts/clear-incidents.ts');

  try {
    // Counted before anything is deleted, so the dry run and the real run
    // report the same numbers and the operator sees the scale first.
    const counts = {
      auditLogs: await prisma.auditLog.count(),
      complianceActions: await prisma.complianceAction.count(),
      attachments: await prisma.attachment.count(),
      conversations: await prisma.conversation.count(),
      incidents: await prisma.incident.count(),
    };

    console.log(APPLY ? '🗑️  Clearing incident data...' : '🔍 Dry run — nothing will be deleted.');
    for (const [table, n] of Object.entries(counts)) {
      console.log(`   ${table}: ${n}`);
    }

    if (!APPLY) {
      console.log('\nRe-run with --apply to delete these rows.');
      console.log('Policies, policy chunks and users are not touched either way.');
      return;
    }

    // Order matters: children before parents.
    await prisma.auditLog.deleteMany({});
    await prisma.complianceAction.deleteMany({});
    await prisma.attachment.deleteMany({});
    await prisma.conversation.deleteMany({});
    const result = await prisma.incident.deleteMany({});

    console.log(`\n✅ Deleted ${result.count} incidents and all related data`);
  } catch (error) {
    console.error('❌ Error clearing incidents:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearIncidents().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
