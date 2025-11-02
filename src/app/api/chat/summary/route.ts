import { NextRequest, NextResponse } from 'next/server';
import { claudeService } from '@/lib/ai/claude-service';
import { ragSystem } from '@/lib/ai/rag';
import { prisma } from '@/lib/db';

/**
 * POST /api/chat/summary
 *
 * Generates a comprehensive end-of-chat summary including:
 * - What the administrator shared
 * - Policy citations and how they were applied
 * - Risk assessment and compliance status
 * - Outstanding next steps and open questions
 *
 * Body: { incidentId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { incidentId } = await request.json();

    if (!incidentId) {
      return NextResponse.json(
        { error: 'Incident ID is required' },
        { status: 400 }
      );
    }

    // Get the incident and all conversation history
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        conversations: {
          orderBy: { timestamp: 'asc' },
        },
        complianceActions: true,
      },
    });

    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }

    if (incident.conversations.length === 0) {
      return NextResponse.json(
        { error: 'No conversation history to summarize' },
        { status: 400 }
      );
    }

    // Convert conversation history to Claude messages
    const conversationHistory = incident.conversations.map(conv => ({
      role: conv.sender as 'user' | 'assistant',
      content: conv.message,
    }));

    // Get relevant policy context from the entire conversation
    const allMessages = conversationHistory
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .join(' ');

    const { response: policyContext } = await ragSystem.generateResponseWithCitations(
      allMessages,
      { maxResults: 10, includeMetadata: true }
    );

    // Generate the comprehensive summary
    const summary = await claudeService.generateChatSummary(
      conversationHistory,
      policyContext
    );

    // Store the summary in the database
    await prisma.conversation.create({
      data: {
        incidentId: incident.id,
        sender: 'assistant',
        message: `## END OF CHAT SUMMARY\n\n${summary.content}`,
        metadata: JSON.stringify({
          type: 'summary',
          generatedAt: new Date().toISOString(),
          messageCount: incident.conversations.length,
          usage: summary.usage,
        }),
      },
    });

    // Mark incident as reviewed
    const existingMetadata = incident.metadata ? JSON.parse(incident.metadata) : {};
    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        metadata: JSON.stringify({
          ...existingMetadata,
          summaryGenerated: true,
          summaryGeneratedAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      summary: summary.content,
      usage: summary.usage,
      incidentId: incident.id,
      messagesAnalyzed: incident.conversations.length,
    });

  } catch (error: any) {
    console.error('Error generating chat summary:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary', details: error.message },
      { status: 500 }
    );
  }
}
