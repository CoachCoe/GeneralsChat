import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ragSystem } from '@/lib/ai/rag';
import { incidentClassifier } from '@/lib/ai/classifier';
import { DataSensitivity } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { message, incidentId, userId } = await request.json();

    if (!message || !userId) {
      return NextResponse.json(
        { error: 'Message and userId are required' },
        { status: 400 }
      );
    }

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
      // Create new incident
      incident = await prisma.incident.create({
        data: {
          reporterId: userId,
          title: 'New Incident Report',
          description: message,
          status: 'open',
        },
        include: {
          conversations: true,
        },
      });
    }

    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
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

    return NextResponse.json({
      response,
      citations,
      incidentId: incident.id,
      classification,
      messageId: aiMessage.id,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
