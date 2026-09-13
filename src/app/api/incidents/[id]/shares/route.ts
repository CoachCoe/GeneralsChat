import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { incidentReadScope, incidentScope, requireUser } from '@/lib/session';
import { createErrorResponse, notFoundError, validationError } from '@/lib/errors';
import { formatValidationErrors, validateRequest } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationLink,
} from '@/lib/invitation';

type Params = { params: Promise<{ id: string }> };

const shareSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
});

/**
 * Who an incident is shared with, and who has been invited but has no account
 * yet.
 *
 * Readable by anyone who can read the incident, including a recipient: being
 * shown a record about a child and not being told who else can see it is worse
 * than the disclosure of a colleague's name.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { id } = await params;

    const incident = await prisma.incident.findFirst({
      where: { id, ...incidentReadScope(guard.user) },
      select: { id: true, reporterId: true },
    });
    if (!incident) return notFoundError('Incident');

    const [shares, invitations] = await Promise.all([
      prisma.incidentShare.findMany({
        where: { incidentId: id },
        select: {
          id: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invitation.findMany({
        where: { incidentId: id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, expiresAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return NextResponse.json({
      shares,
      invitations,
      // Only the reporter and staff may widen the circle, so the client knows
      // whether to offer the control at all rather than rendering one that 404s.
      canShare: incident.reporterId === guard.user.id || Object.keys(incidentScope(guard.user)).length === 0,
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to list shares', {
      endpoint: '/api/incidents/[id]/shares',
      method: 'GET',
    });
  }
}

/**
 * Share with an address.
 *
 * Two outcomes, and the caller is told which: an existing account gets a share
 * row and can open the incident immediately; an address with no account gets an
 * invitation, and the response carries the link once for the sharer to pass on.
 *
 * Scoped with `incidentScope`, not the read scope: a recipient cannot share
 * onward, so the circle stays the one the reporter chose.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { id } = await params;

    const incident = await prisma.incident.findFirst({
      where: { id, ...incidentScope(guard.user) },
      select: { id: true, title: true },
    });
    if (!incident) return notFoundError('Incident');

    const parsed = validateRequest(shareSchema, await request.json());
    if (!parsed.success) {
      return validationError('Invalid share', formatValidationErrors(parsed.errors));
    }
    const { email } = parsed.data;

    if (email === guard.user.email) {
      return validationError('You already have this incident', { email: ['That is you'] });
    }

    const recipient = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, deactivatedAt: true },
    });

    if (recipient?.deactivatedAt) {
      // Not an invitation: the address has an account, it has just been ended.
      return validationError('That account has been revoked', {
        email: ['Ask an administrator to restore it'],
      });
    }

    if (recipient) {
      const share = await prisma.incidentShare.upsert({
        where: { incidentId_userId: { incidentId: id, userId: recipient.id } },
        create: { incidentId: id, userId: recipient.id, sharedById: guard.user.id },
        update: {},
        select: {
          id: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });

      await recordAudit({
        userId: guard.user.id,
        action: 'shared',
        entity: 'incident',
        entityId: id,
        incidentId: id,
        details: { with: email },
      });

      return NextResponse.json({ share }, { status: 201 });
    }

    const token = generateInvitationToken();
    const invitation = await prisma.invitation.create({
      data: {
        email,
        tokenHash: hashInvitationToken(token),
        invitedById: guard.user.id,
        incidentId: id,
        expiresAt: invitationExpiry(),
      },
      select: { id: true, email: true, expiresAt: true },
    });

    await recordAudit({
      userId: guard.user.id,
      action: 'shared',
      entity: 'invitation',
      entityId: invitation.id,
      incidentId: id,
      details: { email },
    });

    return NextResponse.json(
      {
        invitation,
        // The only time the token leaves this process. Not stored in the clear,
        // not recoverable, not audited -- the audit row names the address.
        link: invitationLink(new URL(request.url).origin, token),
      },
      { status: 201 }
    );
  } catch (error) {
    return createErrorResponse(error, 'Failed to share incident', {
      endpoint: '/api/incidents/[id]/shares',
      method: 'POST',
    });
  }
}
