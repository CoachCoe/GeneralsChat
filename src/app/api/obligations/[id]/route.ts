import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { incidentScope, requireUser } from '@/lib/session';
import { createErrorResponse, notFoundError, validationError } from '@/lib/errors';
import { formatValidationErrors, validateRequest } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

const updateObligationSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']),
});

/**
 * PATCH /api/obligations/[id] — change an obligation's state.
 *
 * "Mark done" is the only mutation the UI offers. Obligations are created when
 * the incident is classified rather than proposed and accepted, so there is no
 * acceptance step to model.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const { id } = await params;

    const parsed = validateRequest(updateObligationSchema, await request.json());
    if (!parsed.success) {
      return validationError('Invalid obligation update', formatValidationErrors(parsed.errors));
    }
    const { status } = parsed.data;

    // Scope through the incident before writing, so one user cannot discharge
    // another's statutory obligation. (SEC-7)
    const existing = await prisma.complianceAction.findFirst({
      where: { id, incident: incidentScope(guard.user) },
      select: { id: true, incidentId: true, description: true },
    });
    if (!existing) return notFoundError('Obligation');

    const obligation = await prisma.complianceAction.update({
      where: { id },
      data: {
        status,
        // Discharging an obligation is a compliance event; when it happened
        // matters as much as that it happened.
        completedAt: status === 'completed' ? new Date() : null,
      },
    });

    await recordAudit({
      userId: guard.user.id,
      action: 'updated',
      entity: 'complianceAction',
      entityId: id,
      details: {
        incidentId: existing.incidentId,
        status,
        description: existing.description,
      },
    });

    return NextResponse.json(obligation);
  } catch (error) {
    return createErrorResponse(error, 'Failed to update obligation', {
      endpoint: '/api/obligations/[id]',
      method: 'PATCH',
    });
  }
}
