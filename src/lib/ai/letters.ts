/**
 * Letter drafting: whether a turn is asking for one, and how the district's own
 * letters are put to the model.
 *
 * Letter templates are not sent with every turn. They are the district's own
 * prose about past decisions -- long, and untrusted text in the one place a
 * prompt injection is most likely to be obeyed -- so they are fetched only when
 * they are the thing being asked for.
 *
 * A tight matcher, and deliberately so. A false positive spends tokens and
 * puts a drafting instruction in front of a turn that did not want one; a false
 * negative costs the administrator a template while the model still answers.
 * Those are not the same size of mistake, so this matches an explicit request
 * to produce a document and nothing looser: "letter" alone is not enough --
 * "the appeal letter says" is a question about a letter, not a request for one.
 */

/** Producing something: write, draft, prepare, put together. */
const PRODUCE = String.raw`(?:draft|write|compose|prepare|put together|generate|help me with)`;

/** The thing produced. */
const DOCUMENT = String.raw`(?:letter|notice|decision|findings|response|determination)`;

const ASKS = new RegExp(
  // "draft a letter", "write the findings letter", "help me with a response to"
  String.raw`\b${PRODUCE}\b[^.?!]{0,40}?\b${DOCUMENT}\b`,
  'i'
);

export function asksForALetter(message: string): boolean {
  return ASKS.test(message);
}

export interface LetterTemplate {
  title: string;
  content: string | null;
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
