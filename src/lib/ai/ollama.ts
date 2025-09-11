import { Ollama } from '@langchain/ollama';
import { DataSensitivity } from '@/types';

export class AIRouter {
  private ollama: Ollama;
  private model: string;

  constructor() {
    this.model = process.env.OLLAMA_MODEL || 'llama2:7b-chat';
    this.ollama = new Ollama({
      baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      model: this.model,
    });
  }

  async processQuery(
    query: string, 
    context: any, 
    sensitivity: DataSensitivity
  ): Promise<string> {
    // All processing happens locally for privacy
    const systemPrompt = this.getSystemPrompt(sensitivity);
    const fullPrompt = `${systemPrompt}\n\nContext: ${JSON.stringify(context)}\n\nQuery: ${query}`;
    
    try {
      const response = await this.ollama.invoke(fullPrompt);
      return response as string;
    } catch (error) {
      console.error('AI processing error:', error);
      throw new Error('Failed to process query with local AI');
    }
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
