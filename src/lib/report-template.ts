/**
 * The district's own report form, turned into something the incident record
 * can be poured into.
 *
 * A mandatory report is a legal filing, so the form is not ours to invent: the
 * blocks are parsed out of the document the district loaded, and a field this
 * system cannot answer stays a blank to write on. Names, ages and grades live
 * in the reporter's prose rather than in any field, and inferring them from it
 * is how a report names the wrong child.
 */

export type ReportBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'field'; label: string; value?: string; source?: string }
  | { kind: 'longField'; label: string; value?: string; source?: string }
  | { kind: 'choice'; label: string; options: string[] }
  | { kind: 'lines'; count: number };

/** What the incident record can answer, already formatted for the page. */
export interface ReportFacts {
  dateReported?: string;
  timeReported?: string;
  personReporting?: string;
  completedBy?: string;
  description?: string;
  /** Only ever a deadline a retrieved policy states. */
  investigationDue?: string;
}

const BLANK = /_{4,}/;
const CHECKBOX = '☐';

/**
 * Which blank each fact belongs in, by the form's own wording. A district that
 * words a field differently gets a blank rather than a wrong answer.
 */
const FILLS: { match: (label: string) => boolean; fact: keyof ReportFacts; source: string }[] = [
  {
    match: l => l.startsWith('date reported to'),
    fact: 'dateReported',
    source: 'from the incident record',
  },
  {
    match: l => l.startsWith('time reported to'),
    fact: 'timeReported',
    source: 'from the incident record',
  },
  {
    match: l => l === 'person reporting incident' || l === 'person reporting',
    fact: 'personReporting',
    source: 'from the incident record',
  },
  {
    match: l => l.includes('administrator completing form'),
    fact: 'completedBy',
    source: 'signed in as',
  },
  {
    match: l => l.startsWith('required investigation completion date'),
    fact: 'investigationDue',
    source: 'from a policy-backed deadline',
  },
  {
    match: l => l.startsWith('description of alleged'),
    fact: 'description',
    source: 'from the incident record',
  },
];

function normalise(label: string): string {
  return label.trim().replace(/[:\s]+$/, '').toLowerCase();
}

function isHeading(text: string): boolean {
  return text.length <= 64 && !/[.?]$/.test(text) && !text.endsWith(':');
}

export function parseReportTemplate(content: string): ReportBlock[] {
  const blocks: ReportBlock[] = [];

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line.includes(CHECKBOX)) {
      const [before, ...rest] = line.split(CHECKBOX);
      const options = rest.map(o => o.trim()).filter(Boolean);
      // The question is usually the line above the boxes, not the start of
      // the row, and a choice adrift from its question is unusable.
      const previous = blocks[blocks.length - 1];
      let label = before.trim();
      if (!label && previous?.kind === 'text' && previous.text.endsWith(':')) {
        label = previous.text;
        blocks.pop();
      }
      blocks.push({ kind: 'choice', label, options });
      continue;
    }

    if (BLANK.test(line)) {
      const label = line.split(BLANK)[0].trim();
      if (label) {
        blocks.push({ kind: 'field', label: label.replace(/[:\s]+$/, '') });
        continue;
      }

      const previous = blocks[blocks.length - 1];
      if (previous?.kind === 'lines') {
        previous.count += 1;
      } else if (previous?.kind === 'text' && previous.text.endsWith(':')) {
        // A label followed by ruled lines is one question with room to
        // answer, not a sentence and some furniture.
        blocks[blocks.length - 1] = {
          kind: 'longField',
          label: previous.text.replace(/[:\s]+$/, ''),
        };
      } else if (previous?.kind !== 'longField') {
        // Further rules under a long field are the same writing space.
        blocks.push({ kind: 'lines', count: 1 });
      }
      continue;
    }

    blocks.push(isHeading(line) ? { kind: 'heading', text: line } : { kind: 'text', text: line });
  }

  return blocks;
}

/** Fill in what the record knows, and only that. */
export function prefillReport(blocks: ReportBlock[], facts: ReportFacts): ReportBlock[] {
  return blocks.map(block => {
    if (block.kind !== 'field' && block.kind !== 'longField') return block;

    const label = normalise(block.label);
    const fill = FILLS.find(f => f.match(label));
    const value = fill ? facts[fill.fact] : undefined;
    if (!fill || !value) return block;

    return { ...block, value, source: fill.source };
  });
}

/** How much of the form the record could answer, for the page to say plainly. */
export function countPrefilled(blocks: ReportBlock[]): { filled: number; total: number } {
  const fields = blocks.filter(b => b.kind === 'field' || b.kind === 'longField');
  return { filled: fields.filter(b => 'value' in b && b.value).length, total: fields.length };
}
