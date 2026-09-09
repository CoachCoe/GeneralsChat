/**
 * The label the guidance model puts on its own turn, and the parser that
 * removes it before anything is displayed or stored.
 *
 * The chat UI hangs a provenance block -- the "This rests on" ladder and the
 * coverage-gap card -- under every assistant turn. That block is a claim: it
 * says the text above it rests on the policies named below it. A turn that
 * only asks "can you describe what happened between them?" rests on nothing,
 * so the block under it vouched for an assertion that was never made, and the
 * amber gap card repeated identically on every turn of the conversation until
 * it read as decoration. `e2e/chat-flow.spec.ts` already names the principle
 * from the other direction: no sources block, "which is what makes a turn look
 * like an answer."
 *
 * Retrieval cannot answer this. It knows what was *fetched*, not what the
 * answer *used*, and those differ on exactly the turns this exists to catch.
 * So the model states which kind of turn it just wrote.
 *
 * **The label is metadata, never content.** It is carried as a marker line
 * rather than by wrapping the reply in JSON, because a parse failure must
 * never be able to cost an administrator the answer text: an unparseable
 * marker leaves the prose untouched.
 */

export type TurnKind = 'question' | 'guidance';

export interface LabelledTurn {
  kind: TurnKind;
  /** The reply with the marker line removed. */
  content: string;
}

/**
 * A leading `[[TURN: question]]` / `[[TURN: guidance]]`, tolerating the
 * markdown a model wraps things in unbidden (backticks, emphasis, a quote
 * caret) and the blank lines after it.
 *
 * Any word is matched, not just the two we know, so a drifted or misspelled
 * label is still stripped rather than rendered at an administrator. Which kind
 * it maps to is decided below, where the unknown case is safe.
 */
const LEADING_LABEL = /^[\s>*_`]*\[\[[ \t]*turn[ \t]*:[ \t]*([a-z_-]+)[ \t]*\]\][`*_]*[ \t]*(?:\r?\n)*/i;

/**
 * Split a raw guidance reply into its kind and its text.
 *
 * **Absent, unreadable or unrecognised labels mean `guidance`.** The two
 * failures are not symmetric: a guidance turn wrongly marked `question` loses
 * its citations and its coverage gap, so an administrator reads a statutory
 * deadline with nothing shown behind it and no warning that the district has
 * no policy on the subject. A question turn wrongly marked `guidance` shows a
 * sources block under a question -- which is the noise we started with, and
 * nothing worse. So every uncertain path falls toward showing.
 */
export function parseTurnLabel(raw: string): LabelledTurn {
  const match = LEADING_LABEL.exec(raw);
  if (!match) return { kind: 'guidance', content: raw };

  const label = match[1].toLowerCase();
  return {
    // Only the exact word earns the suppression; everything else is guidance.
    kind: label === 'question' ? 'question' : 'guidance',
    content: raw.slice(match[0].length),
  };
}
