import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { incidentClassifier } from '@/lib/ai/classifier';
import { DataSensitivity } from '@/types';
import { logRequest, logResponse, logError, logAudit } from '@/lib/logger';
import { createErrorResponse, validationError, notFoundError } from '@/lib/errors';
import { chatMessageSchema, validateRequest, formatValidationErrors } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId: string | undefined;

  try {
    logRequest('POST', '/api/chat');

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

    const { message, incidentId, userId: reqUserId } = validation.data;
    userId = reqUserId;

    // Get or create incident
    let incident;
    if (incidentId) {
      incident = await prisma.incident.findUnique({
        where: { id: incidentId },
        include: {
          conversations: {
            orderBy: { timestamp: 'asc' },
            take: 10, // Last 10 messages for context
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

      // Log audit event for incident creation
      logAudit(userId, 'create', 'incident', incident.id, {
        title,
        via: 'chat',
      });
    }

    if (!incident) {
      return notFoundError('Incident');
    }

    // Save user message
    await prisma.conversation.create({
      data: {
        incidentId: incident.id,
        message,
        sender: 'user',
      },
    });

    // Determine data sensitivity
    determineDataSensitivity(message, incident);

    // Generate AI response using RAG
    const { response: policyContext, citations } = await ragSystem.generateResponseWithCitations(
      message,
      {
        incidentId: incident.id,
        incidentType: incident.incidentType,
        severity: incident.severity,
        previousMessages: incident.conversations,
      }
    );

    // Use LLM service with RAG context to generate intelligent response
    const { content: response, usage } = await (await import('@/lib/ai/llm-service')).llmService.generateSchoolComplianceResponse(
      message,
      policyContext,
      incident.conversations.map(conv => ({
        role: conv.sender as 'user' | 'assistant',
        content: conv.message,
      }))
    );

    // Classify incident if this is the first substantive message
    let classification = null;
    if (incident.conversations.length === 0 && message.length > 50) {
      // Pass policy context to classifier for better accuracy
      classification = await incidentClassifier.classifyIncident(
        message,
        {
          incidentId: incident.id,
          reporterId: userId,
        },
        policyContext
      );

      // Update incident with classification
      await prisma.incident.update({
        where: { id: incident.id },
        data: {
          incidentType: classification.type,
          severity: classification.severity,
          timeline: JSON.stringify(classification.timeline),
          metadata: JSON.stringify({
            classification,
            stakeholders: classification.stakeholders,
          }),
        },
      });

      // Create compliance actions
      for (const action of classification.requiredActions) {
        await prisma.complianceAction.create({
          data: {
            incidentId: incident.id,
            actionType: action.type,
            description: action.description,
            dueDate: action.dueDate,
            assignedTo: action.assignedTo,
            status: 'pending',
          },
        });
      }
    }

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
          confidence: 0.9, // Claude typically provides high-quality responses
        }),
      },
    });

    const duration = Date.now() - startTime;
    logResponse('POST', '/api/chat', 200, duration);

    return NextResponse.json({
      response,
      citations,
      incidentId: incident.id,
      classification,
      messageId: aiMessage.id,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
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
  
  if (incident.incidentType === 'title_ix' || incident.severity === 'critical') {
    return DataSensitivity.CONFIDENTIAL;
  }
  
  return DataSensitivity.INTERNAL;
}
