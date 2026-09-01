import { describe, expect, it } from 'vitest';
import { resolveProvenance } from './obligation-provenance';
import type { PolicyReference } from '@/types';

/**
 * The whole point of OQ-5: an obligation may only claim a policy backs its
 * deadline when the excerpt it names was actually supplied. Everything here is
 * a way the model can be wrong about its own reasoning.
 */
const REFERENCES: PolicyReference[] = [
  { n: 1, policyId: 'p-jick', citation: 'JICK §D — Procedures for Reporting (RSA 193-F:4)' },
  { n: 2, policyId: 'p-jlf', citation: 'JLF — Reporting Child Abuse and Neglect' },
];

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
});
