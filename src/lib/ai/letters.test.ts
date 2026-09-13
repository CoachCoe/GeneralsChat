import { describe, expect, it } from 'vitest';
import { asksForALetter, renderLetterTemplates } from './letters';

describe('asksForALetter', () => {
  it('matches an explicit request to produce one', () => {
    for (const message of [
      'Can you draft a letter to the parents?',
      'Write the findings letter for me',
      'I need to prepare a decision letter',
      'Help me with a response to their appeal',
      'Please compose the determination',
      'Can you put together a notice for the family?',
    ]) {
      expect(asksForALetter(message), message).toBe(true);
    }
  });

  it('does not match a question about a letter that already exists', () => {
    for (const message of [
      'The appeal letter says the investigation started late — is that right?',
      'What should the findings letter include?',
      'Do I have to send a letter?',
      'They never received the investigation report letter.',
      'When is the decision due?',
    ]) {
      expect(asksForALetter(message), message).toBe(false);
    }
  });

  it('does not reach across sentences for its two halves', () => {
    // "write" belongs to the first sentence and "letter" to the second; joining
    // them would pull templates into a turn that asked for neither.
    expect(
      asksForALetter('Should I write this up in PowerSchool? They sent a letter last week.')
    ).toBe(false);
  });
});

describe('renderLetterTemplates', () => {
  it('labels the block as structure, not authority', () => {
    const block = renderLetterTemplates([{ title: 'Findings letter', content: 'Dear [PARENT],' }]);
    expect(block).toContain('never authority to cite');
    expect(block).toContain('--- TEMPLATE: Findings letter ---');
    expect(block).toContain('Dear [PARENT],');
  });

  it('skips a template whose text never loaded, rather than offering an empty one', () => {
    const block = renderLetterTemplates([
      { title: 'Empty', content: '   ' },
      { title: 'Real', content: 'Dear [PARENT],' },
    ]);
    expect(block).not.toContain('Empty');
    expect(block).toContain('Real');
  });

  it('is empty when there is nothing to offer', () => {
    expect(renderLetterTemplates([])).toBe('');
    expect(renderLetterTemplates([{ title: 'Empty', content: null }])).toBe('');
  });
});
