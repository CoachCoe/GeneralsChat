import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { incidentScope, requireUser } from '@/lib/session';
import { readStoredTurn } from '@/lib/ai/conversation-metadata';
import { ragSystem } from '@/lib/ai/rag';

type Params = {
  params: Promise<{
    incidentId: string;
  }>;
};

// GET /api/chat/[incidentId] - Get full conversation for an incident
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { incidentId } = await params;

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, ...incidentScope(guard.user) },
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

    const stored = incident.conversations.map(conv => ({
      conv,
      turn: conv.sender === 'user' ? {} : readStoredTurn(conv.metadata),
    }));

    /*
     * Coverage is a property of the incident and the library, not of a turn,
     * so it is asked for once and only when something will render it.
     *
     * Recomputed rather than replayed from the record. The gap it reports is
     * "the district has no local policy for this", and the administrator
     * reading a month-old incident needs that answered as it stands now --
     * loading the missing policy should clear the warning everywhere, not
     * leave it frozen into every turn that predates the upload. It comes from
     * `ragSystem.coverageFor`, the same call the live turn used, so the two
     * cannot drift apart.
     */
    const needsCoverage = stored.some(({ turn }) => turn.citations !== undefined);
    const coverage = needsCoverage
      ? await ragSystem.coverageFor(incident.incidentType)
      : undefined;

    const messages = stored.map(({ conv, turn }) => ({
      id: conv.id,
      // Summaries render like any assistant turn; they are part of the record.
      type: conv.sender === 'user' ? 'user' : 'general',
      content: conv.message,
      timestamp: conv.timestamp,
      /*
       * The provenance the turn was answered with. Absent on user turns, on
       * summaries, and on anything recorded before this was stored -- and
       * absent is rendered as no block at all, which is honest: we do not know
       * what that turn rested on, and an empty ladder would be a claim that it
       * rested on nothing.
       */
      citations: turn.citations,
      coverage: turn.citations === undefined ? undefined : coverage,
      kind: turn.kind,
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
