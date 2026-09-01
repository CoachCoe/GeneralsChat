/**
 * Deadline formatting.
 *
 * Deadlines are the product, so how a remaining interval reads is a product
 * decision rather than a formatting detail. Rules from design 1a/1c:
 *
 *  - the near term is precise ("in 3h 18m") because that is what an
 *    administrator acts on this morning;
 *  - the far term is coarse ("in 5d") because minute precision there is noise;
 *  - lateness is always stated as lateness ("14h late"), never as a negative
 *    interval, and never softened.
 */

export type DeadlineState = 'overdue' | 'attention' | 'met' | 'pending';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Hours within which something counts as demanding attention today. */
export const ATTENTION_WINDOW_HOURS = 24;

export interface DeadlineInfo {
  state: DeadlineState;
  /** "in 3h 18m", "14h late", "done 7:15 AM", "no deadline" */
  label: string;
  /** "today, 11:00 AM", "Fri 19 Sep" */
  absolute: string;
  msRemaining: number | null;
}

function formatAbsolute(due: Date, now: Date): string {
  const time = due.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const sameDay = due.toDateString() === now.toDateString();
  if (sameDay) return `today, ${time}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (due.toDateString() === tomorrow.toDateString()) return `tomorrow, ${time}`;

  return due.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatInterval(ms: number): string {
  const abs = Math.abs(ms);

  // Round to whole minutes once, then carry. Rounding each unit independently
  // let Math.round return 60: 59m30s rendered "in 60m" and 23h59m30s rendered
  // "in 23h 60m". On a countdown in tabular mono, the last thirty seconds of
  // every hour displayed a time that does not exist. (TEST-36)
  const totalMinutes = Math.round(abs / MINUTE);
  if (totalMinutes < 60) return `${Math.max(1, totalMinutes)}m`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    // Minute precision only inside the day, where it changes what you do next.
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }
  return `${Math.round(abs / DAY)}d`;
}

export function describeDeadline(
  dueDate: string | Date | null | undefined,
  status: string,
  completedAt?: string | Date | null,
  now: Date = new Date()
): DeadlineInfo {
  if (status === 'completed') {
    const done = completedAt ? new Date(completedAt) : null;
    return {
      state: 'met',
      label: done
        ? `done ${done.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        : 'done',
      absolute: done ? formatAbsolute(done, now) : '',
      msRemaining: null,
    };
  }

  if (!dueDate) {
    return { state: 'pending', label: 'no deadline', absolute: '', msRemaining: null };
  }

  const due = new Date(dueDate);
  const msRemaining = due.getTime() - now.getTime();
  const absolute = formatAbsolute(due, now);

  if (msRemaining < 0) {
    return { state: 'overdue', label: `${formatInterval(msRemaining)} late`, absolute: `was ${absolute}`, msRemaining };
  }

  return {
    state: msRemaining <= ATTENTION_WINDOW_HOURS * HOUR ? 'attention' : 'pending',
    label: `in ${formatInterval(msRemaining)}`,
    absolute,
    msRemaining,
  };
}

/** Token colour class for a deadline state. */
export const DEADLINE_COLOR: Record<DeadlineState, string> = {
  overdue: 'text-overdue',
  attention: 'text-attention',
  met: 'text-met',
  pending: 'text-text-secondary',
};
