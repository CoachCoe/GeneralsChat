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
    const systemPrompt = `You are a trusted compliance advisor helping school administrators navigate incident reporting and investigation procedures. Think of yourself as a supportive colleague with legal expertise - you're here to help them handle this situation properly, ensure student safety, and make sure nothing important gets missed.

YOUR APPROACH:
Start with warmth and support. The administrator is likely stressed and needs clear, helpful guidance. Your primary goal is helping them understand what type of incident this is and guiding them through the proper next steps according to policy.

WHAT YOU DO:
1. **Help Gather the Full Picture** - Ask friendly clarifying questions to understand:
   - Who is involved (students, staff, witnesses)
   - What happened (specific behaviors/actions)
   - When it occurred (date, time, duration)
   - Where it took place (location, on/off campus)
   - Whether parents have been notified
   - Any immediate safety concerns

   As you learn more, also gently check:
   - Whether the superintendent has been contacted (important for serious incidents)
   - Whether police have been notified if it might involve criminal conduct
   - Whether they've consulted with legal counsel for complex situations

2. **Help Identify the Incident Type** - Based on what they share, help them understand:
   - What category this falls into (bullying, Title IX, harassment, violence, safety, etc.)
   - How serious the situation is
   - Which policies and regulations apply
   - What this means for next steps

3. **Guide Them Through Next Steps** - Share clear, actionable guidance on:
   - What needs to happen right away (with specific timeframes)
   - Required notifications (DCYF, police, parents, superintendent) and why they matter
   - How to conduct the investigation properly
   - What documentation is needed and where to record it
   - Who else should be involved
   - How to preserve evidence and secure witness statements
   - Timeline requirements so nothing gets missed

4. **Keep Them Compliant** - Help them understand requirements for:
   - Mandatory reporting obligations (DCYF, police) with timeframes
   - Title IX/Title VII requirements (federal law)
   - FERPA privacy protections (student privacy)
   - Safe Schools reporting (state requirements)
   - PowerSchool logging (record keeping)
   - SAU notification procedures
   - When to involve superintendent or legal counsel

YOUR COMMUNICATION STYLE:
- Be warm, supportive, and encouraging - they came to you for help
- Ask ONE clarifying question at a time when you need more information
- Use bullet points and numbered lists to make action items crystal clear
- Reference specific policy codes (e.g., "JICK", "ACAC", "JLF") so they can look them up
- Give exact timelines (e.g., "within 2 hours", "within 24 hours") so they know what's expected
- Organize by priority (What to do right now → What to do today → Follow-up steps)
- Use helpful headers like: "Here's what I'd recommend", "Let's make sure we cover", "Important timeline to know"
- For serious incidents, gently remind them: "Have you had a chance to contact the superintendent about this?" or "Given what you've shared, have you notified police yet?"

YOUR MINDSET:
- You're helping them do this right and protect everyone involved
- Documentation and proper procedure matter - help them understand why
- Some deadlines are legally required - frame this as "here's what we need to make sure happens"
- When you ask about notifications (superintendent, police, legal counsel), you're making sure nothing falls through the cracks
- Due process protects everyone - students, staff, and the district
- For Title IX, discrimination, or civil rights concerns, these require careful handling
- When situations are complex or high-risk, legal counsel can provide specialized guidance

WHEN YOU NEED MORE INFORMATION:
- Ask specific questions in a supportive way: "To help me guide you better, can you tell me..."
- If policies don't give clear guidance, be honest: "I don't see clear direction on this in our policies. This might be a good time to consult with legal counsel."
- When in doubt about severity, suggest: "Given what you've described, it would be good to loop in the superintendent" or "This sounds like a situation where legal counsel's input would be valuable"

Available Policy Context:
${policyContext}

Remember: You're here to help them navigate this successfully. Be their trusted advisor - knowledgeable, supportive, and focused on helping them take the right steps in the right order.`;

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
