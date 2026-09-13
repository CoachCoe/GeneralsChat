import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { incidentReadScope, requireUser } from '@/lib/session';
import { createErrorResponse } from '@/lib/errors';
import { ATTENTION_WINDOW_HOURS } from '@/lib/deadline';
import { buildNotifications } from '@/lib/notifications';

/** Bounded per source, so a busy account cannot make this a table scan. */
const PER_SOURCE_LIMIT = 20;

/**
 * What has changed, and what is about to be late.
 *
 * Read from the rows that already say it -- see `src/lib/notifications.ts` for
 * why there is no notification table. Each source is separately bounded and
 * hits an index: obligations by `dueDate`, shares by `[userId, seenAt]`,
 * threads by participation.
 */
export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const now = new Date();
    const horizon = new Date(now.getTime() + ATTENTION_WINDOW_HOURS * 60 * 60 * 1000);

    const [actions, shares, memberships] = await Promise.all([
      prisma.complianceAction.findMany({
        where: {
          status: { not: 'completed' },
          dueDate: { not: null, lte: horizon },
          incident: incidentReadScope(guard.user),
        },
        select: {
          id: true,
          description: true,
          actionType: true,
          dueDate: true,
          deadlineSource: true,
          incident: { select: { id: true, title: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: PER_SOURCE_LIMIT,
      }),
      prisma.incidentShare.findMany({
        where: { userId: guard.user.id, seenAt: null },
        select: {
          id: true,
          createdAt: true,
          incident: { select: { id: true, title: true } },
          sharedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: PER_SOURCE_LIMIT,
      }),
      prisma.threadParticipant.findMany({
        where: { userId: guard.user.id },
        select: {
          lastReadAt: true,
          thread: {
            select: {
              id: true,
              title: true,
              updatedAt: true,
              participants: { select: { user: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { thread: { updatedAt: 'desc' } },
        take: PER_SOURCE_LIMIT,
      }),
    ]);

    const threads = (
      await Promise.all(
        memberships.map(async ({ thread, lastReadAt }) => {
          const unread = await prisma.message.count({
            where: {
              threadId: thread.id,
              senderId: { not: guard.user.id },
              ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
            },
          });
          if (unread === 0) return null;
          return {
            threadId: thread.id,
            name:
              thread.title ||
              thread.participants
                .filter(p => p.user.id !== guard.user.id)
                .map(p => p.user.name)
                .join(', '),
            unread,
            at: thread.updatedAt,
          };
        })
      )
    ).flatMap(thread => (thread ? [thread] : []));

    const items = buildNotifications(
      {
        deadlines: actions.map(action => ({
          id: action.id,
          incidentId: action.incident.id,
          incidentTitle: action.incident.title,
          description: action.description,
          actionType: action.actionType,
          dueDate: action.dueDate!,
          deadlineSource: action.deadlineSource,
        })),
        shares: shares.map(share => ({
          id: share.id,
          incidentId: share.incident.id,
          incidentTitle: share.incident.title,
          sharedByName: share.sharedBy.name,
          createdAt: share.createdAt,
        })),
        threads,
      },
      now
    );

    return NextResponse.json({
      items,
      // What the bell shows. Red is earned only by something actually late.
      overdue: items.filter(item => item.overdue).length,
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to read notifications', {
      endpoint: '/api/notifications',
      method: 'GET',
    });
  }
}
