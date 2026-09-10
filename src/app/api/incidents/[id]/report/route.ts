import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logRequest, logResponse } from '@/lib/logger';
import { createErrorResponse, notFoundError, successResponse } from '@/lib/errors';
import { incidentScope, requireUser } from '@/lib/session';
import { POLICY_BACKED_SOURCE } from '@/lib/deadline';
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
          where: { dueDate: { not: null }, deadlineSource: POLICY_BACKED_SOURCE },
          orderBy: { dueDate: 'asc' },
          select: { actionType: true, description: true, dueDate: true },
        },
      },
    });

    // 404, not 403: an id must not be confirmed to someone who may not read it.
    if (!incident) {
      const response = notFoundError('Incident');
      logResponse('GET', '/api/incidents/[id]/report', response.status, Date.now() - startTime);
      return response;
    }

    const noForm = (reason: 'unclassified' | 'no-form-for-type' | 'none-loaded') => {
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

    // A form chosen without knowing what the incident is about would be a
    // guess at which legal filing applies. `other` is a classification, not
    // the absence of one: it simply maps to no category.
    if (!incident.incidentType) return noForm('unclassified');

    const categories = categoriesForIncidentType(incident.incidentType);
    if (categories.length === 0) return noForm('no-form-for-type');

    const form = await prisma.policy.findFirst({
      where: {
        isActive: true,
        documentKind: 'form',
        jurisdiction: { in: [...LOCAL_JURISDICTIONS] },
        category: { in: categories },
      },
      orderBy: { updatedAt: 'desc' },
      select: { title: true, jurisdiction: true, content: true },
    });

    // A missing form is information, the same as a missing policy -- and an
    // indexed-but-empty document, which is what a failed upload leaves, is
    // the same absence from where the reader stands.
    if (!form?.content) return noForm('none-loaded');

    // Only a deadline a retrieved policy states -- counting ten school days
    // from a holiday calendar we do not have would be inventing a legal date.
    // Ordered, and the earliest wins: two obligations can describe finishing
    // the investigation, and which one prints must not depend on the query
    // planner.
    const investigation = incident.complianceActions.find(a =>
      /investigation/i.test(`${a.description ?? ''} ${a.actionType}`) &&
      /complete|conclude/i.test(`${a.description ?? ''} ${a.actionType}`)
    );

    const blocks = prefillReport(parseReportTemplate(form.content), {
      reportedAt: incident.createdAt.toISOString(),
      personReporting: incident.reporter?.name,
      completedBy: guard.user.name,
      description: incident.description,
      investigationDueAt: investigation?.dueDate?.toISOString(),
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
