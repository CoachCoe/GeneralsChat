import { DataSensitivity } from '@/types';

export class AIRouter {
  private model: string;

  constructor() {
    this.model = process.env.OLLAMA_MODEL || 'llama2:7b-chat';
    // Simplified AI router - will be enhanced when Ollama is properly set up
  }

  async processQuery(
    query: string, 
    context: any, 
    sensitivity: DataSensitivity
  ): Promise<string> {
    // Simplified AI processing - will be enhanced when Ollama is properly set up
    const systemPrompt = this.getSystemPrompt(sensitivity);
    
    // For now, return a simple response based on the query
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('title ix') || lowerQuery.includes('sexual harassment')) {
      return "This appears to be a Title IX matter requiring immediate attention. Please ensure you follow your district's Title IX procedures and contact the Title IX coordinator immediately.";
    }
    
    if (lowerQuery.includes('bully') || lowerQuery.includes('harassment')) {
      return "This appears to be a bullying or harassment incident. Please document the incident thoroughly and follow your district's anti-bullying policies.";
    }
    
    if (lowerQuery.includes('fight') || lowerQuery.includes('physical')) {
      return "This appears to be a physical altercation. Please ensure all parties are safe, document the incident, and follow your district's discipline procedures.";
    }
    
    return `Based on your query about "${query}", I recommend reviewing your district's relevant policies and procedures. Please consult with your administration team for specific guidance.`;
  }

  private getSystemPrompt(sensitivity: DataSensitivity): string {
    const basePrompt = `You are a helpful AI assistant for school administrators. 
You help with discipline issues and provide guidance based on school policies.
Always cite specific policy sections when providing recommendations.
Never provide generic advice - only policy-backed guidance.`;

    switch (sensitivity) {
      case DataSensitivity.CONFIDENTIAL:
      case DataSensitivity.RESTRICTED:
        return `${basePrompt}

IMPORTANT: This query contains sensitive student information. 
- Only provide guidance based on uploaded policies
- Do not store or log any personal information
- Focus on procedural guidance only
- Always maintain strict confidentiality`;

      case DataSensitivity.INTERNAL:
        return `${basePrompt}

This query involves internal district procedures.
- Provide guidance based on district policies
- Include relevant state and federal requirements
- Suggest appropriate escalation paths`;

      case DataSensitivity.PUBLIC:
        return `${basePrompt}

This query involves general policy information.
- Provide comprehensive guidance
- Include all relevant policy references
- Suggest best practices and procedures`;

      default:
        return basePrompt;
    }
  }
}

export const aiRouter = new AIRouter();
