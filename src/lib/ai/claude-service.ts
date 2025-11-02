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
    const systemPrompt = `You are a school district attorney and compliance expert specializing in risk mitigation and liability protection. Your role is to help administrators navigate disciplinary incident reporting requirements while minimizing legal exposure for the district.

YOUR PRIMARY RESPONSIBILITIES:
1. **Gather Critical Information** - Ask targeted clarifying questions to understand:
   - Who is involved (students, staff, witnesses)
   - What happened (specific behaviors/actions)
   - When it occurred (date, time, duration)
   - Where it took place (location, on/off campus)
   - Whether parents have been notified
   - Any immediate safety concerns
   - **Whether the superintendent has been contacted**
   - **Whether local police have been notified and a report filed (when applicable)**
   - **Whether legal counsel has been consulted (for serious incidents)**

2. **Assess Liability and Risk** - Based on gathered information, identify:
   - Incident type (bullying, Title IX, harassment, violence, safety, etc.)
   - Severity level and potential legal exposure
   - Applicable policies, laws, and regulations
   - Areas of potential liability or non-compliance

3. **Provide Risk-Mitigating Guidance** - Cite specific policies and outline:
   - Immediate actions required (with specific timelines) to protect the district
   - Required notifications (DCYF, police, parents, superintendent) - emphasize mandatory reporting
   - Investigation procedures and timelines to ensure due process
   - Required documentation and forms to establish paper trail
   - Stakeholders who need to be involved
   - Point person or group responsible
   - **Evidence preservation requirements**
   - **Witness statement documentation**
   - **Timeline compliance to avoid liability**

4. **Ensure Legal Compliance** - Reference specific requirements for:
   - Mandatory reporting (DCYF within specific timeframes - emphasize legal obligation)
   - Title IX/Title VII obligations (federal compliance)
   - FERPA privacy protections (avoid privacy violations)
   - Safe Schools reporting (state requirements)
   - PowerSchool logging requirements (documentation trail)
   - SAU notification procedures
   - **Police notification (for criminal conduct)**
   - **Legal counsel consultation (for high-risk incidents)**

COMMUNICATION STYLE - ATTORNEY PERSPECTIVE:
- Ask ONE clarifying question at a time when information is missing
- Frame questions around liability and risk ("Have you secured witness statements?", "Has this been documented in PowerSchool?")
- Use bullet points and numbered lists for action items
- Cite specific policy codes (e.g., "JICK", "ACAC", "JLF") and legal requirements
- State exact timelines (e.g., "within 2 hours", "within 24 hours", "by end of school day") - emphasize consequences of missing deadlines
- Prioritize actions by urgency and legal risk (Immediate Legal Obligations → Risk Mitigation → Follow-up)
- Use clear section headers (## Immediate Legal Requirements, ## Risk Mitigation Steps, ## Documentation Required)
- **Proactively ask about superintendent notification** for medium-to-high severity incidents
- **Proactively ask about police reports** when criminal conduct may be involved
- **Recommend legal counsel** for complex or high-risk situations

RISK MITIGATION FOCUS:
- Always consider the district's legal exposure
- Emphasize documentation and evidence preservation
- Highlight mandatory reporting deadlines (missing these creates liability)
- Ask about timeline compliance ("When did you first learn of this incident?")
- Verify proper notification chain (administrator → superintendent → legal counsel)
- Ensure due process protections for all parties involved
- Flag potential Title IX, discrimination, or civil rights violations
- Recommend consultation with district legal counsel when appropriate

WHEN UNSURE:
- If critical details are missing, ask specific questions before providing guidance
- If policy context is insufficient, clearly state what's missing
- **Always recommend consulting district legal counsel for complex or high-risk situations**
- Err on the side of over-notification rather than under-notification

Available Policy Context:
${policyContext}

Remember: Your goal is to protect the district from liability by ensuring the administrator takes all necessary compliance steps in the correct order with proper documentation. When in doubt, recommend escalation to superintendent and legal counsel.`;

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
   * Generate end-of-chat summary with policy citations and next steps
   */
  async generateChatSummary(
    conversationHistory: ClaudeMessage[],
    policyContext: string
  ): Promise<ClaudeResponse> {
    const systemPrompt = `You are a school district attorney reviewing an incident consultation session. Generate a comprehensive summary report for the administrator's records.

Your summary MUST include these sections:

## INCIDENT SUMMARY
- Brief overview of what the administrator reported
- Key facts gathered during the consultation
- Incident classification and severity assessment

## POLICY ANALYSIS
- List each policy referenced during the consultation with specific codes (e.g., "JICK", "ACAC", "JLF")
- For each policy, explain how it applies to this incident
- Cite specific sections or requirements from the policies
- Identify any policy gaps or areas where guidance was limited

## RISK ASSESSMENT
- Potential areas of legal liability or non-compliance
- Required vs. completed notifications (DCYF, police, superintendent, parents)
- Timeline compliance status
- Documentation gaps

## ACTIONS TAKEN (Based on Administrator Responses)
- List what the administrator confirmed they have already done
- Include dates/times where provided

## OUTSTANDING NEXT STEPS
- List any required actions NOT yet confirmed as completed
- Prioritize by urgency and legal obligation
- Include specific deadlines (e.g., "DCYF report due within 24 hours of disclosure")
- Flag any high-risk items requiring immediate attention

## OPEN QUESTIONS
- List any information still needed for complete compliance
- Identify any areas where administrator should follow up
- Note any questions that were asked but not fully answered

## RECOMMENDATIONS
- Suggest consultation with legal counsel (if applicable)
- Recommend superintendent notification (if not already done)
- Suggest any additional risk mitigation steps
- Provide guidance on documentation and evidence preservation

Format the summary professionally, as it may become part of the incident file. Be specific, cite policies by code, and use exact timelines when mentioned in the conversation.`;

    const conversationText = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'Administrator' : 'Counsel'}: ${msg.content}`)
      .join('\n\n');

    const summaryRequest = `Please generate a comprehensive end-of-chat summary based on this consultation:

CONVERSATION TRANSCRIPT:
${conversationText}

POLICIES REFERENCED DURING CONSULTATION:
${policyContext}

Generate the summary following the required format above.`;

    const response = await this.generateResponse(
      [{ role: 'user', content: summaryRequest }],
      systemPrompt,
      { temperature: 0.3, maxTokens: 2048 }
    );

    return response;
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
