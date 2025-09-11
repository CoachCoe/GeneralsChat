import { IncidentClassification, Action, ComplianceTimeline } from '@/types';
import { aiRouter } from './ollama';
import { DataSensitivity } from '@/types';

export class IncidentClassifier {
  async classifyIncident(description: string, context: any): Promise<IncidentClassification> {
    const classificationPrompt = `
    Analyze this incident description and classify it according to school discipline policies:
    
    Description: ${description}
    
    Context: ${JSON.stringify(context)}
    
    Classify this incident as one of: bullying, title_ix, harassment, violence, or other.
    Determine severity as: low, medium, high, or critical.
    Provide required actions and timeline based on policy requirements.
    `;

    try {
      const response = await aiRouter.processQuery(
        classificationPrompt,
        context,
        DataSensitivity.CONFIDENTIAL
      );

      // Parse the AI response to extract classification
      // This is a simplified version - in production, you'd want more robust parsing
      const classification = this.parseClassificationResponse(response);
      
      return classification;
    } catch (error) {
      console.error('Classification error:', error);
      // Return default classification
      return this.getDefaultClassification();
    }
  }

  private parseClassificationResponse(response: string): IncidentClassification {
    // Simple parsing - in production, use more sophisticated NLP
    const type = this.extractType(response);
    const severity = this.extractSeverity(response);
    const requiredActions = this.extractActions(response);
    const timeline = this.extractTimeline(response);
    const stakeholders = this.extractStakeholders(response);

    return {
      type,
      severity,
      requiredActions,
      timeline,
      stakeholders,
    };
  }

  private extractType(response: string): "bullying" | "title_ix" | "harassment" | "violence" | "other" {
    const lowerResponse = response.toLowerCase();
    if (lowerResponse.includes('bullying')) return 'bullying';
    if (lowerResponse.includes('title ix') || lowerResponse.includes('sexual harassment')) return 'title_ix';
    if (lowerResponse.includes('harassment')) return 'harassment';
    if (lowerResponse.includes('violence') || lowerResponse.includes('assault')) return 'violence';
    return 'other';
  }

  private extractSeverity(response: string): "low" | "medium" | "high" | "critical" {
    const lowerResponse = response.toLowerCase();
    if (lowerResponse.includes('critical') || lowerResponse.includes('severe')) return 'critical';
    if (lowerResponse.includes('high')) return 'high';
    if (lowerResponse.includes('medium')) return 'medium';
    return 'low';
  }

  private extractActions(response: string): Action[] {
    // Extract actions from response - simplified version
    const actions: Action[] = [];
    
    // Look for common action patterns
    if (response.includes('immediate action')) {
      actions.push({
        id: 'immediate_1',
        type: 'immediate_response',
        description: 'Take immediate action as required by policy',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        status: 'pending',
      });
    }

    if (response.includes('investigation')) {
      actions.push({
        id: 'investigation_1',
        type: 'investigation',
        description: 'Conduct thorough investigation',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days
        status: 'pending',
      });
    }

    if (response.includes('report')) {
      actions.push({
        id: 'reporting_1',
        type: 'reporting',
        description: 'Submit required reports',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
        status: 'pending',
      });
    }

    return actions;
  }

  private extractTimeline(response: string): ComplianceTimeline {
    const now = new Date();
    
    return {
      immediateActions: [
        {
          id: 'immediate_1',
          type: 'immediate_response',
          description: 'Immediate response required',
          dueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          status: 'pending',
        }
      ],
      shortTermActions: [
        {
          id: 'short_1',
          type: 'investigation',
          description: 'Begin investigation',
          dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
          status: 'pending',
        }
      ],
      investigationPhase: [
        {
          id: 'investigation_1',
          type: 'full_investigation',
          description: 'Complete investigation',
          dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          status: 'pending',
        }
      ],
      reportingDeadlines: [
        new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      ],
      reviewMilestones: [
        new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      ],
    };
  }

  private extractStakeholders(response: string): string[] {
    const stakeholders: string[] = [];
    
    if (response.includes('parent')) stakeholders.push('parents');
    if (response.includes('teacher')) stakeholders.push('teachers');
    if (response.includes('principal')) stakeholders.push('principal');
    if (response.includes('counselor')) stakeholders.push('counselor');
    if (response.includes('district')) stakeholders.push('district_admin');
    if (response.includes('police') || response.includes('law enforcement')) stakeholders.push('law_enforcement');
    
    return stakeholders;
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
