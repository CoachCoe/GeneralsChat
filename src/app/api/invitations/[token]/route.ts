import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashInvitationToken } from '@/lib/invitation';
import { createErrorResponse, notFoundError } from '@/lib/errors';

type Params = { params: Promise<{ token: string }> };

/**
 * What the accept page may know before an account exists.
 *
 * The address, and nothing else. Not the incident's title, not who invited
 * them, not that an incident is involved at all: the only thing identifying the
 * caller is a token out of a URL, and a link that leaked would otherwise
 * disclose that a named child's incident exists.
 *
 * Expired, revoked, already accepted and never issued are one answer -- 404 --
 * so the link's state cannot be probed either.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { token } = await params;

    const invitation = await prisma.invitation.findFirst({
      where: {
        tokenHash: hashInvitationToken(token),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { email: true },
    });

    if (!invitation) return notFoundError('Invitation');

    return NextResponse.json({ email: invitation.email });
  } catch (error) {
    return createErrorResponse(error, 'Failed to read invitation', {
      endpoint: '/api/invitations/[token]',
      method: 'GET',
    });
  }
}
