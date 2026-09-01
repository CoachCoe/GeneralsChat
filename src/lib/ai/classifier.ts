import { IncidentClassification, Action, ComplianceTimeline } from '@/types';
import { claudeService } from './claude-service';

export class IncidentClassifier {
  async classifyIncident(
    description: string,
    context: any,
    policyContext?: string
  ): Promise<IncidentClassification> {
    try {
      // Use Claude's intelligent classification
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
      // reporting obligation. (FLOW-17)
      const requiredActions: Action[] = classification.requiredActions.map(
        (action, idx) => ({
          id: `action_${idx + 1}`,
          type: this.determineActionType(action.description),
          description: action.description,
          dueDate: new Date(Date.now() + action.dueInHours * 60 * 60 * 1000),
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
      console.error('Classification error:', error);
      // Return default classification on error
      return this.getDefaultClassification();
    }
  }

  /**
   * Determine action type from description
   */
  private determineActionType(description: string): string {
    const lower = description.toLowerCase();
    if (lower.includes('immediate') || lower.includes('urgent'))
      return 'immediate_response';
    if (lower.includes('investigate')) return 'investigation';
    if (lower.includes('notify') || lower.includes('contact'))
      return 'notification';
    if (lower.includes('document')) return 'documentation';
    if (lower.includes('report')) return 'reporting';
    return 'general_action';
  }

  /**
   * Build compliance timeline from Claude's timeline array
   */
  private buildTimeline(actions: Action[]): ComplianceTimeline {
    const now = new Date();

    // Categorize actions by timeline
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

  private getDefaultClassification(): IncidentClassification {
    return {
      type: 'other',
      severity: 'low',
      requiredActions: [],
      timeline: {
        immediateActions: [],
        shortTermActions: [],
        investigationPhase: [],
        reportingDeadlines: [],
        reviewMilestones: [],
      },
      stakeholders: [],
    };
  }
}

export const incidentClassifier = new IncidentClassifier();
