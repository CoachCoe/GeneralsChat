import { describe, expect, it } from 'vitest';
import { formatSectionCitation, parsePolicySections } from './policy-sections';

/**
 * A wrong section reference on a statutory obligation is worse than none, so
 * the parser must refuse anything it cannot read confidently rather than guess.
 */
const JICK = [
  'Policy JICK: Bullying Prevention',
  'Status: ADOPTED',
  '',
  'A. Purpose and Intent. The District is committed to providing a safe school.',
  'More body text for section A.',
  'B. Definitions - (RSA 193-F:3).',
  'Bullying means a single significant incident.',
  'C. Retaliation & False Accusations - RSA 193-F:4, II(b). Retaliation is prohibited.',
  'D. Procedures for Reporting - RSA 193-F:4, II(f) - (h). At the start of each year.',
  'I. Dissemination of Policy - RSA 193-F:4, II(e) and 193-F:5.',
  'K. Immunity and Liability – RSA 193-F:7 & 9.',
].join('\n');

describe('parsePolicySections', () => {
  it('finds each lettered section', () => {
    expect(parsePolicySections(JICK).map(s => s.label)).toEqual(['A', 'B', 'C', 'D', 'I', 'K']);
  });

  it('takes the title from the header, not the body prose that follows it', () => {
    // Extracted text runs the header into the first sentence of the body.
    expect(parsePolicySections(JICK)[0].title).toBe('Purpose and Intent');
  });

  it('extracts the statute named in the header', () => {
    const byLabel = new Map(parsePolicySections(JICK).map(s => [s.label, s]));
    expect(byLabel.get('B')!.statute).toBe('RSA 193-F:3');
    expect(byLabel.get('C')!.statute).toBe('RSA 193-F:4, II(b)');
  });

  it('keeps a statutory range whole', () => {
    // "II(f) - (h)" truncated to "II(f)" would cite a narrower rule than the
    // policy does, and strand "- (h)" in the title.
    const d = parsePolicySections(JICK).find(s => s.label === 'D')!;
    expect(d.statute).toContain('II(f)');
    expect(d.statute).toContain('(h)');
    expect(d.title).not.toContain('(h)');
  });

  it('keeps two joined provisions whole', () => {
    const byLabel = new Map(parsePolicySections(JICK).map(s => [s.label, s]));
    expect(byLabel.get('I')!.statute).toBe('RSA 193-F:4, II(e) and 193-F:5');
    expect(byLabel.get('I')!.title).not.toContain('193');
    expect(byLabel.get('K')!.statute).toBe('RSA 193-F:7 & 9');
  });

  it('leaves the statute out of the title', () => {
    for (const s of parsePolicySections(JICK)) {
      expect(s.title, s.label).not.toMatch(/RSA/);
    }
  });

  it('carries the section body, header included', () => {
    const a = parsePolicySections(JICK)[0];
    expect(a.text).toContain('A. Purpose and Intent');
    expect(a.text).toContain('More body text for section A.');
    // And stops before the next section.
    expect(a.text).not.toContain('B. Definitions');
  });

  it('returns nothing for an unstructured document', () => {
    // An investigation form is fields and prose with no lettered sections; it
    // must cite at policy level rather than have sections invented for it.
    expect(parsePolicySections('Name: ______\nDate: ______\nSome prose here.')).toEqual([]);
  });

  it('refuses a single stray match, which is more likely a false positive', () => {
    expect(parsePolicySections('Some prose.\nB. Something that looks like a header')).toEqual([]);
  });

  it('refuses out-of-order labels', () => {
    // Real sections run A, B, C. Out of order means the pattern caught
    // something else, such as list items or initials.
    expect(parsePolicySections('C. First thing\nA. Second thing\nB. Third thing')).toEqual([]);
  });

  it('does not treat lowercase list items as sections', () => {
    expect(parsePolicySections('a. first item\nb. second item\nc. third item')).toEqual([]);
  });
});

describe('formatSectionCitation', () => {
  const title = 'Policy JICK: Bullying Prevention — Pupil Safety and Violence Prevention';

  it('reads like a citation, not a database row', () => {
    expect(
      formatSectionCitation(title, {
        label: 'F',
        title: 'Investigative Procedures',
        statute: 'RSA 193-F:4, II(k)',
      })
    ).toBe('JICK §F — Investigative Procedures (RSA 193-F:4, II(k))');
  });

  it('omits the statute when the section names none', () => {
    expect(formatSectionCitation(title, { label: 'G', title: 'Completion of Investigation' })).toBe(
      'JICK §G — Completion of Investigation'
    );
  });

  it('falls back to the policy name when there is no short code', () => {
    expect(
      formatSectionCitation('District Procedure for Reporting', { label: 'A', title: 'Scope' })
    ).toContain('§A');
  });
});

describe('headers wrapped by the source document', () => {
  // Both cases are taken verbatim from NHSBA JICK, where the extracted text
  // wraps mid-header and mid-statute.
  it('rejoins a header split across two lines', () => {
    const sections = parsePolicySections(
      [
        'G. Completion of Investigation and Report.',
        'The principal shall report the findings.',
        '',
        'H. Substantiated Instances of Bullying or Retaliation: Interventions, Remedial Measures and Disciplinary',
        'Consequences.',
        'The school shall impose consequences.',
      ].join('\n')
    );

    expect(sections.map(s => s.title)).toEqual([
      'Completion of Investigation and Report',
      'Substantiated Instances of Bullying or Retaliation: Interventions, Remedial Measures and Disciplinary Consequences',
    ]);
  });

  it('does not absorb the next section when a header lacks a period', () => {
    const sections = parsePolicySections(
      ['A. Purpose and Intent', 'B. Definitions.', 'Bullying means conduct.'].join('\n')
    );

    expect(sections[0].title).toBe('Purpose and Intent');
    expect(sections).toHaveLength(2);
  });

  it('does not absorb body prose beyond one continuation line', () => {
    const sections = parsePolicySections(
      [
        'A. Reporting Procedures',
        'and Timelines.',
        'Reports go to the principal.',
        '',
        'B. Definitions.',
        'Bullying means conduct.',
      ].join('\n')
    );

    expect(sections[0].title).toBe('Reporting Procedures and Timelines');
  });

  it('respaces a range dash broken across lines, leaving chapter hyphens alone', () => {
    const sections = parsePolicySections(
      [
        'C. Retaliation - RSA 193-F:4, II(b).',
        'Retaliation is prohibited.',
        '',
        'D. Procedures for Reporting - RSA 193-F:4, II(f)-',
        '(h). At the start of each year.',
      ].join('\n')
    );

    expect(sections[0].statute).toBe('RSA 193-F:4, II(b)');
    expect(sections[1].statute).toBe('RSA 193-F:4, II(f) - (h)');
  });
});
