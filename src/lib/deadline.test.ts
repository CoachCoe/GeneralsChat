import { describe, expect, it } from 'vitest';
import { describeDeadline, ATTENTION_WINDOW_HOURS } from './deadline';

/**
 * How a remaining interval reads is the product, not a formatting detail. A bug
 * here misstates a statutory deadline to an administrator, which is the worst
 * failure this system has.
 */
const NOW = new Date('2026-09-01T09:00:00Z');
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

describe('describeDeadline', () => {
  it('states lateness as lateness, never as a negative interval', () => {
    const r = describeDeadline(at(-14 * HOUR), 'pending', null, NOW);
    expect(r.state).toBe('overdue');
    expect(r.label).toBe('14h late');
    expect(r.label).not.toContain('-');
    expect(r.absolute).toMatch(/^was /);
  });

  it('is precise inside the day, because that changes what you do next', () => {
    expect(describeDeadline(at(3 * HOUR + 18 * 60_000), 'pending', null, NOW).label).toBe('in 3h 18m');
    expect(describeDeadline(at(7 * HOUR), 'pending', null, NOW).label).toBe('in 7h');
    expect(describeDeadline(at(45 * 60_000), 'pending', null, NOW).label).toBe('in 45m');
  });

  it('is coarse beyond the day, because minute precision there is noise', () => {
    expect(describeDeadline(at(5 * 24 * HOUR), 'pending', null, NOW).label).toBe('in 5d');
    expect(describeDeadline(at(10 * 24 * HOUR + 3 * HOUR), 'pending', null, NOW).label).toBe('in 10d');
  });

  it('treats the attention window boundary as attention, not pending', () => {
    const inside = describeDeadline(at(ATTENTION_WINDOW_HOURS * HOUR - 60_000), 'pending', null, NOW);
    const outside = describeDeadline(at(ATTENTION_WINDOW_HOURS * HOUR + 60_000), 'pending', null, NOW);
    expect(inside.state).toBe('attention');
    expect(outside.state).toBe('pending');
  });

  it('reports a completed obligation as met regardless of its due date', () => {
    // An obligation discharged late is still discharged; it must not show red.
    const r = describeDeadline(at(-3 * 24 * HOUR), 'completed', at(-2 * 24 * HOUR), NOW);
    expect(r.state).toBe('met');
    expect(r.label).toMatch(/^done /);
  });

  it('handles a completed obligation with no completion timestamp', () => {
    const r = describeDeadline(at(-HOUR), 'completed', null, NOW);
    expect(r.state).toBe('met');
    expect(r.label).toBe('done');
  });

  it('distinguishes no deadline from an imminent one', () => {
    const r = describeDeadline(null, 'pending', null, NOW);
    expect(r.state).toBe('pending');
    expect(r.label).toBe('no deadline');
    expect(r.msRemaining).toBeNull();
  });

  it('never rounds a sub-minute interval down to zero', () => {
    // "in 0m" would read as "no time left" when there is still time.
    const r = describeDeadline(at(20_000), 'pending', null, NOW);
    expect(r.label).toBe('in 1m');
  });

  it('accepts an ISO string as readily as a Date', () => {
    const fromString = describeDeadline(at(-14 * HOUR).toISOString(), 'pending', null, NOW);
    const fromDate = describeDeadline(at(-14 * HOUR), 'pending', null, NOW);
    expect(fromString.label).toBe(fromDate.label);
  });
});

describe('interval carry', () => {
  const MINUTE = 60_000;

  // Rounding each unit independently let Math.round return 60, so the last
  // thirty seconds of every hour rendered a time that does not exist -- on the
  // app's most prominent element, in tabular mono precisely so it reads
  // cleanly. Every existing case in this file sits comfortably inside its
  // unit, so none of them crossed a carry. (TEST-36)
  it('carries 60 minutes into an hour rather than rendering 60m', () => {
    expect(describeDeadline(at(59.5 * MINUTE), 'pending', null, NOW).label).toBe('in 1h');
    expect(describeDeadline(at(59 * MINUTE + 31_000), 'pending', null, NOW).label).toBe('in 1h');
  });

  it('carries 60 minutes into a day rather than rendering 23h 60m', () => {
    expect(
      describeDeadline(at(23 * HOUR + 59.5 * MINUTE), 'pending', null, NOW).label
    ).toBe('in 1d');
  });

  it('still reports the minute below the carry', () => {
    expect(describeDeadline(at(59 * MINUTE), 'pending', null, NOW).label).toBe('in 59m');
    expect(describeDeadline(at(23 * HOUR + 59 * MINUTE), 'pending', null, NOW).label).toBe(
      'in 23h 59m'
    );
  });

  it('never renders zero minutes for an interval that has not elapsed', () => {
    expect(describeDeadline(at(20_000), 'pending', null, NOW).label).toBe('in 1m');
  });
});
