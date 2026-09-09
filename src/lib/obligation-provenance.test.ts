import { describe, expect, it } from 'vitest';
import { resolveProvenance, statesATimeLimit } from './obligation-provenance';
import type { PolicyReference } from '@/types';

/**
 * The whole point of OQ-5: an obligation may only claim a policy backs its
 * deadline when the excerpt it names was actually supplied. Everything here is
 * a way the model can be wrong about its own reasoning.
 */
const REFERENCES: PolicyReference[] = [
  {
    n: 1,
    policyId: 'p-jick',
    citation: 'JICK §D — Procedures for Reporting (RSA 193-F:4)',
    text: 'The principal shall report the incident to the superintendent within 48 hours.',
  },
  {
    n: 2,
    policyId: 'p-jlf',
    citation: 'JLF — Reporting Child Abuse and Neglect',
    text: 'Any school employee with reason to suspect abuse shall report immediately.',
  },
];

/** A real provision that imposes a duty and names no clock at all. */
const NO_CLOCK: PolicyReference = {
  n: 3,
  policyId: 'p-jicc',
  citation: 'JICC §B — Conduct on School Buses',
  text: 'Students shall obey the driver. The principal shall investigate reported misconduct and may suspend bus privileges.',
};

describe('resolveProvenance', () => {
  it('accepts an attribution that resolves to a supplied excerpt', () => {
    expect(resolveProvenance(1, REFERENCES)).toEqual({
      deadlineSource: 'policy',
      policyId: 'p-jick',
      citation: 'JICK §D — Procedures for Reporting (RSA 193-F:4)',
    });
  });

  it('carries the citation of the excerpt named, not of the first one', () => {
    expect(resolveProvenance(2, REFERENCES).citation).toBe(
      'JLF — Reporting Child Abuse and Neglect'
    );
  });

  it('treats an unattributed deadline as unverified rather than dropping it', () => {
    // null is the honest and, with a thin library, the common answer. The
    // obligation still exists; it just does not claim policy support.
    expect(resolveProvenance(null, REFERENCES)).toEqual({
      deadlineSource: 'model',
      policyId: null,
      citation: null,
    });
    expect(resolveProvenance(undefined, REFERENCES).deadlineSource).toBe('model');
  });

  it('refuses an excerpt number that was never supplied', () => {
    // The failure this exists to prevent: a confident citation to a provision
    // the model did not read, on a statutory deadline.
    expect(resolveProvenance(3, REFERENCES).deadlineSource).toBe('model');
    expect(resolveProvenance(99, REFERENCES).deadlineSource).toBe('model');
    expect(resolveProvenance(3, REFERENCES).citation).toBeNull();
  });

  it('refuses zero, negatives and non-integers', () => {
    for (const n of [0, -1, 1.5, NaN]) {
      expect(resolveProvenance(n, REFERENCES).deadlineSource).toBe('model');
    }
  });

  it('refuses everything when no excerpts were retrieved', () => {
    // An empty library must not be able to produce a policy-backed deadline.
    for (const n of [1, 2, null]) {
      expect(resolveProvenance(n, []).deadlineSource).toBe('model');
    }
  });

  /*
   * OQ-5 named this gap and left it open: attribution "verifies that the
   * excerpt exists and was supplied, not that the excerpt states the deadline
   * the model attributed to it." A provision that names no time at all cannot
   * be the source of a number of hours, and that much is decidable from the
   * text.
   */
  it('withdraws the deadline claim when the cited provision states no time', () => {
    const resolved = resolveProvenance(3, [...REFERENCES, NO_CLOCK]);
    expect(resolved.deadlineSource).toBe('model');
  });

  it('keeps the citation on a withdrawn deadline, because it is still true', () => {
    // The obligation does rest on this provision; only the claim about the
    // clock is withdrawn. Dropping the citation would send an administrator
    // checking the answer nowhere.
    const resolved = resolveProvenance(3, [...REFERENCES, NO_CLOCK]);
    expect(resolved.policyId).toBe('p-jicc');
    expect(resolved.citation).toBe('JICC §B — Conduct on School Buses');
  });

  it('still accepts a provision that does state one', () => {
    expect(resolveProvenance(1, REFERENCES).deadlineSource).toBe('policy');
    expect(resolveProvenance(2, REFERENCES).deadlineSource).toBe('policy');
  });
});

describe('statesATimeLimit', () => {
  it('finds a clock written the way policy writes one', () => {
    for (const text of [
      'shall be reported within 24 hours',
      'no later than 48 hours after the incident',
      'within five (5) school days of the report',
      'the investigation shall conclude within ten business days',
      'the 24-hour reporting window',
      'within 30 calendar days',
      'within two weeks',
      'a written report is due within 3 months',
    ]) {
      expect(statesATimeLimit(text), text).toBe(true);
    }
  });

  it('counts immediacy as a clock, because the statutes are written that way', () => {
    for (const text of [
      'shall report immediately',
      'shall notify the superintendent promptly',
      'without delay',
      'as soon as reasonably practicable',
      'by the end of the next school day',
      'must be filed the same day',
    ]) {
      expect(statesATimeLimit(text), text).toBe(true);
    }
  });

  /*
   * The false positives that would matter. A statute reference is full of
   * digits and a policy is full of section numbers, and neither states when
   * anything is due -- if these qualified, the check would confirm every
   * deadline it was asked about and be worth nothing.
   */
  it('is not fooled by the numbers policy text is full of', () => {
    for (const text of [
      'RSA 193-F:4, II(f) - (h)',
      'Policy JICK, adopted October 3, 2024; revised July 2026',
      'See Section 5 and Section 12 of this policy',
      'Ed 306.04(a)(8)',
      'The principal shall investigate and document the findings.',
      'Students shall obey the driver at all times.',
      'reported on school days to the building principal',
    ]) {
      expect(statesATimeLimit(text), text).toBe(false);
    }
  });
});
