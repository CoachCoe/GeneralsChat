import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';

// GET /api/chat/history - Get user's chat histories
export async function GET() {
  try {
    // Took `userId` from the query string, so the "only your own chats" filter
    // was enforced by the caller -- anyone could read anyone's history by
    // guessing an id. It is now always the session user. (SEC-8)
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const incidents = await prisma.incident.findMany({
      where: {
        reporterId: guard.user.id,
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
