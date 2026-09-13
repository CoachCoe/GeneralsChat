import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { createErrorResponse } from '@/lib/errors';

/**
 * The people you can share with and message.
 *
 * Names, not addresses. The people picker needs to show who you are messaging;
 * sharing takes an address you type. Returning every colleague's email to every
 * signed-in user would hand out the whole staff directory to answer a question
 * nothing asked -- before this, a reporter knew nothing about other accounts.
 *
 * Revoked accounts are excluded: offering one leads to a share that can never
 * be opened.
 */
export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const users = await prisma.user.findMany({
      where: { deactivatedAt: null, id: { not: guard.user.id } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    return createErrorResponse(error, 'Failed to list people', {
      endpoint: '/api/users',
      method: 'GET',
    });
  }
}
