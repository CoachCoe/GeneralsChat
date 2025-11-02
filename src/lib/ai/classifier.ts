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
      const requiredActions: Action[] = classification.requiredActions.map(
        (desc, idx) => ({
          id: `action_${idx + 1}`,
          type: this.determineActionType(desc),
          description: desc,
          dueDate: this.calculateDueDate(classification.timeline[idx] || ''),
          status: 'pending' as const,
        })
      );

      const timeline = this.buildTimeline(
        classification.timeline,
        requiredActions
      );

      return {
        type: classification.type as any,
        severity: classification.severity as any,
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
   * Calculate due date from timeline string
   */
  private calculateDueDate(timelineStr: string): Date {
    const now = new Date();
    const lower = timelineStr.toLowerCase();

    // Extract hours, days, etc. from timeline
    if (lower.includes('immediate') || lower.includes('0-24'))
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (lower.includes('1-5 days') || lower.includes('within 5'))
      return new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    if (lower.includes('10 days')) return new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    if (lower.includes('30 days')) return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Default to 3 days if unclear
    return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  }

  /**
   * Build compliance timeline from Claude's timeline array
   */
  private buildTimeline(
    timelineStrs: string[],
    actions: Action[]
  ): ComplianceTimeline {
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
