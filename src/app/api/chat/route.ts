import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { incidentClassifier } from '@/lib/ai/classifier';
import { DataSensitivity, INCIDENT_TYPE_LABELS, PolicyReference } from '@/types';
import { logRequest, logResponse, logError } from '@/lib/logger';
import { recordAudit } from '@/lib/audit';
import { createErrorResponse, validationError, notFoundError } from '@/lib/errors';
import { chatMessageSchema, validateRequest, formatValidationErrors } from '@/lib/validation';
import { LLMUnavailableError } from '@/lib/ai/llm-service';
import { SUMMARY_SENDER } from '@/lib/ai/incident-summary';
import { incidentScope, requireUser } from '@/lib/session';
import { actionTypeFor, ClassificationUnavailableError } from '@/lib/ai/classifier';
import { resolveProvenance } from '@/lib/obligation-provenance';
import { claudeService } from '@/lib/ai/claude-service';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId: string | undefined;

  try {
    logRequest('POST', '/api/chat');

    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    userId = guard.user.id;

    const body = await request.json();

    // Validate request body
    const validation = validateRequest(chatMessageSchema, body);
    if (!validation.success) {
      logError(new Error('Validation failed'), {
        operation: 'chat',
        errors: formatValidationErrors(validation.errors),
      });
      return validationError('Invalid request data', formatValidationErrors(validation.errors));
    }

    // userId comes from the session, never from the body. (SEC-8)
    const { message, incidentId } = validation.data;

    // Get or create incident
    let incident;
    if (incidentId) {
      incident = await prisma.incident.findFirst({
        where: { id: incidentId, ...incidentScope(guard.user) },
        include: {
          conversations: {
            // Newest-first with a take, then reversed below. `asc` + `take`
            // returned the ten OLDEST messages, so from turn six onward the
            // model never saw anything said in between -- which is exactly the
            // context looping this was meant to fix. (FLOW-2, SPEC-11)
            orderBy: { timestamp: 'desc' },
            take: 20,
          },
        },
      });
    } else {
      // Generate a meaningful title from the first message
      const { claudeService } = await import('@/lib/ai/claude-service');
      const title = await claudeService.generateIncidentTitle(message);

      // Create new incident with AI-generated title
      incident = await prisma.incident.create({
        data: {
          reporterId: userId,
          title,
          description: message,
          status: 'open',
        },
        include: {
          conversations: true,
        },
      });

      await recordAudit({
        userId,
        action: 'created',
        entity: 'incident',
        entityId: incident.id,
        details: { title, via: 'chat' },
      });
    }

    if (!incident) {
      return notFoundError('Incident');
    }

    // Oldest-to-newest, the order the model expects. Summaries are excluded:
    // they are a restatement of this same transcript, so replaying one would
    // pay for the model's own previous output and crowd the context.
    const priorMessages = [...incident.conversations]
      .reverse()
      .filter(c => c.sender !== SUMMARY_SENDER);

    // The API rejects a leading assistant message. The window is a fixed row
    // count, so it starts on one whenever an odd number of rows was dropped --
    // which an unpaired user turn or a filtered summary row both cause. (FLOW-36)
    while (priorMessages.length > 0 && priorMessages[0].sender !== 'user') {
      priorMessages.shift();
    }

    // Save user message
    await prisma.conversation.create({
      data: {
        incidentId: incident.id,
        message,
        sender: 'user',
      },
    });

    // Determine data sensitivity. The return value used to be discarded
    // entirely; it is now recorded on the message metadata below. (FLOW-10)
    const dataSensitivity = determineDataSensitivity(message, incident);

    // Prior turns only. The current message is appended once by
    // generateComplianceResponse, which already receives it as userQuery --
    // adding it here too sent it to the model twice on every request. (FLOW-1)
    const conversationHistory = priorMessages.map(conv => ({
      role: conv.sender as 'user' | 'assistant',
      content: conv.message,
    }));

    // Classify incident if this is the first substantive message
    let classification = null;
    // Previously `conversations.length === 0 && message.length > 50`. Both had
    // to hold in the same request, but the first is only true on turn one --
    // so a short opening message (SYSTEM_STATUS's own example, "A student was
    // bullied today", is 27 chars) skipped classification permanently, leaving
    // incidentType, severity, timeline null and zero ComplianceAction rows.
    // (FLOW-18, SPEC-10)
    if (!incident.incidentType) {
      try {
        classification = await incidentClassifier.classifyIncident(message, {
          incidentId: incident.id,
          reporterId: userId,
        });

        const typeLabel = INCIDENT_TYPE_LABELS[classification.type] || 'Incident';

        // Enhance title with incident type
        const enhancedTitle = incident.title.startsWith(typeLabel)
          ? incident.title
          : `${typeLabel}: ${incident.title}`;

        // Update incident with classification and enhanced title
        await prisma.incident.update({
          where: { id: incident.id },
          data: {
            title: enhancedTitle,
            incidentType: classification.type,
            severity: classification.severity,
            timeline: JSON.stringify(classification.timeline),
            metadata: JSON.stringify({
              classification,
              stakeholders: classification.stakeholders,
            }),
          },
        });

        // Obligations are NOT created here. Classification runs before
        // retrieval -- its categories are what retrieval filters on -- so at
        // this point no policy has been consulted and any deadline would be
        // the model's recall of state law. They are created after retrieval,
        // below. (OQ-5)
      } catch (error) {
        if (!(error instanceof ClassificationUnavailableError)) throw error;
        // Leave incidentType null so the next turn retries. The guidance call
        // below still runs -- an administrator mid-incident should get an
        // answer -- it is just retrieved without a category filter, and the
        // incident stays visibly unclassified rather than being stamped
        // `other` forever. (FLOW-35)
        logError(error, { endpoint: '/api/chat', note: 'classification unavailable; will retry next turn' });
        classification = null;
      }
    }

    // Retrieval is driven by the classification, so it runs after it. When the
    // opening turn was retrieved before classifying, incidentType was still
    // null and the category filter matched nothing -- on the one turn that
    // matters most. Diagnosing the incident is what tells us which policies
    // apply, which is the whole point of the tool.
    const {
      response: policyContext,
      citations,
      coverage,
      references,
    } = await ragSystem.generateResponseWithCitations(
      message,
      {
        incidentId: incident.id,
        incidentType: classification?.type ?? incident.incidentType,
        severity: classification?.severity ?? incident.severity,
        previousMessages: priorMessages,
      }
    );

    // Phase two: now that policy has been retrieved, derive the obligations
    // from it and record where each deadline actually came from. (OQ-5)
    if (classification) {
      await createObligations(incident.id, message, policyContext, references, classification);
    }

    const { content: response, usage } = await (await import('@/lib/ai/llm-service')).llmService.generateSchoolComplianceResponse(
      message,
      policyContext,
      conversationHistory,
      coverage
    );

    // Save AI response
    const aiMessage = await prisma.conversation.create({
      data: {
        incidentId: incident.id,
        message: response,
        sender: 'assistant',
        metadata: JSON.stringify({
          citations,
          classification,
          usage: usage || undefined,
          dataSensitivity,
        }),
      },
    });

    const duration = Date.now() - startTime;
    logResponse('POST', '/api/chat', 200, duration);

    return NextResponse.json({
      response,
      citations,
      coverage,
      incidentId: incident.id,
      classification,
      messageId: aiMessage.id,
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    // A failed model call is surfaced as 503, and no assistant message is
    // written -- the throw happens before the conversation.create below, so
    // the incident record never gains filler text presented as guidance.
    // The user's own message is still persisted, which is intentional.
    // (FLOW-7, TEST-5)
    if (error instanceof LLMUnavailableError) {
      logError(error, { operation: 'chat', userId, duration });
      logResponse('POST', '/api/chat', 503, duration);
      return NextResponse.json(
        { error: error.message, code: 'LLM_UNAVAILABLE' },
        { status: 503 }
      );
    }

    const errorResponse = createErrorResponse(
      error,
      'Failed to process chat message',
      {
        endpoint: '/api/chat',
        userId,
        method: 'POST',
        duration,
      }
    );

    logResponse('POST', '/api/chat', errorResponse.status, duration);
    return errorResponse;
  }
}

/**
 * Create an incident's obligations from the policy that was actually retrieved.
 *
 * Two passes, because the ordering is forced: classification produces the
 * categories retrieval filters on, so it cannot see policy, and its deadlines
 * are therefore the model's recall of state law. This pass re-derives them with
 * the excerpts in hand and records, per obligation, whether the deadline came
 * from a retrieved policy or from the model.
 *
 * The model's attribution is checked, not trusted. `sourceExcerpt` is resolved
 * against the excerpts actually supplied; a number that does not resolve --
 * invented, or off-by-one -- yields an unverified obligation rather than a
 * confident citation to the wrong provision.
 *
 * Falls back to the first-pass obligations when the second pass returns
 * nothing (an empty library, or an unparseable response). Those are recorded
 * as model-sourced, which is exactly what they are: losing the obligation
 * entirely would be worse, because "you must report this to DCYF" is worth
 * saying even when no deadline can be attributed. (OQ-5)
 */
async function createObligations(
  incidentId: string,
  message: string,
  policyContext: string,
  references: PolicyReference[],
  classification: { requiredActions: { type: string; description: string; dueDate: Date }[] }
): Promise<void> {
  const { obligations } = await claudeService.deriveObligations(message, policyContext);

  if (obligations.length > 0) {
    for (const obligation of obligations) {
      const provenance = resolveProvenance(obligation.sourceExcerpt, references);

      await prisma.complianceAction.create({
        data: {
          incidentId,
          actionType: actionTypeFor(obligation.description),
          description: obligation.description,
          dueDate: new Date(Date.now() + obligation.dueInHours * 60 * 60 * 1000),
          status: 'pending',
          ...provenance,
        },
      });
    }
    return;
  }

  for (const action of classification.requiredActions) {
    await prisma.complianceAction.create({
      data: {
        incidentId,
        actionType: action.type,
        description: action.description,
        dueDate: action.dueDate,
        status: 'pending',
        deadlineSource: 'model',
      },
    });
  }
}

function determineDataSensitivity(message: string, incident: any): DataSensitivity {
  // Simple heuristic - in production, use more sophisticated analysis
  const sensitiveKeywords = [
    'student name', 'student id', 'social security', 'address',
    'phone number', 'email', 'medical', 'disability', 'special needs'
  ];
  
  const lowerMessage = message.toLowerCase();
  const hasSensitiveData = sensitiveKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  if (hasSensitiveData) {
    return DataSensitivity.RESTRICTED;
  }
  
  if (
    incident.incidentType === 'title_ix' ||
    incident.incidentType === 'abuse_neglect' ||
    incident.severity === 'critical'
  ) {
    return DataSensitivity.CONFIDENTIAL;
  }
  
  return DataSensitivity.INTERNAL;
}
