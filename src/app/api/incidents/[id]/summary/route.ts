import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { claudeService } from '@/lib/ai/claude-service';
import { ragSystem } from '@/lib/ai/rag';
import { logRequest, logResponse } from '@/lib/logger';
import { createErrorResponse, notFoundError, successResponse } from '@/lib/errors';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const startTime = Date.now();

  try {
    logRequest('POST', '/api/incidents/[id]/summary');
    const { id } = await params;

    // Fetch incident with full conversation history
    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        reporter: true,
        conversations: {
          orderBy: { timestamp: 'asc' },
        },
        attachments: true,
        complianceActions: true,
      },
    });

    if (!incident) {
      return notFoundError('Incident');
    }

    // Get relevant policy context
    const policyQuery = `${incident.title} ${incident.description || ''} ${incident.incidentType || ''}`;
    const { response: policyContext } = await ragSystem.generateResponseWithCitations(
      policyQuery,
      { incidentId: incident.id }
    );

    // Build conversation history for Claude
    const conversationHistory = incident.conversations.map(conv => ({
      role: conv.sender === 'user' ? 'user' as const : 'assistant' as const,
      content: conv.message,
    }));

    // Generate comprehensive summary using Claude's existing method
    const summaryResponse = await claudeService.generateChatSummary(
      conversationHistory,
      policyContext
    );

    const duration = Date.now() - startTime;
    logResponse('POST', '/api/incidents/[id]/summary', 200, duration);

    return successResponse({
      summary: summaryResponse.content,
      usage: summaryResponse.usage,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorResponse = createErrorResponse(
      error,
      'Failed to generate summary',
      {
        endpoint: '/api/incidents/[id]/summary',
        method: 'POST',
        duration,
      }
    );

    logResponse('POST', '/api/incidents/[id]/summary', errorResponse.status, duration);
    return errorResponse;
  }
}
