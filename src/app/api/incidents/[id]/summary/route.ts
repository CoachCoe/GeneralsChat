import { NextRequest } from 'next/server';
import { logRequest, logResponse } from '@/lib/logger';
import { createErrorResponse, notFoundError, successResponse, validationError } from '@/lib/errors';
import { requireUser } from '@/lib/session';
import { generateIncidentSummary } from '@/lib/ai/incident-summary';
import { recordAudit } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';

type Params = { params: Promise<{ id: string }> };

/**
 * Generate a summary for an incident and record it against the file.
 *
 * A thin adapter over generateIncidentSummary; the chat endpoint is the other.
 * This route previously returned the summary without storing it, so a user
 * generated one, refreshed, and lost it after paying for the call. (SPEC-35)
 */
export async function POST(request: NextRequest, { params }: Params) {
  const startTime = Date.now();

  try {
    logRequest('POST', '/api/incidents/[id]/summary');
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const limited = enforceRateLimit(`summary:${guard.user.id}`, RATE_LIMITS.CHAT);
    if (limited) return limited;

    const { id } = await params;
    const result = await generateIncidentSummary(id, guard.user);

    if (!result.ok) {
      const response =
        result.reason === 'not-found'
          ? notFoundError('Incident')
          : validationError('Nothing to summarise', {
              conversations: ['This incident has no conversation to summarise yet.'],
            });
      logResponse('POST', '/api/incidents/[id]/summary', response.status, Date.now() - startTime);
      return response;
    }

    await recordAudit({
      userId: guard.user.id,
      action: 'created',
      entity: 'summary',
      entityId: result.messageId,
      details: { incidentId: id },
    });

    logResponse('POST', '/api/incidents/[id]/summary', 200, Date.now() - startTime);
    return successResponse({ summary: result.summary, usage: result.usage });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorResponse = createErrorResponse(error, 'Failed to generate summary', {
      endpoint: '/api/incidents/[id]/summary',
      method: 'POST',
      duration,
    });
    logResponse('POST', '/api/incidents/[id]/summary', errorResponse.status, duration);
    return errorResponse;
  }
}
