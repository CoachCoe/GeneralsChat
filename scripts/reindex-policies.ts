import { config } from 'dotenv';
import { resolve, relative, extname, sep } from 'path';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { prisma } from '../src/lib/db';
import { processDocument } from '../src/lib/utils/documentProcessor';

const policyUploadsDir = resolve(process.env.UPLOADS_DIR ?? './uploads', 'policies');
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

/**
 * Refuse to run against a database the schema has outrun.
 *
 * Re-indexing deletes a policy's chunks before writing their replacements, so
 * a write that fails halfway leaves that policy with none and retrieval
 * silently returns nothing. That is exactly what a missing column does, and it
 * is cheaper to detect it once up front than to recover afterwards: probe the
 * newest column before anything is destroyed.
 */
async function assertSchemaCurrent() {
  try {
    await prisma.policyChunk.findFirst({ select: { id: true, sectionLabel: true } });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'P2022') throw error;
    console.error(
      'This database is missing columns the current schema expects.\n' +
        'Re-indexing would delete existing chunks and fail to replace them.\n' +
        'Run `npx prisma migrate deploy` first, then re-run this script.'
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function main() {
  if (!(await assertSchemaCurrent())) return;

  const policies = await prisma.policy.findMany({
    select: {
      id: true,
      title: true,
      jurisdiction: true,
      category: true,
      effectiveDate: true,
      content: true,
      filePath: true,
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
    // Prefer re-extracting from the source. Content stored before the
    // whitespace fix has no newlines, so section structure is unrecoverable
    // from it -- a policy re-indexed from stored text keeps citing at policy
    // level, which is correct but less useful.
    let content = policy.content;
    let source = 'stored content';
    if (policy.filePath && existsSync(policy.filePath)) {
      try {
        content = (await processDocument(policy.filePath)).content;
        source = 'source file';

        // Adopt the source into the uploads directory if it still lives
        // wherever the operator happened to have it. Otherwise the next
        // re-index silently falls back to stored content and drops every
        // section label, with nothing in the output saying why.
        let filePath = policy.filePath;
        if (!resolve(filePath).startsWith(policyUploadsDir + sep)) {
          const adopted = resolve(policyUploadsDir, `${randomUUID()}${extname(filePath).toLowerCase()}`);
          mkdirSync(policyUploadsDir, { recursive: true });
          copyFileSync(filePath, adopted);
          filePath = adopted;
          console.log(`         adopted source into ${relative(process.cwd(), adopted)}`);
        }

        await prisma.policy.update({ where: { id: policy.id }, data: { content, filePath } });
      } catch (error) {
        console.warn(`  note   ${label}\n         could not re-extract (${(error as Error).message}); using stored content`);
      }
    } else if (policy.filePath) {
      console.warn(`  note   ${label}\n         source file is gone (${policy.filePath}); re-indexing from stored content`);
    }

    try {
      await ragSystem.deletePolicyChunks(policy.id);
      await ragSystem.addPolicyDocument(policy.id, content, {
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
    const sectioned = await prisma.policyChunk.count({
      where: { policyId: policy.id, sectionLabel: { not: null } },
    });

    if (after === 0) {
      console.error(`  EMPTY ${label}\n        left with no chunks — this policy is now unretrievable`);
      failed.push(policy.title);
      continue;
    }

    console.log(
      `  OK    ${label}\n        ${policy._count.chunks} -> ${after} chunk(s), ${embedded} embedded, ${sectioned} section-labelled (from ${source})`
    );
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
