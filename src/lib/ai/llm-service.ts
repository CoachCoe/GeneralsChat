export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class LLMService {
  async generateResponse(messages: ChatMessage[]): Promise<string> {
    // For now, using a smart mock that provides realistic school compliance responses
    // In production, this would connect to a real LLM service
    const userMessage = messages.find(msg => msg.role === 'user')?.content || '';
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    
    return this.generateSmartResponse(userMessage);
  }

  private generateSmartResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();
    
    // Title IX related responses
    if (lowerMessage.includes('title ix') || lowerMessage.includes('sexual harassment') || lowerMessage.includes('discrimination')) {
      return "I understand you're dealing with a Title IX matter. This requires immediate attention and specific documentation. You'll need to:\n\n1. Ensure the complainant feels safe and supported\n2. Document everything immediately\n3. Notify the Title IX coordinator within 24 hours\n4. Preserve all evidence\n\nWould you like me to help you with the specific reporting requirements?";
    }
    
    // Bullying incidents
    if (lowerMessage.includes('bully') || lowerMessage.includes('harassment') || lowerMessage.includes('intimidation')) {
      return "Bullying incidents require careful documentation and follow-up. Based on your description, I recommend:\n\n1. Immediate safety assessment for all involved students\n2. Documentation of the incident with witness statements\n3. Parent/guardian notification within 24 hours\n4. Follow-up support plan for affected students\n\nWhat specific details can you share about the incident?";
    }
    
    // Fighting/physical altercations
    if (lowerMessage.includes('fight') || lowerMessage.includes('physical') || lowerMessage.includes('assault') || lowerMessage.includes('violence')) {
      return "Physical altercations are serious incidents requiring immediate action. You need to:\n\n1. Ensure medical attention if needed\n2. Separate and secure all parties\n3. Document injuries and witness statements\n4. Notify parents/guardians immediately\n5. Consider law enforcement involvement if appropriate\n\nWhat was the nature and severity of the incident?";
    }
    
    // General compliance questions
    if (lowerMessage.includes('compliance') || lowerMessage.includes('policy') || lowerMessage.includes('procedure')) {
      return "I'm here to help with compliance requirements. School disciplinary procedures must follow:\n\n- Due process requirements\n- FERPA privacy protections\n- State and federal regulations\n- District policies\n\nWhat specific compliance question do you have?";
    }
    
    // General greeting or help request
    if (lowerMessage.includes('help') || lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Hello! I'm the General, your AI assistant for school disciplinary incident compliance. I can help you with:\n\n- Incident classification and documentation\n- Title IX and FERPA compliance\n- Due process procedures\n- Stakeholder notification requirements\n- Policy interpretation\n\nWhat incident or compliance question can I help you with today?";
    }
    
    // Default response for other queries
    return "I understand you need assistance with this incident. To provide the most accurate guidance, could you provide more details about:\n\n- The nature of the incident\n- Who was involved\n- When and where it occurred\n- Any immediate safety concerns\n\nThis will help me guide you through the appropriate compliance procedures.";
  }

  async generateSchoolComplianceResponse(userMessage: string): Promise<string> {
    const systemPrompt = `You are the General, an AI assistant for school administrators helping with disciplinary incident compliance. You are knowledgeable about:
- Title IX requirements
- FERPA privacy laws
- Student code of conduct
- Due process procedures
- Documentation requirements
- Stakeholder notification protocols

Respond in a helpful, professional manner. Ask clarifying questions when needed. Keep responses concise but informative.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    return this.generateResponse(messages);
  }
}

export const llmService = new LLMService();
