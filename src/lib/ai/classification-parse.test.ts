import { describe, it, expect } from 'vitest';
import { parseClassification } from './claude-service';

/**
 * The parse boundary of classification.
 *
 * What these pin is that a response the model returned unparseably *throws*.
 * It used to be caught and replaced with a fabricated classification --
 * `other` / `medium`, plus two invented 24-hour obligations -- which the chat
 * route wrote to the incident permanently, with no endpoint to correct it. A
 * malformed response and a genuine "we could not tell" produced the same
 * record, on the incident where the system knew least.
 *
 * FLOW-35 removed the equivalent default from `IncidentClassifier`; this half
 * of it was left one layer down, where zod's own failures land. (B1)
 */
describe('parseClassification', () => {
  const valid = {
    type: 'bullying',
    severity: 'high',
    reasoning: 'Repeated targeting of one student.',
    requiredActions: [{ description: 'Notify the parents', dueInHours: 24 }],
    timeline: ['Immediate: separate the students'],
    stakeholders: ['Principal'],
  };

  it('parses a clean response', () => {
    const parsed = parseClassification(JSON.stringify(valid));
    expect(parsed.type).toBe('bullying');
    expect(parsed.severity).toBe('high');
    expect(parsed.requiredActions).toEqual([
      { description: 'Notify the parents', dueInHours: 24 },
    ]);
  });

  it('parses through a markdown fence and a prose preamble', () => {
    const raw = `Here is the classification:\n\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``;
    expect(parseClassification(raw).type).toBe('bullying');
  });

  it('throws when the response contains no JSON object', () => {
    expect(() => parseClassification('I am unable to classify this incident.')).toThrow();
  });

  it('throws on malformed JSON rather than returning a default', () => {
    expect(() => parseClassification('{"type": "bullying", "severity":}')).toThrow();
  });

  it('throws on an incident type outside the taxonomy', () => {
    expect(() =>
      parseClassification(JSON.stringify({ ...valid, type: 'vandalism_of_lockers' }))
    ).toThrow();
  });

  it('throws on a missing requiredActions array', () => {
    const { requiredActions: _omitted, ...withoutActions } = valid;
    expect(() => parseClassification(JSON.stringify(withoutActions))).toThrow();
  });

  it('throws on a non-positive or absurd deadline rather than accepting it', () => {
    expect(() =>
      parseClassification(
        JSON.stringify({ ...valid, requiredActions: [{ description: 'x', dueInHours: 0 }] })
      )
    ).toThrow();
    expect(() =>
      parseClassification(
        JSON.stringify({
          ...valid,
          requiredActions: [{ description: 'x', dueInHours: 24 * 365 + 1 }],
        })
      )
    ).toThrow();
  });

  it('never yields the old fabricated default for any unparseable input', () => {
    // The specific record the removed default produced: `other` / `medium`
    // with two 24-hour obligations. If a default is ever reintroduced, this is
    // the shape it will take, so assert no input can produce it.
    for (const raw of [
      '',
      'not json',
      '{}',
      '{"type":"other"}',
      '```json\n{"broken":\n```',
    ]) {
      let result: unknown;
      try {
        result = parseClassification(raw);
      } catch {
        continue;
      }
      expect.unreachable(`parseClassification returned ${JSON.stringify(result)} for ${raw}`);
    }
  });
});
