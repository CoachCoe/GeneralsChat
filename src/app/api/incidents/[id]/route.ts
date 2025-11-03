import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logRequest, logResponse } from '@/lib/logger';
import { createErrorResponse, notFoundError, successResponse } from '@/lib/errors';

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
    const body = await request.json();
    const { status, title, description } = body;

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(title && { title }),
        ...(description && { description }),
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
