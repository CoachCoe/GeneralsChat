import { describe, expect, it } from 'vitest';
import {
  ATTENTION_WINDOW_HOURS,
  deadlineColor,
  describeDeadline,
  dueDateFromHours,
  isPolicyBacked,
} from './deadline';

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
  // unit, so none of them crossed a carry.
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

describe('dueDateFromHours', () => {
  // The one expression every countdown, every "N overdue" count and every red
  // chip is derived from. It was inline in two places with nothing reading its
  // output, so a unit error of 60x passed the whole suite.
  const now = new Date('2026-09-08T09:00:00Z');

  it('adds whole hours', () => {
    expect(dueDateFromHours(24, now).toISOString()).toBe('2026-09-09T09:00:00.000Z');
    expect(dueDateFromHours(1, now).toISOString()).toBe('2026-09-08T10:00:00.000Z');
  });

  it('adds hours, not minutes -- a 24-hour report is due tomorrow, not in 24 minutes', () => {
    const due = dueDateFromHours(24, now);
    expect(due.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(due.getTime() - now.getTime()).not.toBe(24 * 60 * 1000);
  });

  it('adds hours, not days', () => {
    const due = dueDateFromHours(240, now);
    expect(due.toISOString()).toBe('2026-09-18T09:00:00.000Z');
    expect(due.getTime() - now.getTime()).toBe(10 * 24 * 60 * 60 * 1000);
  });

  it('handles a fractional hour', () => {
    expect(dueDateFromHours(0.5, now).toISOString()).toBe('2026-09-08T09:30:00.000Z');
  });

  it('composes with describeDeadline so a 24-hour deadline reads as demanding attention today', () => {
    const due = dueDateFromHours(24, now);
    // 24h is exactly the attention window, so it is included, not "pending".
    // The label coarsens to days at exactly 24h, which is the intended
    // far-term rule -- minute precision there is noise.
    expect(describeDeadline(due, 'pending', null, now).state).toBe('attention');
    expect(describeDeadline(due, 'pending', null, now).label).toBe('in 1d');
    // One minute inside the window is where precision starts to matter.
    expect(describeDeadline(dueDateFromHours(23, now), 'pending', null, now).label).toBe('in 23h');
  });

  it('composes with describeDeadline so a 10-day deadline is not urgent', () => {
    const due = dueDateFromHours(240, now);
    expect(describeDeadline(due, 'pending', null, now).state).toBe('pending');
    expect(describeDeadline(due, 'pending', null, now).label).toBe('in 10d');
  });
});

describe('isPolicyBacked', () => {
  // `=== 'policy'` and `!== 'model'` over a free-text column with a 'model'
  // default are complements only while exactly two values exist.
  it('is true only for the recorded policy value', () => {
    expect(isPolicyBacked('policy')).toBe(true);
  });

  it('is false for the model value, for null, and for undefined', () => {
    expect(isPolicyBacked('model')).toBe(false);
    expect(isPolicyBacked(null)).toBe(false);
    expect(isPolicyBacked(undefined)).toBe(false);
  });

  it('treats an unrecognised value as unverified, not as policy-backed', () => {
    // The safe direction: a value added to the column later must not earn a red
    // countdown by default.
    expect(isPolicyBacked('Policy')).toBe(false);
    expect(isPolicyBacked('statute')).toBe(false);
    expect(isPolicyBacked('')).toBe(false);
  });
});

describe('deadlineColor', () => {
  // A model-sourced deadline gets no red or amber countdown. The rule has to
  // live here rather than in DeadlineClock, or the obligation row is dimmed
  // while the "N overdue" pill above it, the incidents-list countdown and the
  // timeline dots paint the same row red from the same data.
  it('gives a policy-backed deadline the colour its state has earned', () => {
    expect(deadlineColor('overdue', 'policy')).toBe('text-overdue');
    expect(deadlineColor('attention', 'policy')).toBe('text-attention');
    expect(deadlineColor('pending', 'policy')).toBe('text-text-secondary');
  });

  it('withholds red from an unverified overdue deadline', () => {
    expect(deadlineColor('overdue', 'model')).toBe('text-text-tertiary');
    expect(deadlineColor('overdue', null)).toBe('text-text-tertiary');
  });

  it('withholds amber from an unverified deadline due today', () => {
    expect(deadlineColor('attention', 'model')).toBe('text-text-tertiary');
  });

  it('keeps green for a completed obligation whatever its provenance', () => {
    // "This was done" is a fact about the administrator's own action, not a
    // claim about a policy, so it is not withheld.
    expect(deadlineColor('met', 'model')).toBe('text-met');
    expect(deadlineColor('met', 'policy')).toBe('text-met');
    expect(deadlineColor('met', null)).toBe('text-met');
  });

  it('falls back to the state colour when the caller has no provenance to offer', () => {
    expect(deadlineColor('overdue')).toBe('text-overdue');
    expect(deadlineColor('attention')).toBe('text-attention');
  });

  it('never returns red or amber for any unverified, uncompleted state', () => {
    const shouty = ['text-overdue', 'text-attention'];
    for (const state of ['overdue', 'attention', 'pending'] as const) {
      for (const source of ['model', null, '', 'something-new'] as const) {
        expect(shouty).not.toContain(deadlineColor(state, source));
      }
    }
  });
});
