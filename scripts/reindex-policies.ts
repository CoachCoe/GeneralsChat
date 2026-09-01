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

    // Purges Chroma as well as the rows, then re-adds through the single
    // chunker with embeddings when OPENAI_API_KEY is configured.
    await ragSystem.deletePolicyChunks(policy.id);
    await ragSystem.addPolicyDocument(policy.id, policy.content, {
      title: policy.title,
      jurisdiction: policy.jurisdiction,
      category: policy.category,
      effectiveDate: policy.effectiveDate.toISOString(),
    });

    const after = await prisma.policyChunk.count({ where: { policyId: policy.id } });
    const embedded = await prisma.policyChunk.count({
      where: { policyId: policy.id, embedding: { not: null } },
    });
    console.log(`  OK    ${label}\n        ${policy._count.chunks} -> ${after} chunk(s), ${embedded} with embeddings`);
    reindexed++;
  }

  console.log(
    `\n${APPLY ? 'Re-indexed' : 'Would re-index'} ${reindexed}, skipped ${skipped}.`
  );
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
