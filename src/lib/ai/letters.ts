/**
 * Letter drafting: whether a turn is asking for one, which of the district's
 * letters to offer, and how they are put to the model.
 *
 * Letter templates are not sent with every turn. They are the district's own
 * prose about past decisions -- long, and untrusted text in the one place a
 * prompt injection is most likely to be obeyed -- so they are fetched only when
 * they are the thing being asked for.
 */

/** Producing something: write, draft, prepare, put together. */
const PRODUCE = String.raw`(?:draft|write|compose|prepare|put together|generate)`;

/** The thing produced. */
const DOCUMENT = String.raw`(?:letter|notice|decision|findings|response|determination)`;

/** A produce-verb close enough to a document to be about writing one. */
const PRODUCES_A_DOCUMENT = new RegExp(
  String.raw`\b${PRODUCE}\b[^.?!]{0,40}?\b${DOCUMENT}\b`,
  'i'
);

/**
 * Asking someone else to do it.
 *
 * The verb alone is not a request -- most of this domain's vocabulary is
 * "write", "decision", "findings", "response" -- so something has to mark the
 * turn as asking. Either an explicit frame, or the message opening on a bare
 * imperative ("Draft a letter to the parents").
 */
const REQUEST_FRAME = new RegExp(
  String.raw`(?:\b(?:can|could|would|will)\s+you\b|\bplease\b|\bhelp\s+me\b|\bi\s+need\b|\blet'?s\b|^\s*${PRODUCE}\b)`,
  'i'
);

/**
 * Asking whether a duty exists, which is a policy question and not a request.
 * "Do I need to write the incident up before the response deadline?" carries a
 * request frame ("I need") and asks for nothing.
 */
const ASKS_ABOUT_DUTY = /^\s*(?:do|does|should|must|am|is|are|when|what|who)\b/i;

/** Saying they will do it themselves. "I will write up my findings tomorrow." */
const WILL_DO_IT_THEMSELVES = /\bi\s*(?:will|'ll|am going to|'m going to)\b/i;

export function asksForALetter(message: string): boolean {
  if (!PRODUCES_A_DOCUMENT.test(message)) return false;
  if (ASKS_ABOUT_DUTY.test(message) || WILL_DO_IT_THEMSELVES.test(message)) return false;
  return REQUEST_FRAME.test(message);
}

export interface LetterTemplate {
  title: string;
  content: string | null;
}

/**
 * Words in every template title, which therefore separate none of them.
 */
const UNDISCRIMINATING = new Set(['letter', 'template', 'bullying']);

/**
 * The templates most likely to be the one being asked for.
 *
 * Ranked by how much of a title the request actually names. Ordering them
 * alphabetically and taking the first few was deterministic and useless: with
 * "Appeal response", "Investigation findings" and "School board decision" in
 * the library, an administrator asking for a board decision got the three that
 * sort first and never the one they asked for.
 *
 * Ties break on title, so the same request still returns the same templates --
 * which is the property the alphabetical order was there for, and it survives.
 */
export function selectLetterTemplates(
  templates: LetterTemplate[],
  request: string,
  limit: number
): LetterTemplate[] {
  const asked = request.toLowerCase();

  const score = (title: string) =>
    [...new Set(title.toLowerCase().match(/[a-z]{4,}/g) ?? [])].filter(
      word => !UNDISCRIMINATING.has(word) && asked.includes(word)
    ).length;

  return [...templates]
    .map(template => ({ template, score: score(template.title) }))
    .sort((a, b) => b.score - a.score || a.template.title.localeCompare(b.template.title))
    .slice(0, limit)
    .map(({ template }) => template);
}

/**
 * The templates, as the model sees them.
 *
 * Labelled as structure rather than authority in the block itself, because
 * that is the distinction the whole document kind exists to hold: a letter
 * states findings and deadlines in a district's own voice, and one quoted back
 * as policy would read as what the district requires of everyone.
 */
export function renderLetterTemplates(templates: LetterTemplate[]): string {
  const blocks = templates.flatMap(t => {
    const content = t.content?.trim();
    return content ? [`--- TEMPLATE: ${t.title} ---\n${content}`] : [];
  });
  if (blocks.length === 0) return '';

  return `LETTER TEMPLATES (structure to follow, never authority to cite):
${blocks.join('\n\n')}`;
}
