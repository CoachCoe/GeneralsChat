import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude AI Service
 *
 * Handles all interactions with Anthropic's Claude API
 * for school compliance guidance and incident analysis
 */

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason: string;
}

class ClaudeService {
  private client: Anthropic | null = null;
  private model: string;
  private maxTokens: number;

  constructor() {
    // Using Claude 3.5 Sonnet (latest as of the code)
    this.model = 'claude-sonnet-4-20250514';
    this.maxTokens = 4096;
  }

  /**
   * Initialize the Anthropic client (lazy initialization)
   */
  private getClient(): Anthropic {
    if (!this.client) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required');
      }

      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }

    return this.client;
  }

  /**
   * Generate a response from Claude with context
   */
  async generateResponse(
    messages: ClaudeMessage[],
    systemPrompt?: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<ClaudeResponse> {
    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || 1.0,
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      const textContent = response.content[0];

      return {
        content: textContent.type === 'text' ? textContent.text : '',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        stopReason: response.stop_reason || 'unknown',
      };
    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error(`Failed to generate Claude response: ${error}`);
    }
  }

  /**
   * Generate a school compliance response with RAG context
   */
  async generateComplianceResponse(
    userQuery: string,
    policyContext: string,
    conversationHistory: ClaudeMessage[] = []
  ): Promise<ClaudeResponse> {
    const systemPrompt = `You are an expert school compliance assistant helping administrators navigate disciplinary incident reporting requirements.

Your role is to:
1. Provide accurate guidance based on school policies and legal requirements
2. Cite specific policy sections when making recommendations
3. Explain reporting timelines and deadlines clearly
4. Identify required actions and stakeholders
5. Help ensure FERPA compliance and student privacy
6. Use clear, professional language appropriate for school administrators

When responding:
- Always cite the specific policy sections you reference
- Be precise about timelines (e.g., "within 24 hours", "by end of school day")
- List action items clearly and in order of priority
- Highlight any legal requirements (Title IX, FERPA, state laws)
- Ask clarifying questions if the incident details are unclear

Available Policy Context:
${policyContext}

If the policy context doesn't contain relevant information, say so clearly and recommend contacting district legal counsel.`;

    const messages: ClaudeMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: userQuery,
      },
    ];

    return this.generateResponse(messages, systemPrompt);
  }

  /**
   * Classify an incident and determine required actions
   */
  async classifyIncident(
    incidentDescription: string,
    policyContext?: string
  ): Promise<{
    type: string;
    severity: string;
    reasoning: string;
    requiredActions: string[];
    timeline: string[];
    stakeholders: string[];
  }> {
    const systemPrompt = `You are a school incident classification expert. Analyze the incident and provide structured classification.

Respond with a JSON object containing:
{
  "type": "bullying" | "title_ix" | "harassment" | "violence" | "substance" | "other",
  "severity": "low" | "medium" | "high" | "critical",
  "reasoning": "Brief explanation of why this classification was chosen",
  "requiredActions": ["Action 1", "Action 2", ...],
  "timeline": ["Immediate: ...", "Within 24h: ...", "Within 5 days: ...", ...],
  "stakeholders": ["Administrator", "Parents", "Counselor", ...]
}

Consider:
- Title IX requirements for sexual harassment
- Bullying prevention laws
- Mandatory reporting requirements
- Student safety and welfare
- FERPA privacy requirements

${policyContext ? `\nRelevant Policies:\n${policyContext}` : ''}`;

    const response = await this.generateResponse(
      [
        {
          role: 'user',
          content: `Classify this incident:\n\n${incidentDescription}`,
        },
      ],
      systemPrompt,
      { temperature: 0.3 } // Lower temperature for more consistent classification
    );

    try {
      // Extract JSON from response (Claude might wrap it in markdown)
      let jsonText = response.content.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }

      const classification = JSON.parse(jsonText);
      return classification;
    } catch (error) {
      console.error('Failed to parse classification JSON:', error);
      console.error('Raw response:', response.content);

      // Return a safe default
      return {
        type: 'other',
        severity: 'medium',
        reasoning: 'Unable to automatically classify. Manual review required.',
        requiredActions: ['Review incident details', 'Contact administrator'],
        timeline: ['Immediate: Begin investigation'],
        stakeholders: ['Administrator', 'Reporter'],
      };
    }
  }

  /**
   * Generate suggested follow-up questions for an incident
   */
  async generateFollowUpQuestions(
    incidentSummary: string,
    existingInfo: string[]
  ): Promise<string[]> {
    const systemPrompt = `You are helping gather complete information about a school disciplinary incident.

Based on the incident summary and information already collected, generate 3-5 clarifying questions that would help:
1. Determine appropriate classification
2. Identify required reporting
3. Ensure student safety
4. Meet legal/policy requirements

Return ONLY a JSON array of questions, nothing else.
Example: ["Question 1?", "Question 2?", "Question 3?"]`;

    const userMessage = `Incident: ${incidentSummary}\n\nInformation collected:\n${existingInfo.join('\n')}`;

    const response = await this.generateResponse(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      { temperature: 0.5, maxTokens: 500 }
    );

    try {
      let jsonText = response.content.trim();

      // Remove markdown if present
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
      }

      const questions = JSON.parse(jsonText);
      return Array.isArray(questions) ? questions : [];
    } catch (error) {
      console.error('Failed to parse follow-up questions:', error);
      return [
        'Can you provide more details about what happened?',
        'Were there any witnesses to this incident?',
        'Has this type of incident occurred before?',
      ];
    }
  }

  /**
   * Stream a response (for real-time chat)
   */
  async *streamResponse(
    messages: ClaudeMessage[],
    systemPrompt?: string
  ): AsyncGenerator<string, void, unknown> {
    try {
      const client = this.getClient();
      const stream = await client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 1.0,
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: true,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (error) {
      console.error('Claude streaming error:', error);
      throw new Error(`Failed to stream Claude response: ${error}`);
    }
  }
}

export const claudeService = new ClaudeService();
