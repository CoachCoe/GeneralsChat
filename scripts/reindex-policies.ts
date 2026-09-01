import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/db';
import { ragSystem } from '../src/lib/ai/rag';

config({ path: resolve(__dirname, '../.env') });

/**
 * Re-chunk and re-embed every policy.
 *
 * Needed because chunks written before this branch came from a 500-character
 * regex splitter that matched per LINE, dropped newlines, and had no overlap --
 * and were written straight to PolicyChunk, so `embedding` was null and Chroma
 * never saw them. They also predate Policy.category, which retrieval now
 * filters on.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npm run policies:reindex              # report what would change
 *   npm run policies:reindex -- --apply   # do it
 */
const APPLY = process.argv.includes('--apply');

async function main() {
  const policies = await prisma.policy.findMany({
    select: {
      id: true,
      title: true,
      jurisdiction: true,
      category: true,
      effectiveDate: true,
      content: true,
      _count: { select: { chunks: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (policies.length === 0) {
    console.log('No policies found. Nothing to do.');
    return;
  }

  console.log(
    `${APPLY ? 'Re-indexing' : 'DRY RUN — would re-index'} ${policies.length} polic${policies.length === 1 ? 'y' : 'ies'}\n`
  );

  let reindexed = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const policy of policies) {
    const label = `${policy.jurisdiction}/${policy.category}  ${policy.title}`;

    if (!policy.content?.trim()) {
      console.log(`  SKIP  ${label}\n        no stored content — re-upload the source document`);
      skipped++;
      continue;
    }

    if (!APPLY) {
      console.log(`  WOULD  ${label}\n         ${policy._count.chunks} existing chunk(s)`);
      reindexed++;
      continue;
    }

    // Re-indexing is delete-then-recreate, and the Chroma half cannot join a
    // database transaction. So each policy is handled independently and
    // verified afterwards: a failure must not abort the run and leave later
    // policies untouched, and it must not pass silently leaving this one with
    // no chunks at all -- a policy with zero chunks is invisible to retrieval,
    // which is worse than one chunked badly.
    try {
      await ragSystem.deletePolicyChunks(policy.id);
      await ragSystem.addPolicyDocument(policy.id, policy.content, {
        title: policy.title,
        jurisdiction: policy.jurisdiction,
        category: policy.category,
        effectiveDate: policy.effectiveDate.toISOString(),
      });
    } catch (error) {
      console.error(`  FAIL  ${label}\n        ${(error as Error).message}`);
      failed.push(policy.title);
      continue;
    }

    const after = await prisma.policyChunk.count({ where: { policyId: policy.id } });
    const embedded = await prisma.policyChunk.count({
      where: { policyId: policy.id, embedding: { not: null } },
    });

    if (after === 0) {
      console.error(`  EMPTY ${label}\n        left with no chunks — this policy is now unretrievable`);
      failed.push(policy.title);
      continue;
    }

    console.log(`  OK    ${label}\n        ${policy._count.chunks} -> ${after} chunk(s), ${embedded} with embeddings`);
    reindexed++;
  }

  console.log(
    `\n${APPLY ? 'Re-indexed' : 'Would re-index'} ${reindexed}, skipped ${skipped}, failed ${failed.length}.`
  );

  if (failed.length > 0) {
    console.error('\nThese policies need attention — they may now have no chunks:');
    for (const title of failed) console.error(`  - ${title}`);
  }

  // A final sweep, independent of the loop, so nothing is reported as fine
  // while being invisible to retrieval.
  if (APPLY) {
    const orphans = await prisma.policy.findMany({
      where: { isActive: true, chunks: { none: {} } },
      select: { title: true, content: true },
    });
    const withContent = orphans.filter(o => o.content?.trim());
    if (withContent.length > 0) {
      console.error(`\n${withContent.length} active polic${withContent.length === 1 ? 'y has' : 'ies have'} content but no chunks:`);
      for (const o of withContent) console.error(`  - ${o.title}`);
      process.exitCode = 1;
    } else {
      console.log('\nVerified: every active policy with content has chunks.');
    }
  }
  if (!APPLY) console.log('Re-run with --apply to write.');
  if (APPLY && !process.env.OPENAI_API_KEY) {
    console.log(
      '\nNote: OPENAI_API_KEY is not set, so no embeddings were generated and\n' +
      'retrieval will use the keyword fallback.'
    );
  }
}

main()
  .catch((error) => {
    console.error('Re-index failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
