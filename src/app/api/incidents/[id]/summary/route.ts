import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { claudeService } from '@/lib/ai/claude-service';
import { ragSystem } from '@/lib/ai/rag';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
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
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
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

    return NextResponse.json({
      summary: summaryResponse.content,
      usage: summaryResponse.usage,
    });
  } catch (error) {
    console.error('Generate summary error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}
