import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { createErrorResponse, notFoundError } from '@/lib/errors';

type Params = { params: Promise<{ id: string }> };

/**
 * One thread, and marking it read.
 *
 * Scoped by participation, and 404 rather than 403 for the same reason incident
 * ids are: a thread id must not be confirmed to someone outside it.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { id } = await params;

    const thread = await prisma.messageThread.findFirst({
      where: { id, participants: { some: { userId: guard.user.id } } },
      select: {
        id: true,
        title: true,
        incidentId: true,
        // Names, not addresses -- `GET /api/users` refuses to return emails and
        // says why, and any signed-in user can open a thread with twenty ids
        // taken from it. Projecting email here handed back the staff directory
        // the other route withholds.
        participants: { select: { user: { select: { id: true, name: true } } } },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 500,
          select: {
            id: true,
            body: true,
            createdAt: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!thread) return notFoundError('Thread');

    // Opening it is reading it -- the caller's own state, and the second reason
    // there is no notification table.
    await prisma.threadParticipant.update({
      where: { threadId_userId: { threadId: id, userId: guard.user.id } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({
      thread: {
        id: thread.id,
        title: thread.title,
        incidentId: thread.incidentId,
        participants: thread.participants.map(p => p.user),
        messages: thread.messages,
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to open thread', {
      endpoint: '/api/threads/[id]',
      method: 'GET',
    });
  }
}
