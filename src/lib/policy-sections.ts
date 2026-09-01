/**
 * Split a policy document into its own sections.
 *
 * Citing a whole policy tells an administrator where to start reading; citing
 * the provision tells them what to rely on. School board policies are written
 * with lettered sections whose headers frequently name the statute they
 * implement, so both the local reference and the authority behind it can be
 * recovered from the text -- "JICK §F — Investigative Procedures
 * (RSA 193-F:4, II(k))".
 *
 * This is deliberately conservative. A wrong section reference on a statutory
 * obligation is worse than none, so anything that does not clearly parse stays
 * unlabelled and is cited at policy level as before.
 */

export interface PolicySection {
  /** "A", "B", … — the document's own label. */
  label: string;
  /** The header text with the label and any statute reference removed. */
  title: string;
  /** Statutory reference named in the header, if any. e.g. "RSA 193-F:4, II(k)" */
  statute?: string;
  /** Body text, header included. */
  text: string;
}

/**
 * A lettered header at the start of a line: `A. Purpose and Intent.`
 *
 * Requires the letter to be followed by a period, a space, and a capital, which
 * avoids matching mid-sentence initials and list items like "a. foo".
 */
const LETTERED_HEADER = /^([A-Z])\.\s+([A-Z][^\n]*)$/;

/**
 * Statutory references as they appear in New Hampshire board policy.
 *
 * Handles the three shapes these headers actually use: a single provision, a
 * range ("RSA 193-F:4, II(f) - (h)"), and two provisions joined
 * ("RSA 193-F:4, II(e) and 193-F:5", "RSA 193-F:7 & 9"). A naive pattern
 * truncates each of the latter two mid-reference and strands the remainder in
 * the section title.
 */
const STATUTE =
  /\b(RSA\s+\d+-?[A-Z]?:\d+(?:\s*,\s*[IVXL]+(?:\([a-z]\))?)?(?:\s*[-–]\s*\([a-z]\))?(?:\s*(?:&|and)\s*(?:\d+-?[A-Z]?:)?\d+(?:\([a-z]\))?)*)/;

const MAX_TITLE_WORDS = 14;

/**
 * Recover the section's title from a header line.
 *
 * Extracted policy text runs the header into the body -- "A. Purpose and
 * Intent. The [School District Name] is committed to..." -- so the title is
 * everything up to the first sentence break, once the statute reference has
 * been cut out of the middle. Whatever survives is then trimmed of the
 * separators that cut leaves behind.
 */
function tidyTitle(raw: string): string {
  const withoutStatute = raw.replace(STATUTE, '');

  // First sentence break ends the header; the rest is body prose.
  const firstSentence = withoutStatute.split(/\.\s/)[0];

  const cleaned = firstSentence
    .replace(/\(\s*\)/g, '')
    // Collapse the dangling separators left where the statute used to be.
    .replace(/\s*[-–—]\s*(?=[-–—])/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—,.:;]+/, '')
    .replace(/[\s\-–—,.:;]+$/, '')
    .trim();

  // A header that still runs long is body text that never broke; cap it rather
  // than putting a paragraph in a citation.
  const words = cleaned.split(/\s+/);
  return words.length > MAX_TITLE_WORDS
    ? words.slice(0, MAX_TITLE_WORDS).join(' ') + '…'
    : cleaned;
}

/**
 * How many continuation lines a wrapped header may absorb.
 *
 * A header that wraps does so once in practice; a larger budget starts pulling
 * body paragraphs into citations when a section header happens to lack
 * terminal punctuation.
 */
const MAX_HEADER_CONTINUATION_LINES = 1;

/**
 * Rejoin a header split across lines by the PDF's own wrapping.
 *
 * "H. Substantiated Instances of Bullying or Retaliation: Interventions,
 * Remedial Measures and Disciplinary" / "Action." is one header in the
 * document and two lines in the extracted text. Taking only the matched line
 * cites the section as ending on "Disciplinary", which reads as a defect and
 * misnames the provision.
 *
 * A header that continues is one that has not ended a sentence yet, so lines
 * are joined until a period appears.
 */
function joinWrappedHeader(lines: string[], index: number, header: string): string {
  let joined = header;
  for (let n = 1; n <= MAX_HEADER_CONTINUATION_LINES; n++) {
    if (joined.includes('.')) break;
    const next = lines[index + n]?.trim();
    if (!next) break;
    // A following header is a new section, never this one's continuation.
    if (LETTERED_HEADER.test(next)) break;
    joined = `${joined} ${next}`;
  }
  return joined;
}

/**
 * Tidy the whitespace a line break leaves inside a statutory reference.
 *
 * "II(f)-\n(h)" collapses to "II(f)- (h)", which is the right reference
 * printed wrongly. Only the dash between two parenthesised subdivisions is
 * respaced -- the hyphen in "193-F:4" is part of the chapter number and must
 * be left alone.
 */
function normaliseStatute(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/\)\s*([-\u2013])\s*\(/g, ') $1 (')
    .trim();
  return cleaned || undefined;
}

export function parsePolicySections(content: string): PolicySection[] {
  const lines = content.split('\n');

  const starts: { index: number; label: string; header: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = LETTERED_HEADER.exec(lines[i].trim());
    if (m) starts.push({ index: i, label: m[1], header: joinWrappedHeader(lines, i, m[2]) });
  }

  // A single stray match is more likely a false positive than a document with
  // one section, and sections should run in order. Anything else is treated as
  // unstructured.
  if (starts.length < 2) return [];
  const ordered = starts.every(
    (s, i) => i === 0 || s.label.charCodeAt(0) > starts[i - 1].label.charCodeAt(0)
  );
  if (!ordered) return [];

  return starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;
    const text = lines.slice(s.index, end).join('\n').trim();
    const statute = normaliseStatute(STATUTE.exec(s.header)?.[1]);
    return {
      label: s.label,
      title: tidyTitle(s.header),
      ...(statute ? { statute } : {}),
      text,
    };
  });
}

/**
 * How a section is referred to in guidance and on an obligation.
 *
 * `JICK §F — Investigative Procedures (RSA 193-F:4, II(k))`
 */
export function formatSectionCitation(
  policyTitle: string,
  section: Pick<PolicySection, 'label' | 'title' | 'statute'>
): string {
  // "Policy JICK: Bullying Prevention — …" reduces to "JICK".
  const code = /\b([A-Z]{3,5})\b/.exec(policyTitle.replace(/^Policy\s+/i, ''))?.[1];
  const name = code ?? policyTitle.split(/[:—-]/)[0].trim();
  const statute = section.statute ? ` (${section.statute})` : '';
  const title = section.title ? ` — ${section.title}` : '';
  return `${name} §${section.label}${title}${statute}`;
}
