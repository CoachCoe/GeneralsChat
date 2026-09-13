import { describe, expect, it } from 'vitest';
import {
  documentFilename,
  reportToMarkdown,
  summaryToMarkdown,
  transcriptToMarkdown,
} from './document-export';
import type { ReportBlock } from './report-template';

const at = (iso: string, as: 'date' | 'time') => (as === 'date' ? `D:${iso}` : `T:${iso}`);

describe('reportToMarkdown', () => {
  it('keeps a blank the record could not fill as a blank', () => {
    const blocks: ReportBlock[] = [{ kind: 'field', label: 'Name of alleged victim:' }];
    const md = reportToMarkdown('Form', blocks, at);
    // The rule the whole report page exists for: a name is in the reporter's
    // prose, and inferring it is how a report names the wrong child.
    expect(md).toContain('**Name of alleged victim:** ________________');
  });

  it('formats an instant through the caller, which knows the reader', () => {
    const blocks: ReportBlock[] = [
      { kind: 'field', label: 'Date reported:', value: { iso: '2026-09-13T10:00:00Z', as: 'date' } },
    ];
    expect(reportToMarkdown('Form', blocks, at)).toContain('D:2026-09-13T10:00:00Z');
  });

  it('renders choices unticked, because the form is a draft', () => {
    const blocks: ReportBlock[] = [
      { kind: 'choice', label: 'Location', options: ['on school property', 'on a school bus'] },
    ];
    const md = reportToMarkdown('Form', blocks, at);
    expect(md).toContain('- [ ] on school property');
    expect(md).toContain('- [ ] on a school bus');
  });

  it('keeps ruled writing space, one rule per line', () => {
    const md = reportToMarkdown('Form', [{ kind: 'lines', count: 3 }], at);
    expect(md.match(/________________/g)).toHaveLength(3);
  });

  it('does not run headings and text together', () => {
    const md = reportToMarkdown(
      'Form',
      [
        { kind: 'heading', text: 'Section A' },
        { kind: 'text', text: 'Complete one form per alleged victim.' },
      ],
      at
    );
    expect(md).toContain('## Section A\n\nComplete one form per alleged victim.');
  });
});

describe('transcriptToMarkdown', () => {
  it('names who said what, and when', () => {
    const md = transcriptToMarkdown(
      'Bullying: playground',
      [{ speaker: 'Administrator', body: 'A student was targeted.', at: '2026-09-13T10:00:00Z' }],
      iso => `@${iso}`
    );
    expect(md).toContain('### Administrator — @2026-09-13T10:00:00Z');
    expect(md).toContain('A student was targeted.');
  });

  it('is just the title when there is nothing to say', () => {
    expect(transcriptToMarkdown('Empty', [], iso => iso)).toBe('# Empty\n');
  });
});

describe('summaryToMarkdown', () => {
  it('keeps prose as prose', () => {
    expect(summaryToMarkdown('Summary', '  Body text.  ')).toBe('# Summary\n\nBody text.\n');
  });
});

describe('documentFilename', () => {
  it('is findable: document, incident, date', () => {
    expect(documentFilename('report', 'Bullying: Playground incident', new Date('2026-09-13T09:00:00Z')))
      .toBe('report-bullying-playground-incident-2026-09-13.md');
  });

  it('cannot produce a path from a title', () => {
    const name = documentFilename('report', '../../etc/passwd', new Date('2026-01-02T00:00:00Z'));
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });

  it('still names the file when the title reduces to nothing', () => {
    expect(documentFilename('summary', '???', new Date('2026-01-02T00:00:00Z'))).toBe(
      'summary-incident-2026-01-02.md'
    );
  });
});
