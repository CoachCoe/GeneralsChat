import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logAIOperation, logError, logExternalAPI } from '@/lib/logger';
import { INCIDENT_TYPES, PolicyCoverage, SEVERITIES } from '@/types';

/**
 * The model's classification JSON, validated rather than trusted.
 *
 * Previously this was a bare JSON.parse whose result was returned as
 * `type: string` and cast with `as any` at the call site, so a malformed or
 * injected value flowed straight into the incident record. (SEC-9, DEAD-13)
 */
const derivedObligationsSchema = z.object({
  obligations: z.array(
    z.object({
      description: z.string().min(1),
      dueInHours: z.number().positive().max(24 * 365),
      // null is a first-class answer here, and the common one while the policy
      // library is thin. Coercing it to a number would be the whole bug.
      sourceExcerpt: z.number().int().positive().nullable(),
    })
  ),
});

export interface DerivedObligation {
  description: string;
  dueInHours: number;
  sourceExcerpt: number | null;
}

const classificationSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  severity: z.enum(SEVERITIES),
  reasoning: z.string(),
  /**
   * Each action carries its own deadline. Previously this was a plain string
   * array paired with the separate `timeline` array *by index*, even though
   * the prompt asked for the two independently and never required them to
   * correspond -- so a mandatory 24-hour report routinely inherited an
   * unrelated entry's date, or fell through to a hardcoded 3-day default.
   * (FLOW-17)
   */
  requiredActions: z.array(
    z.object({
      description: z.string(),
      dueInHours: z.number().positive().max(24 * 365),
    })
  ),
  timeline: z.array(z.string()),
  stakeholders: z.array(z.string()),
});

export type ClassificationResult = z.infer<typeof classificationSchema>;

/**
 * Pulls the first JSON object out of a model response.
 *
 * The previous implementation only stripped markdown fences when the response
 * *started* with one, so any prose preamble ("Here is the classification:")
 * defeated it and silently fell through to the severity:'medium' default.
 */
function extractJsonObject(raw: string): string {
  const withoutFences = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model response');
  }
  return withoutFences.slice(start, end + 1);
}

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

/**
 * The instruction that stands in for policy the system could not find.
 *
 * Shared because both callers need it: with nothing retrieved, the "JICK,
 * ACAC, JLF" examples in each prompt are the only codes the model has to
 * reach for. (B4)
 */
const NO_POLICY_RETRIEVED_GUARD = `IMPORTANT - NO POLICY RETRIEVED FOR THIS QUERY:
No district policy text was retrieved for this question. For this response you must:
- NOT cite or invent any policy code (JICK, ACAC, JLF or otherwise)
- NOT state district-specific deadlines or requirements as established fact
- Say plainly that you could not locate the applicable district policy
- Limit yourself to general best practice and statutory obligations you are
  confident about, labelled as such
- Recommend they confirm with their compliance officer or legal counsel`;

/**
 * What to say when the library has no local policy for an implicated area.
 *
 * "No local policy" and "nothing at any level" need different wording: the
 * second cannot claim the guidance rests on federal or state text. (FLOW-34)
 */
function buildCoverageNote(coverage?: PolicyCoverage): string {
  const gaps = coverage?.categoriesWithoutLocalPolicy ?? [];
  if (gaps.length === 0) return '';

  const byCategory = coverage?.byCategory ?? {};
  const nothingAnywhere = gaps.filter(c => (byCategory[c] ?? []).length === 0);
  const localOnly = gaps.filter(c => (byCategory[c] ?? []).length > 0);

  let note = '\n\nPOLICY COVERAGE GAP:';
  if (localOnly.length > 0) {
    note += `
This incident implicates the following areas, and the policy library holds NO district or school policy for them: ${localOnly.join(', ')}.
State whatever federal or state requirements you can support from the text above, then tell them plainly that you could not find a district or school policy covering this and that they should confirm the local procedure with their compliance officer. Do not present a federal or state requirement as if it were district procedure, and do not invent a local policy code.`;
  }
  if (nothingAnywhere.length > 0) {
    note += `
The library holds NO policy at ANY level -- federal, state, district or school -- for: ${nothingAnywhere.join(', ')}.
For these areas do not state a deadline, a requirement or a citation as established fact. Say plainly that the library holds nothing covering them and that they must confirm the obligation with their compliance officer or legal counsel.`;
  }
  return note;
}

/**
 * The rules an administrator's answer must obey, whatever persona is
 * configured. Not editable, by design.
 *
 * The advisor profile below is editable through /admin/prompt, and it used to
 * *replace* the entire prompt -- so an admin could remove the instruction to
 * answer only from retrieved policy, or to say plainly when the policy does not
 * cover something, without any indication that they had. On a tool that states
 * statutory obligations about minors, those are not style preferences. They
 * live here and are prepended to every guidance call. (OQ-4)
 */
const CORE_DIRECTIVES = `NON-NEGOTIABLE RULES (these override anything below):
- Base every requirement, deadline and citation on the policy excerpts supplied
  in this prompt. Do not state a district requirement that no excerpt supports.
- Never invent a policy code, a section number or a deadline. If you cannot
  find it in the excerpts, say so plainly.
- Do not present a federal or state requirement as if it were district
  procedure.
- Ask ONE clarifying question at a time when you need more information.
- When the policy does not cover the situation, say that directly and
  recommend confirming with the district's compliance officer or legal counsel.
  "I could not find this in the loaded policy" is a useful answer; a
  confidently wrong obligation is not.`;

/**
 * Tone, emphasis and district-specific context. Editable at /admin/prompt; this
 * is the fallback when no profile is active.
 */
const DEFAULT_ADVISOR_PROFILE = `You are a trusted compliance advisor helping school administrators navigate incident reporting and investigation procedures. Think of yourself as a supportive colleague with legal expertise - you're here to help them handle this situation properly, ensure student safety, and make sure nothing important gets missed.

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
   - Use "abuse_neglect" for any disclosure or suspicion of abuse or neglect of a child, including by someone outside the school
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
- Cite the exact provision you are relying on, as given with each excerpt, so they can look it up
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

Remember: You're here to help them navigate this successfully. Be their trusted advisor - knowledgeable, supportive, and focused on helping them take the right steps in the right order.`;

/**
 * Assemble the guidance prompt.
 *
 * Order is the contract: core directives first, then the configured profile,
 * then the retrieved policy, then the retrieval and coverage guards last, so
 * the guards are the most recent instruction the model reads. Exported for
 * test -- the property worth pinning is that no profile can displace the
 * core. (OQ-4)
 */
export function buildSystemPrompt({
  advisorProfile,
  policyContext,
  coverageNote = '',
}: {
  advisorProfile: string;
  policyContext: string;
  coverageNote?: string;
}): string {
  const head = `${CORE_DIRECTIVES}

${advisorProfile}`;

  if (policyContext.trim().length === 0) {
    return `${head}

Available Policy Context:
(none)

${NO_POLICY_RETRIEVED_GUARD}${coverageNote}`;
  }

  return `${head}

Available Policy Context:
Each excerpt below is preceded by the reference it came from. When you rely on
an excerpt, cite that reference exactly as written -- "JICK §F — Investigative
Procedures (RSA 193-F:4, II(k))" -- the way a source is cited in a report. Cite
only references that appear below; never invent a section number, and if an
excerpt carries only a policy name, cite the policy without a section.

${policyContext}${coverageNote}`;
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
        // Optional override for a gateway, proxy, or a local stub during
        // end-to-end tests. Anthropic calls are made server-side, so they
        // cannot be intercepted from the browser (which is why the old
        // page.route mock in e2e/ never worked -- TEST-3).
        ...(process.env.ANTHROPIC_BASE_URL
          ? { baseURL: process.env.ANTHROPIC_BASE_URL }
          : {}),
      });
    }

    return this.client;
  }

  /**
   * Get the active system prompt from database, or return default
   */
  private async getAdvisorProfile(): Promise<string | null> {
    try {
      const activePrompt = await prisma.systemPrompt.findFirst({
        where: { isActive: true },
        select: { content: true }
      });

      return activePrompt?.content || null;
    } catch (error) {
      console.warn('Failed to fetch active system prompt from database:', error);
      return null;
    }
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
    const startTime = Date.now();

    try {
      const client = this.getClient();

      logExternalAPI('Claude API', 'messages.create', undefined, undefined);

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

      const duration = Date.now() - startTime;
      const textContent = response.content[0];
      const totalTokens = response.usage.input_tokens + response.usage.output_tokens;

      // Approximate cost calculation (Claude 3.5 Sonnet pricing)
      // $3 per million input tokens, $15 per million output tokens
      const cost = (response.usage.input_tokens * 0.000003) + (response.usage.output_tokens * 0.000015);

      logAIOperation('generateResponse', this.model, totalTokens, duration, cost);

      return {
        content: textContent.type === 'text' ? textContent.text : '',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        stopReason: response.stop_reason || 'unknown',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logExternalAPI('Claude API', 'messages.create', duration, error as Error);
      logError(error as Error, { operation: 'generateResponse', model: this.model });
      throw new Error(`Failed to generate Claude response: ${error}`);
    }
  }

  /**
   * Generate a school compliance response with RAG context
   */
  async generateComplianceResponse(
    userQuery: string,
    policyContext: string,
    conversationHistory: ClaudeMessage[] = [],
    coverage?: PolicyCoverage
  ): Promise<ClaudeResponse> {
    // The editable half only. The core directives below are not editable.
    const advisorProfile = (await this.getAdvisorProfile()) ?? DEFAULT_ADVISOR_PROFILE;


    // Append policy context to the system prompt (whether from database or default).
    //
    // When retrieval returned nothing, the previous code spliced in an empty
    // string under the "Available Policy Context:" header and left the
    // instruction to "Reference specific policy codes (e.g. JICK, ACAC, JLF)"
    // standing -- so the model had nothing to cite but those in-prompt examples
    // and attributed district deadlines to policies it was never given.
    // Given FLOW-4/FLOW-5/FLOW-22 that is the common path, not an edge case.
    // The branch now lives in buildSystemPrompt. (FLOW-3, SPEC-3)
    //
    // Local policy is expected to implement the federal and state floor, so
    // its absence is a compliance gap the administrator should hear about --
    // not something to paper over by citing the statute as if it were the
    // district's own procedure.
    const coverageNote = buildCoverageNote(coverage);

    const finalSystemPrompt = buildSystemPrompt({
      advisorProfile,
      policyContext,
      coverageNote,
    });

    const messages: ClaudeMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: userQuery,
      },
    ];

    return this.generateResponse(messages, finalSystemPrompt);
  }

  /**
   * Classify an incident and determine required actions
   */
  async classifyIncident(
    incidentDescription: string,
    policyContext?: string
  ): Promise<ClassificationResult> {
    const startTime = Date.now();

    const systemPrompt = `You are a school incident classification expert. Analyze the incident and provide structured classification.

Respond with a JSON object containing:
{
  "type": "bullying" | "title_ix" | "harassment" | "violence" | "substance" | "abuse_neglect" | "other",
  "severity": "low" | "medium" | "high" | "critical",
  "reasoning": "Brief explanation of why this classification was chosen",
  "requiredActions": [
    { "description": "Action 1", "dueInHours": 24 },
    { "description": "Action 2", "dueInHours": 120 }
  ],
  "timeline": ["Immediate: ...", "Within 24h: ...", "Within 5 days: ...", ...],
  "stakeholders": ["Administrator", "Parents", "Counselor", ...]
}

Every entry in requiredActions MUST carry its own "dueInHours" deadline,
counted from now. Use the shortest legally required window for that specific
action -- e.g. a mandatory DCYF or police report is typically 24 hours, not a
default. Do not rely on the "timeline" array to date the actions; that array
is narrative only.

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
      const classification = classificationSchema.parse(
        JSON.parse(extractJsonObject(response.content))
      );

      const duration = Date.now() - startTime;
      logAIOperation('classifyIncident', this.model, undefined, duration);

      return classification;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(error as Error, {
        operation: 'classifyIncident',
        rawResponse: response.content.substring(0, 200),
        duration,
      });

      // Return a safe default
      return {
        type: 'other',
        severity: 'medium',
        reasoning: 'Unable to automatically classify. Manual review required.',
        requiredActions: [
          { description: 'Review incident details', dueInHours: 24 },
          { description: 'Contact administrator', dueInHours: 24 },
        ],
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
  /**
   * Re-derive an incident's obligations with the retrieved policy in front of
   * the model, and make it say which excerpt each deadline came from.
   *
   * Classification has to run before retrieval -- the categories it produces
   * are what retrieval filters on -- so at classification time there is no
   * policy to consult, and the deadlines it produced were the model's recall
   * of state law. This is the second pass that closes the loop.
   *
   * The attribution is a claim, not a fact: `sourceExcerpt` is resolved
   * against the excerpts actually supplied, and one that does not resolve is
   * recorded as model-sourced. (OQ-5)
   */
  async deriveObligations(
    description: string,
    policyContext: string
  ): Promise<{ obligations: DerivedObligation[]; usage: ClaudeResponse['usage'] }> {
    if (!policyContext.trim()) {
      return { obligations: [], usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const systemPrompt = `You are a school district compliance attorney. Given an incident and the policy excerpts retrieved for it, list the actions the administrator must take.

Each excerpt is numbered, like "[2] JICK §D — Procedures for Reporting (RSA 193-F:4, II(f) - (h))".

For every action, you MUST decide where its deadline comes from:
- If a supplied excerpt states the deadline, set "sourceExcerpt" to that excerpt's number.
- If no supplied excerpt states it, set "sourceExcerpt" to null. Do NOT guess a number, and do NOT cite an excerpt that does not actually state the deadline. An action with a null source is still worth listing — it will be shown to the administrator as unverified, which is accurate and useful. Attributing it to an excerpt that does not support it is not.

Return ONLY valid JSON:
{
  "obligations": [
    { "description": "...", "dueInHours": 24, "sourceExcerpt": 2 },
    { "description": "...", "dueInHours": 72, "sourceExcerpt": null }
  ]
}`;

    const request = `INCIDENT:
${description}

RETRIEVED POLICY EXCERPTS:
${policyContext}`;

    const response = await this.generateResponse(
      [{ role: 'user', content: request }],
      systemPrompt,
      { temperature: 0.2, maxTokens: 1500 }
    );

    try {
      const parsed = derivedObligationsSchema.parse(
        JSON.parse(extractJsonObject(response.content))
      );
      return { obligations: parsed.obligations, usage: response.usage };
    } catch (error) {
      // A parse failure must not invent obligations. Returning none leaves the
      // first-pass ones in place, recorded as model-sourced, which is what they
      // are.
      console.error('deriveObligations: could not parse response', error);
      return { obligations: [], usage: response.usage };
    }
  }

  async generateChatSummary(
    conversationHistory: ClaudeMessage[],
    policyContext: string,
    coverage?: PolicyCoverage
  ): Promise<ClaudeResponse> {
    // The summary is persisted and rendered in the incident timeline, so it is
    // the artefact most likely to be printed and filed. It therefore gets the
    // same retrieval guard the guidance path has, not a weaker one. (B4)
    const hasPolicyContext = policyContext.trim().length > 0;
    const systemPrompt = `You are a school district attorney reviewing an incident consultation session. Generate a comprehensive summary report for the administrator's records.

Your summary MUST include these sections:

## INCIDENT SUMMARY
- Brief overview of what the administrator reported
- Key facts gathered during the consultation
- Incident classification and severity assessment

## POLICY ANALYSIS
- List each policy referenced during the consultation, citing it exactly as it appears in the excerpts below
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

Format the summary professionally, as it may become part of the incident file. Be specific, cite only policies that appear in the excerpts below, and use exact timelines only where the conversation or an excerpt states them.`;

    const conversationText = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'Administrator' : 'Counsel'}: ${msg.content}`)
      .join('\n\n');

    const summaryRequest = `Please generate a comprehensive end-of-chat summary based on this consultation:

CONVERSATION TRANSCRIPT:
${conversationText}

POLICIES REFERENCED DURING CONSULTATION:
${hasPolicyContext ? policyContext : '(none retrieved)'}

Generate the summary following the required format above.`;

    const finalSystemPrompt = hasPolicyContext
      ? `${systemPrompt}${buildCoverageNote(coverage)}`
      : `${systemPrompt}

${NO_POLICY_RETRIEVED_GUARD}

This applies to the POLICY ANALYSIS section too: leave it empty rather than
naming a policy, and say that none could be retrieved for this incident.${buildCoverageNote(coverage)}`;

    const response = await this.generateResponse(
      [{ role: 'user', content: summaryRequest }],
      finalSystemPrompt,
      { temperature: 0.3, maxTokens: 2048 }
    );

    return response;
  }

  /**
   * Generate a concise title for an incident based on the first message
   * Similar to how Claude automatically names conversations
   */
  async generateIncidentTitle(firstMessage: string): Promise<string> {
    const startTime = Date.now();

    const systemPrompt = `You are an expert at creating concise, descriptive titles for school incident reports.

Based on the incident description provided, generate a short title that:
- Is 3-6 words maximum
- Captures the key type of incident (e.g., "Student Fight", "Bus Misconduct", "Bullying Report")
- Is professional and suitable for school records
- Does not include student names or identifying details

Respond with ONLY the title text, nothing else. No quotes, no punctuation at the end, no explanations.

Examples:
- "Student Altercation During Lunch"
- "Bus Conduct Incident"
- "Playground Bullying Report"
- "Classroom Disruption Event"
- "Title IX Harassment Complaint"`;

    try {
      const response = await this.generateResponse(
        [{ role: 'user', content: firstMessage }],
        systemPrompt,
        { temperature: 0.5, maxTokens: 50 }
      );

      // Clean up the response
      let title = response.content.trim();

      // Remove quotes if present
      title = title.replace(/^["']|["']$/g, '');

      // Remove ending punctuation
      title = title.replace(/[.!?]$/, '');

      // Fallback if title is too long or empty
      if (!title || title.length > 60) {
        return 'New Incident Report';
      }

      const duration = Date.now() - startTime;
      logAIOperation('generateIncidentTitle', this.model, undefined, duration);

      return title;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError(error as Error, { operation: 'generateIncidentTitle', duration });
      return 'New Incident Report';
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
