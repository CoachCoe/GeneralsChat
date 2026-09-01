import { config } from 'dotenv';
import { resolve, basename } from 'path';
import { existsSync } from 'fs';
import { prisma } from '../src/lib/db';
import { ragSystem } from '../src/lib/ai/rag';
import { processDocument } from '../src/lib/utils/documentProcessor';
import { POLICY_CATEGORIES, POLICY_JURISDICTIONS } from '../src/types';

config({ path: resolve(__dirname, '../.env') });

/**
 * Load one policy document.
 *
 *   npm run policies:load -- \
 *     --file "/path/to/JICK.pdf" \
 *     --title "Policy JICK: Bullying Prevention" \
 *     --jurisdiction district \
 *     --category bullying \
 *     [--effective 2026-07-31] [--replace]
 *
 * Uses the same path the API does: processDocument to extract text, then
 * ragSystem.addPolicyDocument to chunk (1000 words, 200 overlap) and embed.
 *
 * Dry run by default -- it reports what it extracted and how it would chunk,
 * because a document that parses to nothing useful is worse than one that
 * fails outright. Pass --apply to write.
 */
const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg('--file');
  const title = arg('--title');
  const jurisdiction = arg('--jurisdiction');
  const category = arg('--category');
  const effective = arg('--effective') ?? new Date().toISOString().slice(0, 10);

  if (!file || !title || !jurisdiction || !category) {
    console.error('Usage: npm run policies:load -- --file <path> --title <title> --jurisdiction <j> --category <c> [--effective YYYY-MM-DD] [--replace] [--apply]');
    process.exit(1);
  }
  if (!existsSync(file)) {
    console.error(`No such file: ${file}`);
    process.exit(1);
  }
  if (!(POLICY_JURISDICTIONS as readonly string[]).includes(jurisdiction)) {
    console.error(`Invalid jurisdiction "${jurisdiction}". One of: ${POLICY_JURISDICTIONS.join(', ')}`);
    process.exit(1);
  }
  if (!(POLICY_CATEGORIES as readonly string[]).includes(category)) {
    console.error(`Invalid category "${category}". One of: ${POLICY_CATEGORIES.join(', ')}`);
    process.exit(1);
  }

  const processed = await processDocument(file);
  const content = processed.content.trim();
  const words = content.split(/\s+/).length;

  console.log(`\n${basename(file)}`);
  console.log(`  title:        ${title}`);
  console.log(`  jurisdiction: ${jurisdiction}`);
  console.log(`  category:     ${category}`);
  console.log(`  effective:    ${effective}`);
  console.log(`  extracted:    ${content.length} chars, ${words} words`);
  // 1000-word chunks with 200 overlap advance 800 words at a time.
  console.log(`  will chunk to ~${Math.max(1, Math.ceil(words / 800))} chunk(s)`);

  if (words < 50) {
    console.error('\n  Refusing: fewer than 50 words extracted. The document either failed to');
    console.error('  parse or is a scanned image with no text layer. Loading it would add a');
    console.error('  policy that retrieval can never match.');
    process.exit(1);
  }

  const existing = await prisma.policy.findFirst({ where: { title } });
  if (existing && !REPLACE) {
    console.error(`\n  A policy titled "${title}" already exists (${existing.id}).`);
    console.error('  Pass --replace to supersede it, or use a different title.');
    process.exit(1);
  }

  if (!APPLY) {
    console.log(`\n  DRY RUN — re-run with --apply to write.`);
    console.log(`  first 240 chars: ${content.slice(0, 240).replace(/\s+/g, ' ')}`);
    return;
  }

  if (existing && REPLACE) {
    // Purge the old chunks from the vector store as well as the database, so a
    // superseded revision cannot keep being cited as authority. (SPEC-5/SPEC-15)
    await ragSystem.deletePolicyChunks(existing.id);
    await prisma.policy.delete({ where: { id: existing.id } });
    console.log(`  superseded the previous "${title}" (${existing.id})`);
  }

  const policy = await prisma.policy.create({
    data: {
      title,
      content,
      jurisdiction,
      category,
      effectiveDate: new Date(effective),
      filePath: file,
      isActive: true,
    },
  });

  await ragSystem.addPolicyDocument(policy.id, content, {
    title,
    jurisdiction,
    category,
    effectiveDate: effective,
  });

  const chunks = await prisma.policyChunk.count({ where: { policyId: policy.id } });
  const embedded = await prisma.policyChunk.count({
    where: { policyId: policy.id, embedding: { not: null } },
  });

  if (chunks === 0) {
    console.error('\n  Loaded but produced NO chunks — it is unretrievable. Investigate.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Loaded ${policy.id}: ${chunks} chunk(s), ${embedded} with embeddings`);
  if (embedded === 0) {
    console.log('  (no OPENAI_API_KEY, so retrieval uses the keyword fallback)');
  }
}

main()
  .catch((error) => {
    console.error('Load failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
