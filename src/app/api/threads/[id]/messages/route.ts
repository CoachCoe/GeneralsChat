import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { createErrorResponse, notFoundError, validationError } from '@/lib/errors';
import { formatValidationErrors, validateRequest } from '@/lib/validation';

type Params = { params: Promise<{ id: string }> };

const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });

/**
 * Send a message.
 *
 * Membership is the whole authorisation: a participant may write, anyone else
 * gets the 404 a non-existent thread gets.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { id } = await params;

    const participant = await prisma.threadParticipant.findUnique({
      where: { threadId_userId: { threadId: id, userId: guard.user.id } },
      select: { threadId: true },
    });
    if (!participant) return notFoundError('Thread');

    const parsed = validateRequest(messageSchema, await request.json());
    if (!parsed.success) {
      return validationError('Invalid message', formatValidationErrors(parsed.errors));
    }

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { threadId: id, senderId: guard.user.id, body: parsed.data.body },
        select: {
          id: true,
          body: true,
          createdAt: true,
          sender: { select: { id: true, name: true } },
        },
      }),
      // Bumped explicitly: `@updatedAt` fires on a write to the thread row, and
      // nothing here writes one. Without this the thread list orders by when a
      // thread was created and a live conversation sinks to the bottom.
      prisma.messageThread.update({ where: { id }, data: { updatedAt: new Date() } }),
      prisma.threadParticipant.update({
        where: { threadId_userId: { threadId: id, userId: guard.user.id } },
        data: { lastReadAt: new Date() },
      }),
    ]);

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return createErrorResponse(error, 'Failed to send message', {
      endpoint: '/api/threads/[id]/messages',
      method: 'POST',
    });
  }
}
