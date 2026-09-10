import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logRequest, logResponse } from '@/lib/logger';
import { createErrorResponse, notFoundError, successResponse, validationError } from '@/lib/errors';
import {
  formatValidationErrors,
  updateIncidentSchema,
  validateRequest,
} from '@/lib/validation';
import { incidentScope, requireUser } from '@/lib/session';
import { recordAudit } from '@/lib/audit';

/** Statuses that close an incident, and so stamp closedAt. */
const TERMINAL_STATUSES = new Set(['closed', 'completed']);

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const startTime = Date.now();

  try {
    logRequest('GET', '/api/incidents/[id]');
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { id } = await params;

    const incident = await prisma.incident.findFirst({
      where: { id, ...incidentScope(guard.user) },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        conversations: {
          orderBy: { timestamp: 'asc' },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
          // Projected, not raw. A whole row carries `filePath`, the on-disk
          // name, which is how attachments become reachable as static assets,
          // and `uploadedBy`, another user's id, which leaks to a co-reporter
          // on a shared incident. The client needs the id to build the API
          // URL, the filename to label it, and the size and type to describe
          // it.
          select: {
            id: true,
            filename: true,
            fileType: true,
            fileSize: true,
            createdAt: true,
          },
        },
        complianceActions: {
          orderBy: { createdAt: 'desc' },
          // Same join as GET /api/obligations: the level of authority that
          // imposes each obligation, which is the field ObligationRow's
          // AuthorityChip renders on.
          include: { policy: { select: { jurisdiction: true } } },
        },
      },
    });

    if (!incident) {
      return notFoundError('Incident');
    }

    await recordAudit({
      userId: guard.user.id,
      action: 'viewed',
      entity: 'incident',
      entityId: id,
    });

    const duration = Date.now() - startTime;
    logResponse('GET', '/api/incidents/[id]', 200, duration);

    return successResponse(incident);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorResponse = createErrorResponse(
      error,
      'Failed to fetch incident',
      {
        endpoint: '/api/incidents/[id]',
        method: 'GET',
        duration,
      }
    );

    logResponse('GET', '/api/incidents/[id]', errorResponse.status, duration);
    return errorResponse;
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const startTime = Date.now();

  try {
    logRequest('PATCH', '/api/incidents/[id]');
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { id } = await params;
    // updateIncidentSchema existed but was imported nowhere, so PATCH accepted
    // any status string -- `status: "banana"` persisted and stranded the
    // incident off every list view.
    const parsed = validateRequest(updateIncidentSchema, await request.json());
    if (!parsed.success) {
      const response = validationError(
        'Invalid incident update',
        formatValidationErrors(parsed.errors)
      );
      logResponse('PATCH', '/api/incidents/[id]', response.status, Date.now() - startTime);
      return response;
    }
    const { status, title, description, incidentType, severity } = parsed.data;

    // Scope check first: update({ where: { id } }) alone would let any
    // authenticated user rewrite any incident.
    const existing = await prisma.incident.findFirst({
      where: { id, ...incidentScope(guard.user) },
      select: { id: true },
    });
    if (!existing) {
      const response = notFoundError('Incident');
      logResponse('PATCH', '/api/incidents/[id]', response.status, Date.now() - startTime);
      return response;
    }

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(title && { title }),
        ...(description && { description }),
        ...(incidentType && { incidentType }),
        ...(severity && { severity }),
        // schema.prisma defines closedAt for exactly this transition, but no
        // code path ever wrote it, so closure timestamps were lost.
        ...(status && { closedAt: TERMINAL_STATUSES.has(status) ? new Date() : null }),
      },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await recordAudit({
      userId: guard.user.id,
      action: 'updated',
      entity: 'incident',
      entityId: id,
      details: { status, title: title !== undefined, description: description !== undefined },
    });

    const duration = Date.now() - startTime;
    logResponse('PATCH', '/api/incidents/[id]', 200, duration);

    return successResponse(incident);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorResponse = createErrorResponse(
      error,
      'Failed to update incident',
      {
        endpoint: '/api/incidents/[id]',
        method: 'PATCH',
        duration,
      }
    );

    logResponse('PATCH', '/api/incidents/[id]', errorResponse.status, duration);
    return errorResponse;
  }
}
