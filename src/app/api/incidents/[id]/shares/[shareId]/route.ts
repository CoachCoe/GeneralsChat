import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { incidentScope, requireUser } from '@/lib/session';
import { createErrorResponse, notFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string; shareId: string }> };

/**
 * Stop sharing.
 *
 * Scoped through `incidentScope` like granting: a recipient can neither widen
 * the circle nor narrow it. Deleting the row is right -- unlike a user account,
 * a share carries no history worth keeping, and the audit log records that it
 * existed and that it ended.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { id, shareId } = await params;

    // Matched on both ids, so a share id from another incident cannot be
    // deleted by someone who happens to own this one.
    const share = await prisma.incidentShare.findFirst({
      where: { id: shareId, incidentId: id, incident: incidentScope(guard.user) },
      select: { id: true, user: { select: { email: true } } },
    });
    if (!share) return notFoundError('Share');

    await prisma.incidentShare.delete({ where: { id: share.id } });

    await recordAudit({
      userId: guard.user.id,
      action: 'unshared',
      entity: 'incident',
      entityId: id,
      incidentId: id,
      details: { with: share.user.email },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return createErrorResponse(error, 'Failed to stop sharing', {
      endpoint: '/api/incidents/[id]/shares/[shareId]',
      method: 'DELETE',
    });
  }
}
