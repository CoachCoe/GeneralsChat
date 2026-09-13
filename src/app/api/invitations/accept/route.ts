import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createErrorResponse, notFoundError, validationError } from '@/lib/errors';
import { formatValidationErrors, validateRequest } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';
import { hashInvitationToken } from '@/lib/invitation';
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';

/**
 * The body carries a name and a password and nothing else.
 *
 * Not an email -- that comes from the invitation row -- and not a role, which
 * is `reporter` in code below. The standing rule here is that identity comes
 * from the server and never from the request, and this is the one endpoint
 * where a request creates an identity, so it is the one that most needs it.
 */
const acceptSchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1, 'Name is required').max(120),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
});

/**
 * Claim an invitation: create the account, and share the incident that
 * prompted it.
 *
 * Single use, enforced by a conditional update inside the transaction rather
 * than by the read above it. Two tabs submitting together both pass the read;
 * only the one whose `updateMany` matches an unaccepted row proceeds, and the
 * other gets the same 404 an expired link gets.
 *
 * Unauthenticated by necessity -- the caller has no account yet, which is the
 * point -- so it is rate limited in `middleware.ts` beside credentials sign-in,
 * for the same reason: it hashes a password, and bcrypt at cost 12 is a
 * blocking quarter-second.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = validateRequest(acceptSchema, await request.json());
    if (!parsed.success) {
      return validationError('Invalid invitation', formatValidationErrors(parsed.errors));
    }
    const { token, name, password } = parsed.data;

    const tokenHash = hashInvitationToken(token);
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const accepted = await prisma.$transaction(async tx => {
      const invitation = await tx.invitation.findFirst({
        where: { tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true, email: true, incidentId: true, invitedById: true },
      });
      if (!invitation) return null;

      // The claim. `count` is 0 if another request took it between the read
      // and here, which is the only way two accounts could come from one link.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) return null;

      /*
       * An administrator may have created this address in the meantime. Then
       * there is nothing to register: the share still lands, and they sign in
       * with the password they were already given rather than one set here.
       */
      const existing = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true, deactivatedAt: true },
      });
      if (existing?.deactivatedAt) return null;

      const user =
        existing ??
        (await tx.user.create({
          data: { email: invitation.email, name, role: 'reporter', passwordHash },
          select: { id: true, deactivatedAt: true },
        }));

      if (invitation.incidentId) {
        await tx.incidentShare.upsert({
          where: {
            incidentId_userId: { incidentId: invitation.incidentId, userId: user.id },
          },
          create: {
            incidentId: invitation.incidentId,
            userId: user.id,
            sharedById: invitation.invitedById,
          },
          update: {},
        });
      }

      return { invitationId: invitation.id, userId: user.id, email: invitation.email, existing: Boolean(existing) };
    });

    // Expired, revoked, already claimed, never issued, or the address has since
    // been revoked: one answer, so the link's state cannot be probed.
    if (!accepted) return notFoundError('Invitation');

    await recordAudit({
      userId: accepted.userId,
      action: 'created',
      entity: 'user',
      entityId: accepted.userId,
      details: { via: 'invitation', invitationId: accepted.invitationId, email: accepted.email },
    });

    return NextResponse.json({ email: accepted.email, alreadyRegistered: accepted.existing });
  } catch (error) {
    return createErrorResponse(error, 'Failed to accept invitation', {
      endpoint: '/api/invitations/accept',
      method: 'POST',
    });
  }
}
