import { describe, expect, it } from 'vitest';
import { parseTurnLabel } from './turn-label';

const QUESTION = 'Can you describe what actually happened between them?';
const GUIDANCE = 'Notify the superintendent within 24 hours under JICK §D.';

describe('parseTurnLabel', () => {
  it('reads a question turn and strips the marker', () => {
    const { kind, content } = parseTurnLabel(`[[TURN: question]]\n${QUESTION}`);
    expect(kind).toBe('question');
    expect(content).toBe(QUESTION);
  });

  it('reads a guidance turn and strips the marker', () => {
    const { kind, content } = parseTurnLabel(`[[TURN: guidance]]\n${GUIDANCE}`);
    expect(kind).toBe('guidance');
    expect(content).toBe(GUIDANCE);
  });

  it('tolerates the markdown a model wraps the marker in', () => {
    for (const raw of [
      '`[[TURN: question]]`\n',
      '**[[TURN: question]]**\n',
      '[[turn:question]]\n',
      '[[TURN:  Question  ]]\n\n\n',
      '   \n[[TURN: question]]\r\n',
    ]) {
      const { kind, content } = parseTurnLabel(raw + QUESTION);
      expect(kind, raw).toBe('question');
      expect(content, raw).toBe(QUESTION);
    }
  });

  /*
   * The asymmetry the module exists to hold. A guidance turn wrongly silenced
   * shows a statutory deadline with no citation and no coverage warning; a
   * question turn wrongly labelled shows a sources block under a question.
   * Only the first can hurt anyone, so every uncertain path lands on guidance.
   */
  it('treats a missing marker as guidance, leaving the text untouched', () => {
    const { kind, content } = parseTurnLabel(GUIDANCE);
    expect(kind).toBe('guidance');
    expect(content).toBe(GUIDANCE);
  });

  it('treats an unrecognised marker as guidance, but still strips it', () => {
    const { kind, content } = parseTurnLabel(`[[TURN: clarifying]]\n${QUESTION}`);
    expect(kind).toBe('guidance');
    // Stripped rather than rendered: a drifted label is our bug to notice, not
    // punctuation to show an administrator.
    expect(content).toBe(QUESTION);
  });

  it('does not read a marker that appears after the answer has begun', () => {
    const raw = `${GUIDANCE}\n[[TURN: question]]`;
    const { kind, content } = parseTurnLabel(raw);
    expect(kind).toBe('guidance');
    expect(content).toBe(raw);
  });

  it('reports empty content when the model returns nothing but a marker', () => {
    // The caller turns this into a failed turn rather than writing a blank
    // answer into the incident record. (FLOW-7)
    expect(parseTurnLabel('[[TURN: guidance]]').content).toBe('');
    expect(parseTurnLabel('[[TURN: question]]\n\n   ').content.trim()).toBe('');
  });

  it('never mistakes prose about the word turn for a marker', () => {
    const raw = 'Turn: the next step is to notify the superintendent.';
    expect(parseTurnLabel(raw)).toEqual({ kind: 'guidance', content: raw });
  });
});
