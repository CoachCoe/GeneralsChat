import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { createErrorResponse, validationError } from '@/lib/errors';
import { formatValidationErrors, validateRequest } from '@/lib/validation';

/**
 * Person-to-person messaging.
 *
 * `Conversation` is the assistant's transcript and always has been, so nothing
 * here is called a chat: threads and messages in the code, "Messages" in the
 * interface. A thread may name an incident for context, and membership of a
 * thread grants nothing over that incident -- reading it still requires a share.
 */
const createThreadSchema = z.object({
  participantIds: z.array(z.string().min(1)).min(1, 'Choose at least one person').max(20),
  title: z.string().trim().max(120).optional(),
  incidentId: z.string().min(1).optional(),
  body: z.string().trim().min(1, 'Write a message').max(4000),
});

export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const memberships = await prisma.threadParticipant.findMany({
      where: { userId: guard.user.id },
      select: {
        lastReadAt: true,
        thread: {
          select: {
            id: true,
            title: true,
            incidentId: true,
            updatedAt: true,
            participants: { select: { user: { select: { id: true, name: true } } } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { body: true, createdAt: true, sender: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { thread: { updatedAt: 'desc' } },
      // Bounded low on purpose. The unread count below is one indexed query per
      // thread -- exact, because "3 new messages" has to be true -- and a
      // cutoff that differs per participant cannot be folded into one groupBy.
      // Thirty recent conversations is more than this pilot will have and keeps
      // the round trips cheap.
      take: 30,
    });

    const threads = await Promise.all(
      memberships.map(async ({ thread, lastReadAt }) => ({
        id: thread.id,
        title: thread.title,
        incidentId: thread.incidentId,
        updatedAt: thread.updatedAt,
        participants: thread.participants.map(p => p.user),
        lastMessage: thread.messages[0] ?? null,
        // Counted rather than derived from the last message, so a thread with
        // several unread messages says how many.
        unread: await prisma.message.count({
          where: {
            threadId: thread.id,
            senderId: { not: guard.user.id },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        }),
      }))
    );

    return NextResponse.json({ threads });
  } catch (error) {
    return createErrorResponse(error, 'Failed to list threads', {
      endpoint: '/api/threads',
      method: 'GET',
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const parsed = validateRequest(createThreadSchema, await request.json());
    if (!parsed.success) {
      return validationError('Invalid thread', formatValidationErrors(parsed.errors));
    }
    const { participantIds, title, incidentId, body } = parsed.data;

    // Resolved against real, active accounts rather than trusted from the
    // request: an id that names nobody would otherwise create a thread whose
    // participant list is a lie.
    const others = await prisma.user.findMany({
      where: { id: { in: participantIds }, deactivatedAt: null, NOT: { id: guard.user.id } },
      select: { id: true },
    });
    if (others.length === 0) {
      return validationError('Choose someone to message', {
        participantIds: ['No one from that list can be messaged'],
      });
    }

    const thread = await prisma.messageThread.create({
      data: {
        title: title || null,
        incidentId: incidentId ?? null,
        createdById: guard.user.id,
        participants: {
          create: [
            // The author has read their own first message by definition.
            { userId: guard.user.id, lastReadAt: new Date() },
            ...others.map(o => ({ userId: o.id })),
          ],
        },
        messages: { create: [{ senderId: guard.user.id, body }] },
      },
      select: { id: true },
    });

    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    return createErrorResponse(error, 'Failed to start a thread', {
      endpoint: '/api/threads',
      method: 'POST',
    });
  }
}
