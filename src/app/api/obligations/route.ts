import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { incidentScope, requireUser } from '@/lib/session';
import { createErrorResponse } from '@/lib/errors';

/**
 * GET /api/obligations — every outstanding compliance action for this user,
 * across all their incidents, soonest deadline first.
 *
 * This is the query the product was missing. ComplianceAction rows were being
 * created on every classified incident with real statutory deadlines, and
 * nothing could read them back except one incident at a time -- so an
 * administrator could not answer "what am I late on?", which is the question
 * they actually open the app with. (design 1a)
 *
 * ?window=open|all   open (default) hides completed actions
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const includeCompleted = new URL(request.url).searchParams.get('window') === 'all';

    const actions = await prisma.complianceAction.findMany({
      where: {
        // Scoped through the incident, so a reporter sees only obligations on
        // incidents they filed. (SEC-7)
        incident: incidentScope(guard.user),
        ...(includeCompleted ? {} : { status: { not: 'completed' } }),
      },
      include: {
        incident: {
          select: { id: true, title: true, incidentType: true, severity: true },
        },
      },
      // Nulls last: an obligation with no deadline is real but not urgent.
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 200,
    });

    const obligations = actions.map(action => ({
      id: action.id,
      actionType: action.actionType,
      description: action.description,
      status: action.status,
      dueDate: action.dueDate,
      completedAt: action.completedAt,
      incidentId: action.incidentId,
      incidentTitle: action.incident.title,
      incidentType: action.incident.incidentType,
    }));

    const now = Date.now();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(endOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const open = obligations.filter(o => o.status !== 'completed');
    const due = (o: (typeof obligations)[number]) =>
      o.dueDate ? new Date(o.dueDate).getTime() : null;

    return NextResponse.json({
      obligations,
      counts: {
        overdue: open.filter(o => due(o) !== null && due(o)! < now).length,
        today: open.filter(
          o => due(o) !== null && due(o)! >= now && due(o)! <= endOfToday.getTime()
        ).length,
        week: open.filter(
          o =>
            due(o) !== null &&
            due(o)! > endOfToday.getTime() &&
            due(o)! <= endOfWeek.getTime()
        ).length,
        open: open.length,
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to load obligations', {
      endpoint: '/api/obligations',
      method: 'GET',
    });
  }
}
