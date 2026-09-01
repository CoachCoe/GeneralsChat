import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/db';
import { buildCoverageReport, type PolicyRow } from '../src/lib/policy-coverage';
import {
  ALWAYS_RETRIEVED_CATEGORY,
  CATEGORY_LABELS,
  INCIDENT_TYPE_LABELS,
  JURISDICTION_LABELS,
  type PolicyJurisdiction,
} from '../src/types';

config({ path: resolve(__dirname, '../.env') });

/**
 * What the policy library can and cannot answer.
 *
 *   npm run policies:coverage
 *
 * Two views, because they answer different questions:
 *
 *  - by incident type: what a real incident will experience today
 *  - by category: what to load next
 *
 * Exits non-zero if any active policy is unretrievable, so it can gate a
 * deploy.
 */
const CHECK = process.argv.includes('--check');

// Two letters, because "state" and "school" share an initial.
const JURISDICTION_ABBR: Record<PolicyJurisdiction, string> = {
  federal: 'FE',
  state: 'ST',
  district: 'DI',
  school: 'SC',
};

function bar(jurisdictions: string[]): string {
  // One slot per level, highest authority first — the same order the source
  // ladder uses in the UI.
  return (['federal', 'state', 'district', 'school'] as PolicyJurisdiction[])
    .map(j => (jurisdictions.includes(j) ? JURISDICTION_ABBR[j] : ' ·'))
    .join(' ');
}

async function main() {
  const policies = await prisma.policy.findMany({
    select: {
      title: true,
      jurisdiction: true,
      category: true,
      isActive: true,
      content: true,
      _count: { select: { chunks: true } },
    },
  });

  const embedded = await prisma.policyChunk.groupBy({
    by: ['policyId'],
    where: { embedding: { not: null } },
    _count: { _all: true },
  });
  const ids = await prisma.policy.findMany({ select: { id: true, title: true } });
  const embeddedByTitle = new Map<string, number>();
  for (const e of embedded) {
    const t = ids.find(i => i.id === e.policyId)?.title;
    if (t) embeddedByTitle.set(t, e._count._all);
  }

  const rows: PolicyRow[] = policies.map(p => ({
    title: p.title,
    jurisdiction: p.jurisdiction,
    category: p.category,
    isActive: p.isActive,
    chunkCount: p._count.chunks,
    embeddedChunkCount: embeddedByTitle.get(p.title) ?? 0,
    contentLength: p.content?.length ?? 0,
  }));

  const report = buildCoverageReport(rows);
  const t = report.totals;

  console.log('\nPOLICY LIBRARY COVERAGE');
  console.log(`  ${t.activePolicies} retrievable polic${t.activePolicies === 1 ? 'y' : 'ies'}, ${t.activeChunks} chunks (${t.embeddedChunks} embedded)`);
  const loadableTotal = report.categories.filter(c => c.category !== 'other').length;
  console.log(`  ${t.categoriesWithLocal} of ${loadableTotal} categories have a district or school policy`);

  console.log('\nWHAT AN INCIDENT GETS TODAY');
  for (const it of report.incidentTypes) {
    const label = INCIDENT_TYPE_LABELS[it.incidentType];
    if (it.subjectCategories.length === 0) {
      console.log(`  ${label.padEnd(12)} no specific categories — retrieval is unfiltered`);
      continue;
    }
    const status = it.outsideLibrary
      ? 'NO LOCAL POLICY for any part of this'
      : it.subjectGaps.length > 0
        ? `partial — no local policy for ${it.subjectGaps.join(', ')}`
        : 'fully covered locally';
    console.log(`  ${label.padEnd(12)} ${status}`);
  }
  const mrLocal = report.incidentTypes[0]?.mandatoryReportingLocal;
  console.log(
    `\n  Mandatory reporting (retrieved for every incident): ${mrLocal ? 'locally covered' : 'NO LOCAL POLICY'}`
  );

  // `other` is the classifier's fallback, not a subject anyone loads a policy
  // for, so it is excluded rather than listed as a permanent gap.
  const loadable = report.categories.filter(c => c.category !== 'other');
  console.log('\nBY CATEGORY                    FE ST DI SC   policies  chunks');
  for (const c of loadable) {
    const label = (CATEGORY_LABELS[c.category] ?? c.category).slice(0, 28);
    const flag = !c.hasAny ? '  ← nothing loaded' : !c.hasLocal ? '  ← no local policy' : '';
    const always = c.category === ALWAYS_RETRIEVED_CATEGORY ? ' *' : '';
    console.log(
      `  ${label.padEnd(28)} ${bar(c.jurisdictions)}   ${String(c.policyCount).padStart(6)}  ${String(c.chunkCount).padStart(6)}${flag}${always}`
    );
  }
  console.log('\n  FE/ST/DI/SC = federal, state, district, school. * always retrieved.');

  if (report.problems.length > 0) {
    console.log('\nPROBLEMS');
    for (const p of report.problems) {
      console.log(`  [${p.kind}] ${p.title.slice(0, 52)}`);
      console.log(`      ${p.detail}`);
    }
  } else {
    console.log('\nNo problems: every active policy has chunks.');
  }

  const unretrievable = report.problems.filter(p => p.kind === 'unretrievable');
  if (CHECK && unretrievable.length > 0) {
    console.error(`\n${unretrievable.length} active polic${unretrievable.length === 1 ? 'y is' : 'ies are'} unretrievable.`);
    process.exitCode = 1;
  }
  console.log();
}

main()
  .catch(error => {
    console.error('Coverage report failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
