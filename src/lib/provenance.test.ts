import { describe, expect, it } from 'vitest';
import {
  conversationProvenance,
  type CoverageSummary,
  type ProvenanceSource,
} from './provenance';

/**
 * Each case is a way the rail can vouch for something that was never said: a
 * policy no answer used, a warning about a reading of the incident that has
 * since been corrected, or a panel drawn around nothing.
 */

const PARTIAL_GAP: CoverageSummary = {
  categories: ['bullying', 'discipline', 'mandatory_reporting'],
  categoriesWithoutLocalPolicy: ['discipline'],
};

const SUBJECT_OUTSIDE: CoverageSummary = {
  categories: ['school_safety', 'discipline', 'mandatory_reporting'],
  categoriesWithoutLocalPolicy: ['school_safety', 'discipline'],
};

const FULLY_COVERED: CoverageSummary = {
  categories: ['bullying', 'mandatory_reporting'],
  categoriesWithoutLocalPolicy: [],
};

const JICK: ProvenanceSource = {
  jurisdiction: 'district',
  title: 'Policy JICK: Bullying Prevention',
  sections: ['JICK §D — Procedures for Reporting'],
};

const RSA: ProvenanceSource = {
  jurisdiction: 'state',
  title: 'RSA 193-F: Pupil Safety and Violence Prevention',
};

describe('conversationProvenance', () => {
  it('has nothing to show before an answer has been given', () => {
    expect(conversationProvenance([])).toBeNull();
    expect(
      conversationProvenance([
        { type: 'user', citations: [JICK] },
        { type: 'general', kind: 'question', citations: [JICK], coverage: PARTIAL_GAP },
      ])
    ).toBeNull();
  });

  it('draws no empty panel for an answer that rests on nothing and found no gap', () => {
    expect(
      conversationProvenance([
        { type: 'general', kind: 'guidance', citations: [], coverage: FULLY_COVERED },
      ])
    ).toBeNull();
  });

  it('keeps every policy the answers relied on, in the order relied on', () => {
    const provenance = conversationProvenance([
      { type: 'general', kind: 'guidance', citations: [RSA], coverage: PARTIAL_GAP },
      { type: 'user', citations: [] },
      { type: 'general', kind: 'guidance', citations: [JICK], coverage: PARTIAL_GAP },
    ]);

    expect(provenance?.sources.map(s => s.title)).toEqual([RSA.title, JICK.title]);
  });

  it('names a policy once, and collects every provision relied on across turns', () => {
    const provenance = conversationProvenance([
      { type: 'general', kind: 'guidance', citations: [JICK], coverage: PARTIAL_GAP },
      {
        type: 'general',
        kind: 'guidance',
        citations: [
          {
            ...JICK,
            sections: ['JICK §F — Investigative Procedures', 'JICK §D — Procedures for Reporting'],
          },
        ],
        coverage: PARTIAL_GAP,
      },
    ]);

    expect(provenance?.sources).toHaveLength(1);
    expect(provenance?.sources[0].sections).toEqual([
      'JICK §D — Procedures for Reporting',
      'JICK §F — Investigative Procedures',
    ]);
  });

  it('does not let a question contribute what it retrieved but never used', () => {
    const provenance = conversationProvenance([
      { type: 'general', kind: 'guidance', citations: [JICK], coverage: PARTIAL_GAP },
      { type: 'general', kind: 'question', citations: [RSA], coverage: PARTIAL_GAP },
    ]);

    expect(provenance?.sources.map(s => s.title)).toEqual([JICK.title]);
  });

  it('still shows sources for an answer whose label was unreadable', () => {
    // parseTurnLabel resolves anything it cannot read to guidance, and a
    // guidance turn with nothing behind it is the failure that matters.
    const provenance = conversationProvenance([
      { type: 'general', citations: [JICK], coverage: PARTIAL_GAP },
    ]);

    expect(provenance?.sources.map(s => s.title)).toEqual([JICK.title]);
  });

  it('reports the gap the latest reading of the incident found, not every gap ever', () => {
    const provenance = conversationProvenance([
      { type: 'general', kind: 'guidance', citations: [RSA], coverage: SUBJECT_OUTSIDE },
      { type: 'general', kind: 'guidance', citations: [JICK], coverage: PARTIAL_GAP },
    ]);

    expect(provenance?.gapCategories).toEqual(['discipline']);
    expect(provenance?.subjectOutsideLibrary).toBe(false);
  });

  it('reports a gap on an answer that retrieved nothing at all', () => {
    expect(
      conversationProvenance([
        { type: 'general', kind: 'guidance', citations: [], coverage: SUBJECT_OUTSIDE },
      ])
    ).toEqual({
      sources: [],
      gapCategories: ['school_safety', 'discipline'],
      subjectOutsideLibrary: true,
    });
  });

  it('does not call it a whole-subject miss when only mandatory_reporting is uncovered', () => {
    // mandatory_reporting rides along on every incident. Counting it as
    // subject matter would make every conversation a scope note.
    const provenance = conversationProvenance([
      {
        type: 'general',
        kind: 'guidance',
        citations: [JICK],
        coverage: {
          categories: ['bullying', 'mandatory_reporting'],
          categoriesWithoutLocalPolicy: ['mandatory_reporting'],
        },
      },
    ]);

    expect(provenance?.subjectOutsideLibrary).toBe(false);
    expect(provenance?.gapCategories).toEqual(['mandatory_reporting']);
  });
});
