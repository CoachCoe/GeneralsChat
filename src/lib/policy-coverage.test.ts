import { describe, expect, it } from 'vitest';
import { buildCoverageReport, type PolicyRow } from './policy-coverage';

/**
 * The coverage report tells an administrator whether their district has a
 * policy for something. Overstating coverage is the dangerous direction: it
 * would let a real gap go unreported.
 */
const row = (o: Partial<PolicyRow> = {}): PolicyRow => ({
  title: 'A policy',
  jurisdiction: 'district',
  category: 'bullying',
  isActive: true,
  chunkCount: 3,
  embeddedChunkCount: 0,
  contentLength: 5000,
  ...o,
});

const category = (r: ReturnType<typeof buildCoverageReport>, c: string) =>
  r.categories.find(x => x.category === c)!;
const incident = (r: ReturnType<typeof buildCoverageReport>, t: string) =>
  r.incidentTypes.find(x => x.incidentType === t)!;

describe('buildCoverageReport', () => {
  it('does not count a policy with no chunks as coverage', () => {
    // It exists in the database but retrieval can never return it.
    const r = buildCoverageReport([row({ chunkCount: 0 })]);
    expect(category(r, 'bullying').hasAny).toBe(false);
    expect(category(r, 'bullying').hasLocal).toBe(false);
  });

  it('reports a chunkless policy as a problem rather than staying silent', () => {
    const r = buildCoverageReport([row({ chunkCount: 0 })]);
    const p = r.problems.find(x => x.kind === 'unretrievable');
    expect(p).toBeTruthy();
    expect(p!.detail).toContain('no chunks');
  });

  it('distinguishes a chunkless policy that has content from one that never parsed', () => {
    const withContent = buildCoverageReport([row({ chunkCount: 0, contentLength: 5000 })]);
    const without = buildCoverageReport([row({ chunkCount: 0, contentLength: 0 })]);
    expect(withContent.problems[0].detail).toContain('re-index');
    expect(without.problems[0].detail).toContain('never parsed');
  });

  it('does not count an inactive policy as coverage', () => {
    const r = buildCoverageReport([row({ isActive: false })]);
    expect(category(r, 'bullying').hasAny).toBe(false);
  });

  it('counts federal-only as coverage but not as local coverage', () => {
    const r = buildCoverageReport([row({ jurisdiction: 'federal', category: 'title_ix' })]);
    expect(category(r, 'title_ix').hasAny).toBe(true);
    expect(category(r, 'title_ix').hasLocal).toBe(false);
  });

  it('counts a school policy as local, not just a district one', () => {
    const r = buildCoverageReport([row({ jurisdiction: 'school' })]);
    expect(category(r, 'bullying').hasLocal).toBe(true);
  });

  it('marks a subject as outside the library when no part of it is locally covered', () => {
    // Federal Title IX only: the subject has authority above it but no local
    // procedure, which is the pilot's common shape.
    const r = buildCoverageReport([row({ jurisdiction: 'federal', category: 'title_ix' })]);
    expect(incident(r, 'title_ix').outsideLibrary).toBe(true);
  });

  it('does not mark a subject as outside when part of it is locally covered', () => {
    const r = buildCoverageReport([
      row({ category: 'bullying' }),
      row({ category: 'discipline' }),
    ]);
    expect(incident(r, 'bullying').outsideLibrary).toBe(false);
    expect(incident(r, 'bullying').subjectGaps).toEqual([]);
  });

  it('ignores mandatory reporting when judging whether a subject is covered', () => {
    // It is appended to every incident and is nearly always covered locally,
    // so including it would make "outside the library" unreachable.
    const r = buildCoverageReport([
      row({ category: 'mandatory_reporting' }),
      row({ jurisdiction: 'federal', category: 'title_ix' }),
    ]);
    expect(incident(r, 'title_ix').outsideLibrary).toBe(true);
    expect(incident(r, 'title_ix').mandatoryReportingLocal).toBe(true);
  });

  it('never calls the `other` incident type outside the library', () => {
    // It implicates no specific category, so there is nothing to be outside of.
    const r = buildCoverageReport([]);
    expect(incident(r, 'other').outsideLibrary).toBe(false);
    expect(incident(r, 'other').subjectCategories).toEqual([]);
  });

  it('reports mandatory reporting as uncovered when nothing is loaded for it', () => {
    const r = buildCoverageReport([row({ category: 'bullying' })]);
    expect(incident(r, 'bullying').mandatoryReportingLocal).toBe(false);
  });

  it('totals only what is actually retrievable', () => {
    const r = buildCoverageReport([
      row({ chunkCount: 4, embeddedChunkCount: 4 }),
      row({ chunkCount: 0 }),
      row({ isActive: false, chunkCount: 9 }),
    ]);
    expect(r.totals.activePolicies).toBe(1);
    expect(r.totals.activeChunks).toBe(4);
    expect(r.totals.embeddedChunks).toBe(4);
  });

  it('flags a retrievable policy that has no embeddings', () => {
    const r = buildCoverageReport([row({ embeddedChunkCount: 0 })]);
    expect(r.problems.some(p => p.kind === 'no-embeddings')).toBe(true);
  });

  it('reports no problems for a healthy library', () => {
    const r = buildCoverageReport([row({ chunkCount: 3, embeddedChunkCount: 3 })]);
    expect(r.problems).toEqual([]);
  });
});
