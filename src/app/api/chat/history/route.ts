import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/chat/history - Get user's chat histories
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Fetch user's incidents with their latest conversation
    const incidents = await prisma.incident.findMany({
      where: {
        reporterId: userId,
      },
      include: {
        conversations: {
          orderBy: { timestamp: 'desc' },
          take: 1, // Get just the latest message for preview
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 20, // Limit to 20 most recent
    });

    // Format the response
    const chatHistories = incidents.map(incident => ({
      id: incident.id,
      title: incident.title,
      lastMessage: incident.conversations[0]?.message || '',
      timestamp: incident.updatedAt,
    }));

    return NextResponse.json({ histories: chatHistories });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}
