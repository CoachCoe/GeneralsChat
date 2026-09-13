/**
 * Steps the administrator said, in their own words, that they have already
 * done -- and the marker the model uses to point at them.
 *
 * **This proposes; it never discharges.** `completedAt` is the record that a
 * statutory obligation was met, and the queue built on it is what stops a
 * deadline being missed. The distance between "I'll call DCYF after this" and
 * "I called DCYF" is one word, and a model that reads it wrong would write
 * "met" onto the one artefact whose whole job is to say otherwise. So a claim
 * parsed here becomes a confirmation the administrator clicks, and the audit
 * row still records a person doing it.
 *
 * Carried as a marker line for the same reason `parseTurnLabel` is: a parse
 * failure must cost the administrator a suggestion, never the answer text.
 * Unreadable markers are dropped and the prose is left alone.
 *
 * **The number is a position in a list that moves.** Discharging one step
 * renumbers the rest, and the conversation history still holds earlier turns
 * numbered the old way, so the model can name a position meaning something it
 * read three turns ago. Out of range is dropped; wrong but in range cannot be
 * detected here. What catches it is the confirmation showing the step's own
 * description before anything is written -- so confirm-first is load-bearing,
 * not a courtesy, and an id in the marker would not fix it either: a model
 * that can misread which step is done can misread which id goes with it.
 */

export interface ClaimedCompletions {
  /** 1-based step numbers, as they appeared in the plan. Deduped, ascending. */
  steps: number[];
  /** The reply with every marker removed. */
  content: string;
}

/**
 * `[[DONE: 2]]`, `[[DONE: 1, 3]]`, anywhere in the reply, tolerating the
 * markdown a model wraps things in unbidden.
 */
const CLAIM = /[\s>*_`]*\[\[[ \t]*done[ \t]*:[ \t]*([0-9,\s]+?)[ \t]*\]\][`*_]*[ \t]*/gi;

/**
 * Pull completion claims out of a reply.
 *
 * `stepCount` is how many steps the plan actually offered. A number outside
 * that range is dropped rather than clamped: clamping would silently retarget
 * a claim at a different obligation, which is the one mistake that matters
 * here.
 */
export function parseCompletionClaims(raw: string, stepCount: number): ClaimedCompletions {
  const steps = new Set<number>();

  const content = raw.replace(CLAIM, (_match, body: string) => {
    for (const part of body.split(',')) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && n >= 1 && n <= stepCount) steps.add(n);
    }
    // The marker is metadata; removing it must not weld the words on either
    // side together.
    return ' ';
  });

  return {
    steps: [...steps].sort((a, b) => a - b),
    // A marker on its own line leaves the blank lines that surrounded it, so
    // a run of them is normalised back to one paragraph break.
    content: content.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}
