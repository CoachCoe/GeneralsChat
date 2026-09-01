import { prisma } from '@/lib/db';
import { claudeService } from '@/lib/ai/claude-service';
import { ragSystem } from '@/lib/ai/rag';
import { incidentScope, type SessionUser } from '@/lib/session';

/**
 * Generate and record an incident summary.
 *
 * Both summary endpoints route through here. They were two implementations of
 * one feature (DEAD-12) that had drifted apart in the way that matters: the
 * chat one persisted its result, the incident one discarded it, so a summary
 * generated from the incident page was lost on refresh after being paid for
 * (SPEC-35).
 */

/**
 * Summaries are written with their own sender.
 *
 * They used to be stored as `assistant`, which meant every later chat turn
 * replayed the summary back to the model as conversation history -- paying for
 * its own previous output and crowding the context with a restatement of what
 * was already there. Callers building LLM history exclude this sender; callers
 * rendering the record include it.
 */
export const SUMMARY_SENDER = 'summary';

export type SummaryResult =
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'empty' }
  | { ok: true; summary: string; usage?: { inputTokens: number; outputTokens: number }; messageId: string };

export async function generateIncidentSummary(
  incidentId: string,
  user: SessionUser
): Promise<SummaryResult> {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, ...incidentScope(user) },
    include: {
      conversations: { orderBy: { timestamp: 'asc' } },
      complianceActions: true,
    },
  });

  if (!incident) return { ok: false, reason: 'not-found' };

  // Prior summaries are excluded: summarising a summary compounds drift.
  const transcript = incident.conversations.filter(c => c.sender !== SUMMARY_SENDER);
  if (transcript.length === 0) return { ok: false, reason: 'empty' };

  const conversationHistory = transcript.map(conv => ({
    role: conv.sender === 'user' ? ('user' as const) : ('assistant' as const),
    content: conv.message,
  }));

  // Retrieve with the incident's own classification, so the summary rests on
  // the same policies the guidance did rather than a different set.
  // Coverage travels with the context: the summary is the one artefact that
  // goes into the file, and it was the only output that never said a local
  // policy was missing. (SPEC-41)
  const { response: policyContext, coverage } = await ragSystem.generateResponseWithCitations(
    `${incident.title} ${incident.description ?? ''}`,
    {
      incidentId: incident.id,
      incidentType: incident.incidentType,
      previousMessages: transcript,
    }
  );

  const summary = await claudeService.generateChatSummary(
    conversationHistory,
    policyContext,
    coverage
  );

  const message = await prisma.conversation.create({
    data: {
      incidentId: incident.id,
      sender: SUMMARY_SENDER,
      message: summary.content,
      metadata: JSON.stringify({
        type: 'summary',
        generatedAt: new Date().toISOString(),
        messageCount: transcript.length,
        openObligations: incident.complianceActions.filter(a => a.status !== 'completed').length,
        usage: summary.usage,
      }),
    },
  });

  const existingMetadata = incident.metadata ? JSON.parse(incident.metadata) : {};
  await prisma.incident.update({
    where: { id: incident.id },
    data: {
      metadata: JSON.stringify({
        ...existingMetadata,
        summaryGenerated: true,
        summaryGeneratedAt: new Date().toISOString(),
      }),
    },
  });

  return { ok: true, summary: summary.content, usage: summary.usage, messageId: message.id };
}
