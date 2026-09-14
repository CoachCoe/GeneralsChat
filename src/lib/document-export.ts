import type { ReportBlock } from '@/lib/report-template';

/**
 * The documents an incident produces, as text a person can keep.
 *
 * Markdown, not PDF. Printing is already how this application makes a PDF --
 * `DocumentPage` has a print control and `theme.css` a print palette -- so a
 * PDF library here would be a second renderer of the same pages, with its own
 * fonts, page breaks and bugs. Markdown is readable as it stands, opens
 * anywhere, and diffs.
 *
 * Rendered in the browser from what the page already holds, so there is no
 * second server path to the same records and no second place for its access
 * check to be wrong.
 */

/**
 * How an instant is written on a district form, on screen and in the copy that
 * is taken away.
 *
 * One function, because the page and its download are the same document and
 * were rendering it two ways -- `Sep 13, 2026` against `9/13/2026`. The reader's
 * zone either way, so the invariant held; two renderings of one legal document
 * did not agree.
 *
 * Here rather than exported from the page, so the export path can reach it
 * without importing a route component.
 */
export function formatFormInstant(iso: string, as: 'date' | 'time'): string {
  const at = new Date(iso);
  return as === 'date'
    ? at.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** A blank the record could not fill, kept as a blank rather than invented. */
const BLANK_RULE = '________________';

function fieldValue(
  value: { text: string } | { iso: string; as: 'date' | 'time' } | undefined,
  formatInstant: (iso: string, as: 'date' | 'time') => string
): string {
  if (!value) return BLANK_RULE;
  return 'text' in value ? value.text : formatInstant(value.iso, value.as);
}

/**
 * The district's form with the record written into it.
 *
 * `formatInstant` is passed in rather than called here: times cross the wire as
 * instants and are formatted in the reader's zone, so the component that knows
 * the reader decides, not this module.
 */
export function reportToMarkdown(
  title: string,
  blocks: ReportBlock[],
  formatInstant: (iso: string, as: 'date' | 'time') => string
): string {
  const lines: string[] = [`# ${title}`, ''];

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        lines.push('', `## ${block.text}`, '');
        break;
      case 'text':
        lines.push(block.text, '');
        break;
      case 'field':
      case 'longField':
        lines.push(`**${block.label}** ${fieldValue(block.value, formatInstant)}`, '');
        break;
      case 'choice':
        lines.push(`**${block.label}**`, '');
        for (const option of block.options) lines.push(`- [ ] ${option}`);
        lines.push('');
        break;
      case 'lines':
        // Ruled writing space on the printed form; on paper you write here, so
        // the download keeps the same number of blank rules.
        for (let i = 0; i < block.count; i++) lines.push(BLANK_RULE);
        lines.push('');
        break;
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export interface TranscriptTurn {
  speaker: string;
  body: string;
  at: string;
}

/**
 * A conversation as a document.
 *
 * Used for the assistant's transcript, which is part of the incident record.
 */
export function transcriptToMarkdown(
  title: string,
  turns: TranscriptTurn[],
  formatInstant: (iso: string) => string
): string {
  const lines: string[] = [`# ${title}`, ''];
  for (const turn of turns) {
    lines.push(`### ${turn.speaker} — ${formatInstant(turn.at)}`, '', turn.body, '');
  }
  return `${lines.join('\n').trim()}\n`;
}

/** Prose that is already prose. */
export function summaryToMarkdown(title: string, body: string): string {
  return `# ${title}\n\n${body.trim()}\n`;
}

/**
 * A filename a person can find again: the document, then the incident, then
 * enough of the date to sort.
 *
 * Anything that is not a letter, digit or dash becomes one dash, so a title
 * carrying a slash or a colon cannot produce a path or an unopenable file.
 */
export function documentFilename(kind: string, incidentTitle: string, at: Date): string {
  const slug = incidentTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const day = at.toISOString().slice(0, 10);
  return `${kind}-${slug || 'incident'}-${day}.md`;
}
