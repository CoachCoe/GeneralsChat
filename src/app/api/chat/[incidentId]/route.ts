import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = {
  params: Promise<{
    incidentId: string;
  }>;
};

// GET /api/chat/[incidentId] - Get full conversation for an incident
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { incidentId } = await params;

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        conversations: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Format messages for the chat UI
    const messages = incident.conversations.map(conv => ({
      id: conv.id,
      type: conv.sender === 'user' ? 'user' : 'general',
      content: conv.message,
      timestamp: conv.timestamp,
    }));

    return NextResponse.json({
      incidentId: incident.id,
      title: incident.title,
      messages,
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}
