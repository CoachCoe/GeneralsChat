import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logRequest, logResponse } from '@/lib/logger';
import { createErrorResponse, notFoundError, successResponse } from '@/lib/errors';
import { incidentScope, requireUser } from '@/lib/session';
import { isPolicyBacked } from '@/lib/deadline';
import { categoriesForIncidentType, LOCAL_JURISDICTIONS } from '@/types';
import { countPrefilled, parseReportTemplate, prefillReport } from '@/lib/report-template';

type Params = { params: Promise<{ id: string }> };

/**
 * The district's report form for this incident, with what the record knows
 * already written in.
 *
 * Parsed and filled on the server, so `GET /api/policies` can go on
 * withholding `content` and `filePath` from everyone: what crosses the wire
 * is the form as blocks, for one incident, to a user the scope already lets
 * read it.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const startTime = Date.now();

  try {
    logRequest('GET', '/api/incidents/[id]/report');
    const guard = await requireUser();
    if (!guard.ok) return guard.response;

    const { id } = await params;
    const incident = await prisma.incident.findFirst({
      where: { id, ...incidentScope(guard.user) },
      include: {
        reporter: { select: { name: true } },
        complianceActions: {
          select: {
            actionType: true,
            description: true,
            dueDate: true,
            deadlineSource: true,
          },
        },
      },
    });

    // 404, not 403: an id must not be confirmed to someone who may not read it.
    if (!incident) {
      const response = notFoundError('Incident');
      logResponse('GET', '/api/incidents/[id]/report', response.status, Date.now() - startTime);
      return response;
    }

    const noForm = (reason: 'unclassified' | 'none-loaded') => {
      logResponse('GET', '/api/incidents/[id]/report', 200, Date.now() - startTime);
      return successResponse({
        incidentTitle: incident.title,
        form: null,
        reason,
        incidentType: incident.incidentType,
        blocks: [],
        counts: { filled: 0, total: 0 },
      });
    };

    // Unclassified, or a type that maps to nothing: the system does not know
    // what this incident is about, and a form chosen anyway would be a guess
    // at which legal filing applies.
    const categories = categoriesForIncidentType(incident.incidentType);
    if (categories.length === 0) return noForm('unclassified');

    const form = await prisma.policy.findFirst({
      where: {
        isActive: true,
        jurisdiction: { in: [...LOCAL_JURISDICTIONS] },
        title: { contains: 'Form', mode: 'insensitive' },
        category: { in: categories },
      },
      orderBy: { updatedAt: 'desc' },
      select: { title: true, jurisdiction: true, content: true },
    });

    // A missing form is information, the same as a missing policy -- and an
    // indexed-but-empty document, which is what a failed upload leaves, is
    // the same absence from where the reader stands.
    if (!form?.content) return noForm('none-loaded');

    const reportedAt = new Date(incident.createdAt);
    // Only a deadline the policy itself states. Counting ten school days from
    // a holiday calendar we do not have would be inventing a legal date.
    const investigation = incident.complianceActions.find(
      a =>
        isPolicyBacked(a.deadlineSource) &&
        a.dueDate &&
        /investigation/i.test(`${a.description ?? ''} ${a.actionType}`) &&
        /complete|conclude/i.test(`${a.description ?? ''} ${a.actionType}`)
    );

    const blocks = prefillReport(parseReportTemplate(form.content), {
      dateReported: reportedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      timeReported: reportedAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
      personReporting: incident.reporter?.name ?? undefined,
      completedBy: guard.user.name ?? undefined,
      description: incident.description,
      investigationDue: investigation?.dueDate
        ? new Date(investigation.dueDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : undefined,
    });

    logResponse('GET', '/api/incidents/[id]/report', 200, Date.now() - startTime);
    return successResponse({
      incidentTitle: incident.title,
      form: { title: form.title, jurisdiction: form.jurisdiction },
      incidentType: incident.incidentType,
      blocks,
      counts: countPrefilled(blocks),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorResponse = createErrorResponse(error, 'Failed to build the report', {
      endpoint: '/api/incidents/[id]/report',
      method: 'GET',
      duration,
    });
    logResponse('GET', '/api/incidents/[id]/report', errorResponse.status, duration);
    return errorResponse;
  }
}
