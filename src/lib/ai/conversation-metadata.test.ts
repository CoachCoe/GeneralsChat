import { describe, expect, it } from 'vitest';
import { readStoredTurn } from './conversation-metadata';

const CITATION = {
  policyId: 'p1',
  title: 'Policy JICK: Bullying Prevention',
  jurisdiction: 'district',
  category: 'bullying',
  sections: ['JICK §D — Procedures for Reporting Bullying'],
};

describe('readStoredTurn', () => {
  it('reads the citations and kind a turn recorded', () => {
    const raw = JSON.stringify({ citations: [CITATION], kind: 'guidance' });
    expect(readStoredTurn(raw)).toEqual({ citations: [CITATION], kind: 'guidance' });
  });

  it('ignores the fields the chat view does not need', () => {
    const raw = JSON.stringify({
      citations: [CITATION],
      classification: { type: 'bullying' },
      usage: { inputTokens: 10, outputTokens: 20 },
      dataSensitivity: 'confidential',
    });
    expect(readStoredTurn(raw)).toEqual({ citations: [CITATION], kind: undefined });
  });

  /*
   * An empty array and a missing one are different facts and both survive the
   * round trip: retrieval ran and matched nothing, versus a turn that recorded
   * nothing at all. The first renders the "no policy text was retrieved, at any
   * level" caution; the second renders no block. Collapsing them would turn a
   * stated absence into silence. (FLOW-83)
   */
  it('keeps an empty citations array distinct from an absent one', () => {
    expect(readStoredTurn(JSON.stringify({ citations: [] })).citations).toEqual([]);
    expect(readStoredTurn(JSON.stringify({ kind: 'guidance' })).citations).toBeUndefined();
  });

  it('returns nothing for a turn with no metadata', () => {
    expect(readStoredTurn(null)).toEqual({});
    expect(readStoredTurn(undefined)).toEqual({});
    expect(readStoredTurn('')).toEqual({});
  });

  /*
   * A conversation must still load when one row in the middle of it cannot be
   * read. The alternative is an administrator locked out of an entire incident
   * record by a truncated write.
   */
  it('never throws on metadata it cannot parse', () => {
    for (const raw of ['{"citations":', 'not json at all', '[]', 'null', '"a string"', '42']) {
      expect(() => readStoredTurn(raw), raw).not.toThrow();
      expect(readStoredTurn(raw), raw).toEqual({});
    }
  });

  it('reads each field independently, so one bad field does not cost the other', () => {
    // Citations of a shape we cannot use, alongside a kind we can.
    const badCitations = JSON.stringify({ citations: [{ title: 42 }], kind: 'question' });
    expect(readStoredTurn(badCitations)).toEqual({ citations: undefined, kind: 'question' });

    // And the reverse: a kind from some later vocabulary must not hide the
    // citations, which are the half an administrator needs to check the answer.
    const badKind = JSON.stringify({ citations: [CITATION], kind: 'clarifying' });
    expect(readStoredTurn(badKind)).toEqual({ citations: [CITATION], kind: undefined });
  });
});
