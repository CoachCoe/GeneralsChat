import type { PolicyReference } from '@/types';

/** Where an obligation's deadline came from. */
export type DeadlineSource = 'policy' | 'model';

export interface Provenance {
  deadlineSource: DeadlineSource;
  policyId: string | null;
  citation: string | null;
}

const UNVERIFIED: Provenance = { deadlineSource: 'model', policyId: null, citation: null };

/*
 * A quantity followed by a unit of time: "24 hours", "within 5 school days",
 * "ten (10) business days", "48-hour". The optional parenthetical is how
 * policy text usually writes a number twice -- "five (5) school days" -- and
 * the hyphen is how it writes an adjective, "the 24-hour reporting window".
 *
 * Spelled-out numbers are listed rather than matched generically because the
 * bare word "days" must not qualify on its own: "school days" appears in
 * plenty of provisions that set no clock at all.
 */
const QUANTITY = String.raw`\d+|one|two|three|four|five|six|seven|eight|nine|ten|` +
  String.raw`eleven|twelve|fifteen|twenty|thirty|forty[- ]?five|sixty|ninety`;
const TIME_UNIT = String.raw`hours?|days?|weeks?|months?`;
const QUANTIFIED_TIME = new RegExp(
  String.raw`\b(?:${QUANTITY})\b[\s\-\u2013\u2014]*(?:\([^)]*\)[\s\-]*)?` +
    String.raw`(?:business|school|calendar|working)?[\s\-]*(?:${TIME_UNIT})\b`,
  'i'
);

/*
 * Deadlines that name no number. "Immediately" is as much a clock as "within
 * 24 hours", and mandatory-reporting statutes are written in exactly these
 * words, so a provision using them has stated a time limit.
 */
const IMMEDIACY =
  /\b(?:immediately|promptly|forthwith|without delay|as soon as (?:possible|practicable|reasonably)|same[- ](?:school[- ])?day|end of the (?:next[- ])?(?:school[- ])?day|no later than)\b/i;

/**
 * Does this provision state a time limit at all?
 *
 * The question a deadline's provenance turns on. Resolving the excerpt the
 * model named confirms only that it was one the model was given, not that it
 * says anything about *when* -- so a model citing a real provision for a number
 * that provision does not contain would earn a policy-backed row and the red
 * countdown that goes with it.
 *
 * This closes the half of that gap that needs no calibration. A provision
 * containing no time expression whatsoever cannot be the source of a number of
 * hours, whatever the model claims -- that is decidable from the text alone.
 *
 * **What it deliberately does not do** is check that the time it found is the
 * time the model derived. An excerpt is up to a thousand characters and may
 * carry several provisions, so a clock found anywhere in it satisfies this. The
 * result is a check that only ever *downgrades*: a false positive here leaves
 * today's behaviour untouched, and there is no input on which it can promote a
 * model's guess to policy-backed. Matching the specific number to the specific
 * obligation is the remaining half, and it still wants real incidents to
 * calibrate against.
 */
export function statesATimeLimit(text: string): boolean {
  return QUANTIFIED_TIME.test(text) || IMMEDIACY.test(text);
}

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
 * as policy-backed when nothing retrieved supports it.
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
    /*
     * The excerpt was supplied and the model named it. Whether it can support a
     * *deadline* is a further question, and one the text answers: a provision
     * stating no time limit at all did not produce a number of hours.
     *
     * The citation and policy id survive that demotion, because they are still
     * true -- the obligation does rest on this provision, and an administrator
     * checking the answer needs to be sent to it. Only the claim about the
     * clock is withdrawn, which is exactly what `deadlineSource` governs: the
     * countdown loses its red and reads as unverified.
     */
    deadlineSource: statesATimeLimit(reference.text) ? 'policy' : 'model',
    policyId: reference.policyId,
    citation: reference.citation,
  };
}
