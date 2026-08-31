import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logRequest, logResponse } from '@/lib/logger';
import { createErrorResponse, notFoundError, successResponse, validationError } from '@/lib/errors';
import {
  formatValidationErrors,
  updateIncidentSchema,
  validateRequest,
} from '@/lib/validation';

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
    const { id } = await params;

    const incident = await prisma.incident.findUnique({
      where: { id },
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
        },
        complianceActions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!incident) {
      return notFoundError('Incident');
    }

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
    const { id } = await params;
    // updateIncidentSchema existed but was imported nowhere, so PATCH accepted
    // any status string -- `status: "banana"` persisted and stranded the
    // incident off every list view. (SEC-13, FLOW-15)
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

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(title && { title }),
        ...(description && { description }),
        ...(incidentType && { incidentType }),
        ...(severity && { severity }),
        // schema.prisma defines closedAt for exactly this transition, but no
        // code path ever wrote it, so closure timestamps were lost. (FLOW-15)
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
