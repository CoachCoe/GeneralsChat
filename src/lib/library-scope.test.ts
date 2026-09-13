import { describe, expect, it } from 'vitest';
import { describeLibraryScope } from './library-scope';

describe('describeLibraryScope', () => {
  it('says plainly when nothing is loaded, which is where a pilot starts', () => {
    const said = describeLibraryScope([]);
    expect(said).toContain('No district or school policy is loaded yet');
    // And why that is not the same as having no answer: the failure this whole
    // application exists to prevent is state law passed off as local procedure.
    expect(said).toContain('as though it were local procedure');
  });

  it('names the one subject a narrow library covers', () => {
    expect(describeLibraryScope(['bullying'])).toContain('loaded policy for Bullying.');
  });

  it('reads as a list once there is more than one', () => {
    expect(describeLibraryScope(['bullying', 'title_ix'])).toContain('Bullying and Title IX');
    expect(describeLibraryScope(['bullying', 'title_ix', 'mandatory_reporting'])).toContain(
      'Bullying, Title IX and Mandatory Reporting'
    );
  });

  it('keeps a label written as it is written', () => {
    // Lowercasing made "Title IX" read as "title ix". These are names of
    // policy areas, not common nouns.
    expect(describeLibraryScope(['student_records'])).toContain('Student Records (FERPA)');
  });

  it('tells them what happens when they ask about something else', () => {
    // The useful half. An administrator told "nothing local covers this" knows
    // to go and ask; one given confident guidance does not.
    expect(describeLibraryScope(['bullying'])).toContain('nothing local covers it');
  });

  it('falls back to the raw category when a label is missing', () => {
    expect(describeLibraryScope(['not_a_real_category'])).toContain('not_a_real_category');
  });
});
