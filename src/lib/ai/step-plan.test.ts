import { describe, expect, it } from 'vitest';
import { orderOpenSteps, renderStepPlan, type PlannableObligation } from './step-plan';

function obligation(over: Partial<PlannableObligation> & { id: string }): PlannableObligation {
  return {
    actionType: 'notification',
    description: 'Notify the superintendent',
    status: 'pending',
    dueDate: null,
    ...over,
  };
}

const at = (iso: string) => new Date(iso);

describe('orderOpenSteps', () => {
  it('puts the soonest deadline first', () => {
    const ordered = orderOpenSteps([
      obligation({ id: 'b', dueDate: at('2026-09-20T00:00:00Z') }),
      obligation({ id: 'a', dueDate: at('2026-09-14T00:00:00Z') }),
    ]);
    expect(ordered.map(o => o.id)).toEqual(['a', 'b']);
  });

  it('puts an obligation with no deadline after every one that has a deadline', () => {
    const ordered = orderOpenSteps([
      obligation({ id: 'none', dueDate: null }),
      obligation({ id: 'dated', dueDate: at('2027-01-01T00:00:00Z') }),
    ]);
    expect(ordered.map(o => o.id)).toEqual(['dated', 'none']);
  });

  it('breaks a shared deadline on id, so the order cannot change between turns', () => {
    const same = at('2026-09-14T00:00:00Z');
    const forward = orderOpenSteps([
      obligation({ id: 'zeta', dueDate: same }),
      obligation({ id: 'alpha', dueDate: same }),
    ]);
    const reversed = orderOpenSteps([
      obligation({ id: 'alpha', dueDate: same }),
      obligation({ id: 'zeta', dueDate: same }),
    ]);
    expect(forward.map(o => o.id)).toEqual(['alpha', 'zeta']);
    expect(reversed.map(o => o.id)).toEqual(forward.map(o => o.id));
  });

  it('drops completed obligations but keeps overdue ones, which are still owed', () => {
    const ordered = orderOpenSteps([
      obligation({ id: 'done', status: 'completed', dueDate: at('2026-01-01T00:00:00Z') }),
      obligation({ id: 'late', status: 'overdue', dueDate: at('2026-02-01T00:00:00Z') }),
      obligation({ id: 'started', status: 'in_progress', dueDate: at('2026-03-01T00:00:00Z') }),
    ]);
    expect(ordered.map(o => o.id)).toEqual(['late', 'started']);
  });
});

describe('renderStepPlan', () => {
  it('marks exactly one step as current, and it is the first', () => {
    const plan = renderStepPlan(
      orderOpenSteps([
        obligation({ id: 'b', description: 'File the report', dueDate: at('2026-09-20T00:00:00Z') }),
        obligation({ id: 'a', description: 'Call DCYF', dueDate: at('2026-09-14T00:00:00Z') }),
      ])
    );
    expect(plan.match(/\[CURRENT STEP\]/g)).toHaveLength(1);
    expect(plan).toMatch(/1\. \[CURRENT STEP\] Call DCYF/);
    expect(plan).toMatch(/2\. File the report/);
  });

  it('renders a deadline as an instant, not a date a timezone could move', () => {
    const plan = renderStepPlan([
      obligation({ id: 'a', dueDate: at('2026-09-14T15:30:00Z') }),
    ]);
    expect(plan).toContain('due 2026-09-14T15:30:00.000Z');
  });

  it('says a step has no deadline rather than inventing one', () => {
    const plan = renderStepPlan([obligation({ id: 'a', dueDate: null })]);
    expect(plan).toContain('no deadline recorded');
  });

  it('falls back to the action type when no description was written', () => {
    const plan = renderStepPlan([
      obligation({ id: 'a', description: null, actionType: 'immediate_response' }),
    ]);
    expect(plan).toContain('immediate response');
  });

  it('is empty when nothing is open, so a finished incident gets no plan', () => {
    expect(renderStepPlan([])).toBe('');
    expect(renderStepPlan(orderOpenSteps([obligation({ id: 'a', status: 'completed' })]))).toBe('');
  });
});
