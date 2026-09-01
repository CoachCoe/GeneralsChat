import { describe, expect, it } from 'vitest';
import {
  cleanText,
  countWords,
  extractKeywords,
  getFileExtension,
  splitIntoChunks,
} from './documentProcessor';

/**
 * Chunking decides what the model is shown of a policy. A chunk that severs a
 * requirement mid-sentence, or a document that loses content on the way in,
 * changes what an administrator is told.
 */
describe('splitIntoChunks', () => {
  const doc = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

  it('overlaps consecutive chunks by exactly the requested amount', () => {
    // Overlap is what stops a requirement spanning a boundary from being
    // severed; if it silently drifts, retrieval quietly gets worse.
    const chunks = splitIntoChunks(doc(2500), 1000, 200);
    for (let i = 0; i < chunks.length - 1; i++) {
      const a = chunks[i].split(' ');
      const b = chunks[i + 1].split(' ');
      const tail = a.slice(-200).join(' ');
      const head = b.slice(0, 200).join(' ');
      expect(head).toBe(tail);
    }
  });

  it('never exceeds the chunk size', () => {
    for (const c of splitIntoChunks(doc(2500), 1000, 200)) {
      expect(c.split(' ').length).toBeLessThanOrEqual(1000);
    }
  });

  it('loses no content', () => {
    const words = new Set(doc(2500).split(' '));
    const seen = new Set(splitIntoChunks(doc(2500), 1000, 200).flatMap(c => c.split(' ')));
    expect(seen.size).toBe(words.size);
  });

  it('returns a single chunk for a document shorter than the chunk size', () => {
    expect(splitIntoChunks(doc(50), 1000, 200)).toHaveLength(1);
  });

  it('returns nothing for empty input rather than one empty chunk', () => {
    expect(splitIntoChunks('', 1000, 200)).toEqual([]);
    expect(splitIntoChunks('   \n  ', 1000, 200)).toEqual([]);
  });

  it('does not split on newlines the way the old regex chunker did', () => {
    // The replaced implementation matched /.{1,500}/g, which is per-line and
    // dropped the newlines, turning a line-broken policy into fragments.
    const lines = 'line one\nline two\nline three';
    expect(splitIntoChunks(lines, 1000, 200)).toHaveLength(1);
  });
});

describe('cleanText', () => {
  it('keeps paragraph breaks', () => {
    // The previous implementation collapsed every newline on its first line,
    // so policy documents arrived as one undifferentiated run of text.
    expect(cleanText('Section 1.\n\nSection 2.')).toBe('Section 1.\n\nSection 2.');
  });

  it('collapses three or more blank lines to a single paragraph break', () => {
    expect(cleanText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('collapses runs of spaces and tabs without touching newlines', () => {
    expect(cleanText('a  \t  b\nc')).toBe('a b\nc');
  });

  it('normalises Windows line endings', () => {
    expect(cleanText('a\r\n\r\nb')).toBe('a\n\nb');
  });

  it('strips form feeds and page breaks', () => {
    expect(cleanText('a\f\vb')).toBe('ab');
  });

  it('trims surrounding whitespace', () => {
    expect(cleanText('\n\n  policy text  \n\n')).toBe('policy text');
  });
});

describe('countWords', () => {
  it('reports zero for empty input', () => {
    // The naive split reported 1, which made a failed extraction look like a
    // successful one.
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
  });

  it('counts words across any whitespace', () => {
    expect(countWords('one two\nthree\tfour')).toBe(4);
  });
});

describe('getFileExtension', () => {
  it('lowercases the extension', () => {
    expect(getFileExtension('/docs/Policy.PDF')).toBe('.pdf');
  });

  it('returns empty for a name with no extension', () => {
    expect(getFileExtension('/docs/README')).toBe('');
  });

  it('ignores a dot that belongs to a directory rather than the file', () => {
    // lastIndexOf alone returned the whole path here.
    expect(getFileExtension('/etc/my.dir/README')).toBe('');
  });

  it('takes only the final extension', () => {
    expect(getFileExtension('/docs/report.pdf.txt')).toBe('.txt');
  });
});

describe('extractKeywords', () => {
  it('ignores short words and punctuation', () => {
    const kw = extractKeywords('The bullying policy, and the reporting rules!');
    expect(kw).toContain('bullying');
    expect(kw).not.toContain('the');
    expect(kw.some(k => k.includes(','))).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(extractKeywords('Bullying BULLYING bullying')).toContain('bullying');
  });
});
