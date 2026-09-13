import { describe, expect, it } from 'vitest';
import { asksForALetter, renderLetterTemplates, selectLetterTemplates } from './letters';

describe('asksForALetter', () => {
  it('matches an explicit request to produce one', () => {
    for (const message of [
      'Can you draft a letter to the parents?',
      'Write the findings letter for me',
      'I need to prepare a decision letter',
      'Help me write the response to their appeal',
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

  it('does not match a question about whether a duty exists', () => {
    // Most of this domain's vocabulary is "write", "decision", "findings",
    // "response". Without this, asking whether something is required reads as
    // asking for it to be written.
    for (const message of [
      'Should I write this in the decision log?',
      'Do I need to write the incident up before the response deadline?',
      'When do I have to write the findings?',
    ]) {
      expect(asksForALetter(message), message).toBe(false);
    }
  });

  it('does not match someone saying they will write it themselves', () => {
    for (const message of [
      'I will write up my findings tomorrow.',
      "I'll draft the letter myself this afternoon.",
      'I am going to prepare the decision over the weekend.',
    ]) {
      expect(asksForALetter(message), message).toBe(false);
    }
  });

  it('misses "help me with a response", and that is the cheaper mistake', () => {
    // No produce verb, so it reads as asking for help with a decision rather
    // than for a document. Offering a template unasked puts drafting rules in
    // front of a turn that did not want them; missing one costs an example
    // while the model still answers.
    expect(asksForALetter('Help me with a response to their appeal')).toBe(false);
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

describe('selectLetterTemplates', () => {
  const LIBRARY = [
    { title: 'Letter template: Appeal response upholding an unsubstantiated finding', content: 'a' },
    { title: 'Letter template: Investigation findings, bullying not substantiated', content: 'b' },
    { title: 'Letter template: Investigation findings, bullying substantiated', content: 'c' },
    { title: 'Letter template: School board decision on a bullying appeal', content: 'd' },
    { title: "Letter template: Superintendent's decision on a bullying appeal", content: 'e' },
  ];
  const titles = (ts: { title: string }[]) => ts.map(t => t.title);

  it('returns the template the request actually names', () => {
    // Alphabetically this one is fourth of five and was never reachable.
    const picked = selectLetterTemplates(
      LIBRARY,
      'Draft the school board decision on this appeal',
      3
    );
    expect(titles(picked)[0]).toContain('School board decision');
  });

  it('ranks both matching templates above the ones the request did not name', () => {
    const picked = titles(selectLetterTemplates(LIBRARY, 'Write the investigation findings letter', 2));
    expect(picked.every(t => t.includes('Investigation findings'))).toBe(true);
  });

  it('returns the same templates for the same request', () => {
    const request = 'Draft a decision letter';
    expect(titles(selectLetterTemplates(LIBRARY, request, 3))).toEqual(
      titles(selectLetterTemplates([...LIBRARY].reverse(), request, 3))
    );
  });

  it('ignores words that appear in every title, which separate nothing', () => {
    // "letter", "template" and "bullying" would otherwise score every row
    // equally and leave the order alphabetical again.
    const picked = titles(selectLetterTemplates(LIBRARY, 'bullying letter template', 5));
    expect(picked).toEqual(titles([...LIBRARY].sort((a, b) => a.title.localeCompare(b.title))));
  });

  it('still returns something when the request names nothing', () => {
    expect(selectLetterTemplates(LIBRARY, 'help', 2)).toHaveLength(2);
    expect(selectLetterTemplates([], 'anything', 3)).toEqual([]);
  });
});
