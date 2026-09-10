import { IncidentClassification, Action, ComplianceTimeline } from '@/types';
import { claudeService } from './claude-service';
import { dueDateFromHours } from '@/lib/deadline';

/**
 * Classification could not be completed -- distinct from classifying as
 * `other`, which is a real answer.
 */
export class ClassificationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassificationUnavailableError';
  }
}

/**
 * Bucket an obligation by what it asks the administrator to do.
 *
 * Exported because obligations are created in two places -- the two-phase path
 * in the chat route, and this classifier's fallback -- and the same
 * description must bucket the same way in both.
 */
export function actionTypeFor(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes('immediate') || lower.includes('urgent')) return 'immediate_response';
  if (lower.includes('investigate')) return 'investigation';
  if (lower.includes('notify') || lower.includes('contact')) return 'notification';
  if (lower.includes('document')) return 'documentation';
  if (lower.includes('report')) return 'reporting';
  return 'general_action';
}

export class IncidentClassifier {
  async classifyIncident(
    description: string,
    context: any,
    policyContext?: string
  ): Promise<IncidentClassification> {
    try {
      const classification = await claudeService.classifyIncident(
        description,
        policyContext
      );

      // Convert Claude's response to our format with proper Action objects
      // Each action's deadline comes from the action itself. Pairing
      // requiredActions[idx] with timeline[idx] silently mis-dated every
      // action whenever the two arrays differed in length or order -- the
      // common case -- and unmatched entries fell through calculateDueDate('')
      // to a hardcoded 3-day default, which is wrong for a 24-hour mandatory
      // reporting obligation.
      const requiredActions: Action[] = classification.requiredActions.map(
        (action, idx) => ({
          id: `action_${idx + 1}`,
          type: actionTypeFor(action.description),
          description: action.description,
          dueDate: dueDateFromHours(action.dueInHours),
          status: 'pending' as const,
        })
      );

      const timeline = this.buildTimeline(requiredActions);

      return {
        type: classification.type,
        severity: classification.severity,
        requiredActions,
        timeline,
        stakeholders: classification.stakeholders,
      };
    } catch (error) {
      // Let the failure surface. A default of `type: 'other', severity:
      // 'low', requiredActions: []` would be written to the incident, and
      // because the route classifies only when incidentType is null the stamp
      // would be permanent, with no endpoint to correct it -- a timed-out API
      // call and a genuine "we could not tell" recorded identically, on the
      // incident where the system knows least.
      //
      // Throwing leaves incidentType null so the next turn tries again. The
      // caller decides what to show meanwhile.
      throw new ClassificationUnavailableError(
        error instanceof Error ? error.message : 'Classification failed'
      );
    }
  }

  private buildTimeline(actions: Action[]): ComplianceTimeline {
    const now = new Date();

    const immediate = actions.filter(a =>
      a.dueDate.getTime() <= now.getTime() + 24 * 60 * 60 * 1000
    );
    const shortTerm = actions.filter(
      a =>
        a.dueDate.getTime() > now.getTime() + 24 * 60 * 60 * 1000 &&
        a.dueDate.getTime() <= now.getTime() + 5 * 24 * 60 * 60 * 1000
    );
    const investigation = actions.filter(
      a => a.dueDate.getTime() > now.getTime() + 5 * 24 * 60 * 60 * 1000
    );

    return {
      immediateActions: immediate,
      shortTermActions: shortTerm,
      investigationPhase: investigation,
      reportingDeadlines: actions
        .filter(a => a.type === 'reporting')
        .map(a => a.dueDate),
      reviewMilestones: [
        new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      ],
    };
  }
}

export const incidentClassifier = new IncidentClassifier();
