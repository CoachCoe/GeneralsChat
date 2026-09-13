import { describe, expect, it } from 'vitest';
import { parseCompletionClaims } from './completion-claim';

describe('parseCompletionClaims', () => {
  it('reads a single claim and removes the marker from the prose', () => {
    const { steps, content } = parseCompletionClaims(
      'Good — that covers the notification.\n\n[[DONE: 1]]',
      3
    );
    expect(steps).toEqual([1]);
    expect(content).toBe('Good — that covers the notification.');
    expect(content).not.toContain('DONE');
  });

  it('reads several claims in one marker and several markers in one reply', () => {
    expect(parseCompletionClaims('text [[DONE: 1, 3]]', 3).steps).toEqual([1, 3]);
    expect(parseCompletionClaims('a [[DONE: 2]] b [[DONE: 1]]', 3).steps).toEqual([1, 2]);
  });

  it('drops a step number the plan never offered rather than clamping it', () => {
    // Clamping would retarget the claim at a different obligation.
    expect(parseCompletionClaims('x [[DONE: 9]]', 3).steps).toEqual([]);
    expect(parseCompletionClaims('x [[DONE: 0]]', 3).steps).toEqual([]);
    expect(parseCompletionClaims('x [[DONE: 2]]', 0).steps).toEqual([]);
  });

  it('survives the markdown a model wraps a marker in', () => {
    expect(parseCompletionClaims('done.\n\n`[[DONE: 2]]`', 2).steps).toEqual([2]);
    expect(parseCompletionClaims('done.\n\n> **[[done: 2]]**', 2).steps).toEqual([2]);
  });

  it('leaves the answer intact when there is no marker', () => {
    const raw = 'You must notify the superintendent within 24 hours.';
    const { steps, content } = parseCompletionClaims(raw, 4);
    expect(steps).toEqual([]);
    expect(content).toBe(raw);
  });

  it('does not weld words together where a mid-sentence marker was removed', () => {
    const { content } = parseCompletionClaims('the call[[DONE: 1]]is logged', 1);
    expect(content).toBe('the call is logged');
  });

  it('deduplicates a step claimed twice', () => {
    expect(parseCompletionClaims('[[DONE: 1]] and [[DONE: 1]]', 2).steps).toEqual([1]);
  });

  it('ignores an unreadable marker without eating the answer', () => {
    const { steps, content } = parseCompletionClaims('Answer text. [[DONE: soon]]', 3);
    expect(steps).toEqual([]);
    expect(content).toContain('Answer text.');
  });
});
