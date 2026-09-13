import { describe, expect, it } from 'vitest';
import { buildNotifications, type DeadlineSource } from './notifications';

const now = new Date('2026-09-13T12:00:00Z');
const hours = (n: number) => new Date(now.getTime() + n * 60 * 60 * 1000);

function deadline(over: Partial<DeadlineSource> & { id: string }): DeadlineSource {
  return {
    incidentId: 'inc1',
    incidentTitle: 'Bullying: playground',
    description: 'Notify the superintendent',
    actionType: 'notification',
    dueDate: hours(1),
    deadlineSource: 'policy',
    ...over,
  };
}

const empty = { deadlines: [], shares: [], threads: [] };

describe('buildNotifications', () => {
  it('only calls a deadline overdue when a policy states it', () => {
    const items = buildNotifications(
      {
        ...empty,
        deadlines: [
          deadline({ id: 'backed', dueDate: hours(-2), deadlineSource: 'policy' }),
          deadline({ id: 'recalled', dueDate: hours(-2), deadlineSource: 'model' }),
        ],
      },
      now
    );
    expect(items.find(i => i.key === 'deadline:backed')?.overdue).toBe(true);
    // Late, still listed, but it cannot claim lateness as a fact: the number is
    // the model's recall, and colour here means what it means everywhere.
    expect(items.find(i => i.key === 'deadline:recalled')?.overdue).toBe(false);
  });

  it('puts what is already late first', () => {
    const items = buildNotifications(
      {
        deadlines: [deadline({ id: 'late', dueDate: hours(-1) })],
        shares: [
          {
            id: 's1',
            incidentId: 'inc2',
            incidentTitle: 'Other',
            sharedByName: 'Dana',
            createdAt: hours(-0.1),
          },
        ],
        threads: [{ threadId: 't1', name: 'Dana', unread: 2, at: hours(-0.2) }],
      },
      now
    );
    expect(items[0].key).toBe('deadline:late');
  });

  it('orders deadlines by how soon, not how recent', () => {
    const items = buildNotifications(
      {
        ...empty,
        deadlines: [
          deadline({ id: 'later', dueDate: hours(10) }),
          deadline({ id: 'sooner', dueDate: hours(2) }),
        ],
      },
      now
    );
    expect(items.map(i => i.key)).toEqual(['deadline:sooner', 'deadline:later']);
  });

  it('gives one item per source row, keyed stably', () => {
    const items = buildNotifications(
      { ...empty, deadlines: [deadline({ id: 'a' }), deadline({ id: 'a' })] },
      now
    );
    // Same row twice is the caller's bug, but the keys must still be equal so a
    // client keying on them cannot render one obligation as two.
    expect(new Set(items.map(i => i.key)).size).toBe(1);
  });

  it('names the obligation, falling back to its type when nobody wrote one', () => {
    const items = buildNotifications(
      { ...empty, deadlines: [deadline({ id: 'a', description: '  ' , actionType: 'immediate_response' })] },
      now
    );
    expect(items[0].title).toBe('immediate response');
  });

  it('counts messages rather than listing them', () => {
    const items = buildNotifications(
      { ...empty, threads: [{ threadId: 't1', name: 'Dana, Sam', unread: 3, at: hours(-1) }] },
      now
    );
    expect(items[0].title).toBe('3 new messages');
    expect(items[0].detail).toBe('Dana, Sam');
  });

  it('says one message in the singular', () => {
    const items = buildNotifications(
      { ...empty, threads: [{ threadId: 't1', name: 'Dana', unread: 1, at: hours(-1) }] },
      now
    );
    expect(items[0].title).toBe('1 new message');
  });

  it('raises what is late and what is close to it, and nothing further out', () => {
    // The home queue already lists every open obligation. A bell repeating it
    // would be furniture, so this is only what needs attention now.
    const keys = (dueIn: number) =>
      buildNotifications({ ...empty, deadlines: [deadline({ id: 'x', dueDate: hours(dueIn) })] }, now)
        .length;
    expect(keys(-5)).toBe(1);
    expect(keys(23)).toBe(1);
    expect(keys(25)).toBe(0);
  });

  it('is empty when nothing needs attention', () => {
    expect(buildNotifications(empty, now)).toEqual([]);
    expect(
      buildNotifications({ ...empty, deadlines: [deadline({ id: 'far', dueDate: hours(48) })] }, now)
    ).toEqual([]);
  });
});
