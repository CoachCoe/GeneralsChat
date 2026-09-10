import { describe, expect, it } from 'vitest';
import {
  countPrefilled,
  parseReportTemplate,
  prefillReport,
  type ReportBlock,
  type ReportFacts,
} from './report-template';

/**
 * Wording taken from the SAU 24 School Bullying Investigation Form as loaded,
 * because the point of parsing rather than hardcoding is that the district's
 * document is the authority on what its own report asks.
 */
const FORM = `SAU # 24 School Bullying Investigation Form

REPORTING: Complete one School Bullying Investigation Form for each alleged victim.

School Administrator completing form: ________________________________________

Position: ________________________________________

Date reported to Principal/Designee: ____________________

Required investigation completion date (reported date + 10 school days): ______________

Name of Alleged Victim: _________________________

Age: __________

School Information

Location of incident (check all that apply):

☐ on school property ☐ at school-sponsored event or activity ☐ on school bus

Description of alleged bullying:

_________________________________________________________________________________________

_________________________________________________________________________________________

(Please attach student statements)`;

const blocks = parseReportTemplate(FORM);

const find = (label: string) =>
  blocks.find(b => (b.kind === 'field' || b.kind === 'longField') && b.label === label);

describe('parseReportTemplate', () => {
  it('turns a labelled blank into a field the record can answer', () => {
    expect(find('Date reported to Principal/Designee')).toEqual({
      kind: 'field',
      label: 'Date reported to Principal/Designee',
    });
  });

  it('keeps a field the record cannot answer, so it is filled in by hand', () => {
    // Names, ages and grades live in the reporter's prose. A form that
    // guessed them from that prose would name the wrong child.
    expect(find('Name of Alleged Victim')).toBeDefined();
    expect(find('Age')).toBeDefined();
  });

  it('folds ruled lines into the label above them', () => {
    // The label and the rules under it are one question with room to
    // answer, not a sentence followed by furniture.
    expect(find('Description of alleged bullying')?.kind).toBe('longField');
    expect(blocks.filter(b => b.kind === 'lines')).toHaveLength(0);
  });

  it('keeps a checkbox row as a choice, unticked', () => {
    const choice = blocks.find(b => b.kind === 'choice');
    expect(choice).toEqual({
      kind: 'choice',
      label: 'Location of incident (check all that apply):',
      options: ['on school property', 'at school-sponsored event or activity', 'on school bus'],
    });
  });

  it('separates a heading from prose', () => {
    expect(blocks).toContainEqual({ kind: 'heading', text: 'School Information' });
    expect(blocks).toContainEqual({
      kind: 'text',
      text: 'REPORTING: Complete one School Bullying Investigation Form for each alleged victim.',
    });
  });
});

describe('prefillReport', () => {
  const facts: ReportFacts = {
    reportedAt: '2026-09-09T22:19:00.000Z',
    personReporting: 'Dev Admin',
    completedBy: 'Dev Admin',
    description: 'A 7th grade student told me three classmates have been mocking her appearance.',
    investigationDueAt: '2026-09-23T22:19:00.000Z',
  };

  const filled = prefillReport(blocks, facts);
  const field = (label: string) =>
    filled.find(b => (b.kind === 'field' || b.kind === 'longField') && b.label === label) as
      | Extract<ReportBlock, { kind: 'field' | 'longField' }>
      | undefined;

  it('fills a field the record answers, and says where the value came from', () => {
    // The instant, not a rendering of it: formatting here would put the
    // server's timezone on a filing the administrator dates from theirs.
    expect(field('Date reported to Principal/Designee')).toMatchObject({
      value: { iso: facts.reportedAt, as: 'date' },
      source: 'from the incident record',
    });
    expect(field('Description of alleged bullying')).toMatchObject({
      value: { text: facts.description },
      kind: 'longField',
    });
  });

  it('leaves every field the record does not answer blank', () => {
    expect(field('Name of Alleged Victim')?.value).toBeUndefined();
    expect(field('Age')?.value).toBeUndefined();
    expect(field('Position')?.value).toBeUndefined();
  });

  it('leaves the investigation deadline blank when no policy states one', () => {
    // The caller passes this only for a policy-backed deadline. Counting
    // school days ourselves would be inventing a legal date out of a holiday
    // calendar we do not have.
    const withoutDeadline = prefillReport(blocks, { ...facts, investigationDueAt: undefined });
    const deadline = withoutDeadline.find(
      b => b.kind === 'field' && b.label.startsWith('Required investigation completion date')
    );
    expect(deadline).toBeDefined();
    expect(deadline && 'value' in deadline ? deadline.value : undefined).toBeUndefined();
  });

  it('does not tick a checkbox the record cannot answer', () => {
    expect(filled.filter(b => b.kind === 'choice')).toEqual(
      blocks.filter(b => b.kind === 'choice')
    );
  });

  it('counts what it could and could not answer, so the page can say', () => {
    expect(countPrefilled(filled)).toEqual({ filled: 4, total: 7 });
  });
});
