import { ATTENTION_WINDOW_HOURS, isPolicyBacked } from '@/lib/deadline';

/**
 * What has changed, and what is about to be late.
 *
 * **Derived, never stored.** Every item here is already implied by a row that
 * exists: a deadline by `ComplianceAction`, a share you have not opened by
 * `IncidentShare.seenAt`, unread messages by `ThreadParticipant.lastReadAt`. A
 * notification table would need a scheduler for the deadlines and would drift
 * from the rows it describes the moment an obligation was completed or a
 * deadline moved -- the same failure the coverage rail already avoids by
 * recomputing rather than replaying.
 *
 * What that costs is per-item dismissal for deadlines, which is right: a
 * deadline is not news you dismiss, it is a state you resolve.
 *
 * In-app only. There is no mail transport in this application, so a deadline
 * that passes while nobody is signed in waits until somebody is. The interface
 * does not imply otherwise.
 */

export type NotificationKind = 'deadline' | 'share' | 'message';

export interface NotificationItem {
  /**
   * Stable across requests, and one per source row, so the same obligation
   * cannot appear twice and a client can key on it.
   */
  key: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  href: string;
  /** What orders the list: soonest deadline, most recent event. */
  at: string;
  /**
   * Only a deadline the district's policy actually states may claim lateness.
   * `deadlineColor` paints on this, and colour here means what it means
   * everywhere else in this application.
   */
  overdue: boolean;
}

export interface DeadlineSource {
  id: string;
  incidentId: string;
  incidentTitle: string;
  description: string | null;
  actionType: string;
  dueDate: Date;
  deadlineSource: string;
}

export interface ShareSource {
  id: string;
  incidentId: string;
  incidentTitle: string;
  sharedByName: string;
  createdAt: Date;
}

export interface ThreadSource {
  threadId: string;
  name: string;
  unread: number;
  at: Date;
}

/**
 * An obligation is worth raising once it is late, or close to it.
 *
 * Not everything open: the home queue already lists every obligation, and a
 * bell that repeated it would be furniture. This is what needs attention now.
 */
function isWorthRaising(dueDate: Date, now: Date): boolean {
  return dueDate.getTime() - now.getTime() <= ATTENTION_WINDOW_HOURS * 60 * 60 * 1000;
}

function label(action: { description: string | null; actionType: string }): string {
  return action.description?.trim() || action.actionType.replace(/_/g, ' ');
}

export function buildNotifications(
  sources: { deadlines: DeadlineSource[]; shares: ShareSource[]; threads: ThreadSource[] },
  now: Date
): NotificationItem[] {
  const items: NotificationItem[] = [];

  for (const deadline of sources.deadlines) {
    if (!isWorthRaising(deadline.dueDate, now)) continue;
    const late = deadline.dueDate < now;
    items.push({
      key: `deadline:${deadline.id}`,
      kind: 'deadline',
      title: label(deadline),
      detail: deadline.incidentTitle,
      href: `/incidents/${deadline.incidentId}`,
      at: deadline.dueDate.toISOString(),
      // Late *and* stated by a retrieved policy. An unverified deadline is the
      // model's recall, and a red "overdue" on one would be an assertion the
      // library cannot support.
      overdue: late && isPolicyBacked(deadline.deadlineSource),
    });
  }

  for (const share of sources.shares) {
    items.push({
      key: `share:${share.id}`,
      kind: 'share',
      title: `${share.sharedByName} shared an incident with you`,
      detail: share.incidentTitle,
      href: `/incidents/${share.incidentId}`,
      at: share.createdAt.toISOString(),
      overdue: false,
    });
  }

  for (const thread of sources.threads) {
    items.push({
      key: `thread:${thread.threadId}`,
      kind: 'message',
      title: `${thread.unread} new message${thread.unread === 1 ? '' : 's'}`,
      detail: thread.name,
      href: '/messages',
      at: thread.at.toISOString(),
      overdue: false,
    });
  }

  // Overdue first, then by time: what is already late outranks what is merely
  // recent, and within each the oldest deadline is the most urgent.
  return items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.kind === 'deadline' && b.kind === 'deadline') return a.at.localeCompare(b.at);
    if (a.kind === 'deadline') return -1;
    if (b.kind === 'deadline') return 1;
    return b.at.localeCompare(a.at);
  });
}
