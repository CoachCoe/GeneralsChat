import { claudeService, ClaudeMessage } from './claude-service';
import { parseTurnLabel, type TurnKind } from './turn-label';
import type { PolicyCoverage } from '@/types';

/**
 * Raised when the upstream model call fails. Callers must surface this as an
 * error response, never persist its message as assistant guidance.
 */
export class LLMUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LLMUnavailableError';
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  /**
   * Whether this turn gives guidance or only asks for more information.
   *
   * The chat view shows the provenance block -- what the answer rests on, and
   * what the library does not cover -- only on a guidance turn. Anything that
   * cannot be read resolves to `guidance`, so the block is shown by default
   * and suppressed only on an explicit, well-formed question label.
   */
  kind: TurnKind;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * The single guidance entry point.
 *
 * `generateResponse`, `streamResponse` and `getDefaultSystemPrompt` are gone.
 * They assembled a guidance prompt of their own -- `getDefaultSystemPrompt()`
 * plus a bare `"\n\nRelevant Policy Context:\n" + policyContext` -- which
 * never went through `buildSystemPrompt`, so they carried neither
 * `CORE_DIRECTIVES` nor `NO_POLICY_RETRIEVED_GUARD`. The prompt they did use
 * instructed the model to "Cite specific policies when possible" and
 * "Highlight legal requirements and deadlines" with no guard and a possibly
 * empty context: exactly the SPEC-3/B4 failure mode, where the model has
 * nothing to cite but the examples in its own prompt and attributes district
 * deadlines to policies it was never given. CLAUDE.md: "Never assert policy
 * the system did not retrieve ... Don't remove that guard."
 *
 * `generateResponse` additionally swallowed every error and returned apology
 * text as `content` -- the FLOW-7 pattern that
 * `generateSchoolComplianceResponse` was changed to throw on, sitting one
 * function above the fix.
 *
 * They had no callers anywhere in `src`, `scripts` or `e2e`. Deleted rather
 * than left unused, for the reason `classifier.ts` gives for
 * `getDefaultClassification`: "a plausible-looking safe default is exactly
 * what someone would re-wire." If a streaming path is wanted later, build its
 * prompt through `buildSystemPrompt` so the guards cannot be omitted.
 * (SPEC-58, SEC-40, FLOW-59)
 */
export class LLMService {
  /**
   * Generate a school compliance-specific response
   */
  async generateSchoolComplianceResponse(
    userMessage: string,
    policyContext?: string,
    conversationHistory: ChatMessage[] = [],
    coverage?: PolicyCoverage
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
        claudeHistory,
        coverage
      );

      // Strip the turn label here, at the single guidance entry point, so no
      // caller can store or render it -- and so there is one place where an
      // unreadable label becomes `guidance` rather than several.
      const { kind, content } = parseTurnLabel(response.content);

      // A reply that is nothing but its own marker is a failed call, not a
      // blank answer to file under an incident. `generateResponse` already
      // throws on empty text; stripping can reach the same state one layer
      // later, and it has to end the same way -- as a 503 with nothing
      // written, never as an empty assistant turn. (FLOW-7)
      if (content.trim().length === 0) {
        throw new Error('Claude returned a turn label with no answer text');
      }

      return {
        content,
        kind,
        usage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
      };
    } catch (error) {
      console.error('School compliance response error:', error);

      // Rethrow rather than returning filler text. Swallowing the error here
      // made a failed model call indistinguishable from real guidance to the
      // caller, which then wrote the apology into the incident record as an
      // assistant turn stamped confidence: 0.9, replayed it as conversation
      // history, and folded it into the end-of-chat summary -- all behind an
      // HTTP 200. (FLOW-7, TEST-5)
      throw new LLMUnavailableError(
        "The compliance assistant is temporarily unavailable. For urgent matters, contact your district's compliance officer or legal counsel directly.",
        { cause: error }
      );
    }
  }

}

export const llmService = new LLMService();
