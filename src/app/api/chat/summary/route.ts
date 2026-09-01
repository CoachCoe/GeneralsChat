import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse, notFoundError, validationError } from '@/lib/errors';
import { requireUser } from '@/lib/session';
import { generateIncidentSummary } from '@/lib/ai/incident-summary';
import { recordAudit } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';

/**
 * POST /api/chat/summary — end-of-chat summary.
 *
 * Body: { incidentId: string }
 *
 * The other half of the pair with /api/incidents/[id]/summary. Both are thin
 * adapters over generateIncidentSummary; they were previously two
 * implementations of one feature that had drifted apart. (DEAD-12)
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const limited = enforceRateLimit(`summary:${guard.user.id}`, RATE_LIMITS.CHAT);
    if (limited) return limited;

    const { incidentId } = await request.json();
    if (!incidentId || typeof incidentId !== 'string') {
      return validationError('Incident ID is required', {
        incidentId: ['Expected a string'],
      });
    }

    const result = await generateIncidentSummary(incidentId, guard.user);

    if (!result.ok) {
      return result.reason === 'not-found'
        ? notFoundError('Incident')
        : validationError('Nothing to summarise', {
            conversations: ['This incident has no conversation to summarise yet.'],
          });
    }

    await recordAudit({
      userId: guard.user.id,
      action: 'created',
      entity: 'summary',
      entityId: result.messageId,
      details: { incidentId, via: 'chat' },
    });

    return NextResponse.json({
      summary: result.summary,
      usage: result.usage,
      incidentId,
      messageId: result.messageId,
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to generate summary', {
      endpoint: '/api/chat/summary',
      method: 'POST',
    });
  }
}
