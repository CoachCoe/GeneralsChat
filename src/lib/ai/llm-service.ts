import { claudeService, ClaudeMessage } from './claude-service';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class LLMService {
  /**
   * Generate a response using Claude with conversation history
   */
  async generateResponse(
    messages: ChatMessage[],
    policyContext?: string
  ): Promise<LLMResponse> {
    try {
      // Convert messages to Claude format (filter out system messages)
      const claudeMessages: ClaudeMessage[] = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      // Extract system prompt if present
      const systemMessage = messages.find(msg => msg.role === 'system');
      const systemPrompt = systemMessage?.content || this.getDefaultSystemPrompt();

      // Add policy context to system prompt if provided
      const fullSystemPrompt = policyContext
        ? `${systemPrompt}\n\nRelevant Policy Context:\n${policyContext}`
        : systemPrompt;

      // Generate response using Claude
      const response = await claudeService.generateResponse(
        claudeMessages,
        fullSystemPrompt
      );

      return {
        content: response.content,
        usage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
      };
    } catch (error) {
      console.error('LLM Service error:', error);

      // Fallback to helpful error message
      return {
        content:
          "I'm having trouble connecting to the AI service right now. Please try again in a moment. If the issue persists, contact your system administrator.",
      };
    }
  }

  /**
   * Generate a school compliance-specific response
   */
  async generateSchoolComplianceResponse(
    userMessage: string,
    policyContext?: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<LLMResponse> {
    try {
      // Convert conversation history to Claude format
      const claudeHistory: ClaudeMessage[] = conversationHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      // Use Claude's compliance response method
      const response = await claudeService.generateComplianceResponse(
        userMessage,
        policyContext || '',
        claudeHistory
      );

      return {
        content: response.content,
        usage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
      };
    } catch (error) {
      console.error('School compliance response error:', error);

      return {
        content:
          "I'm experiencing technical difficulties. For urgent compliance matters, please contact your district's compliance officer or legal counsel directly.",
      };
    }
  }

  /**
   * Default system prompt for general conversations
   */
  private getDefaultSystemPrompt(): string {
    return `You are "The General", an expert AI assistant for school administrators managing disciplinary incidents and compliance requirements.

Your expertise includes:
- Title IX requirements and sexual harassment policies
- FERPA privacy laws and student data protection
- Bullying prevention and intervention
- Student codes of conduct
- Due process procedures
- Documentation best practices
- Stakeholder notification protocols
- State and federal education regulations

Guidelines:
- Provide clear, actionable guidance
- Cite specific policies when possible
- Highlight legal requirements and deadlines
- Ask clarifying questions when needed
- Maintain professional, supportive tone
- Prioritize student safety and legal compliance
- Acknowledge when you need more information

When you don't have enough information, ask specific follow-up questions to provide accurate guidance.`;
  }

  /**
   * Stream a response for real-time chat (optional enhancement)
   */
  async *streamResponse(
    messages: ChatMessage[],
    policyContext?: string
  ): AsyncGenerator<string, void, unknown> {
    try {
      const claudeMessages: ClaudeMessage[] = messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      const systemMessage = messages.find(msg => msg.role === 'system');
      const systemPrompt = systemMessage?.content || this.getDefaultSystemPrompt();

      const fullSystemPrompt = policyContext
        ? `${systemPrompt}\n\nRelevant Policy Context:\n${policyContext}`
        : systemPrompt;

      // Stream from Claude
      for await (const chunk of claudeService.streamResponse(
        claudeMessages,
        fullSystemPrompt
      )) {
        yield chunk;
      }
    } catch (error) {
      console.error('Streaming error:', error);
      yield "I'm having trouble connecting right now. Please try again.";
    }
  }
}

export const llmService = new LLMService();
