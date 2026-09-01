import type { PolicyReference } from '@/types';

/** Where an obligation's deadline came from. */
export type DeadlineSource = 'policy' | 'model';

export interface Provenance {
  deadlineSource: DeadlineSource;
  policyId: string | null;
  citation: string | null;
}

const UNVERIFIED: Provenance = { deadlineSource: 'model', policyId: null, citation: null };

/**
 * Resolve the model's claim about where a deadline came from.
 *
 * The model is asked to name the numbered excerpt that states the deadline.
 * That is a claim about its own reasoning, and it is worth exactly nothing
 * until it is checked: an excerpt number that does not correspond to text the
 * model was actually given cannot support anything. So the number is looked up
 * in the excerpts that were supplied, and anything that fails to resolve --
 * invented, off-by-one, out of range, or absent -- produces an unverified
 * obligation rather than a confident citation to the wrong provision.
 *
 * Unverified is not a failure state. It is the honest description of a
 * deadline the loaded policy does not state, and with a thin library it is the
 * common case. What must never happen is the reverse: an obligation presented
 * as policy-backed when nothing retrieved supports it. (OQ-5)
 */
export function resolveProvenance(
  sourceExcerpt: number | null | undefined,
  references: PolicyReference[]
): Provenance {
  if (sourceExcerpt === null || sourceExcerpt === undefined) return UNVERIFIED;
  if (!Number.isInteger(sourceExcerpt)) return UNVERIFIED;

  const reference = references.find(r => r.n === sourceExcerpt);
  if (!reference) return UNVERIFIED;

  return {
    deadlineSource: 'policy',
    policyId: reference.policyId,
    citation: reference.citation,
  };
}
