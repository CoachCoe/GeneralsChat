import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { createErrorResponse } from '@/lib/errors';

/**
 * The people you can share with and message.
 *
 * Signed-in users only, and only their name and address -- the same two things
 * that appear on any incident they file. A colleague directory is the minimum
 * for sharing and messaging to be usable at all; without it the only way to
 * reach someone is to already know the exact spelling of their address.
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
      select: { id: true, name: true, email: true },
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
