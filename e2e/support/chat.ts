import { expect } from '@playwright/test';

/**
 * The body of a chat turn, as POST /api/chat returns it.
 *
 * Named rather than left as the `any` Playwright's `json()` yields, so a field
 * renamed on the route fails the build here instead of reading as undefined in
 * an assertion that then passes.
 */
export interface ChatTurnBody {
  incidentId: string;
  response: string;
  kind: 'question' | 'guidance';
  citations: { policyId: string; title: string; jurisdiction: string; category: string }[];
  /** Null until the turn that classifies the incident. */
  classification: { type: string; severity?: string | null } | null;
  /** Always present, empty when the turn claimed nothing. */
  suggestedCompletions: { id: string; description: string }[];
}

/**
 * Structural, because the two ways a test gets a chat response are different
 * Playwright types: `page.waitForResponse` yields a `Response` and
 * `page.request.post` an `APIResponse`. Both answer these three.
 */
interface JsonResponse {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
}

/**
 * The parsed body, having first asserted the turn was allowed.
 *
 * A refused POST -- rate limited, or a model outage -- carries no `incidentId`,
 * and callers go on to put one in a URL. Without this the failure surfaces as a
 * 404 on a later request in a test that did nothing wrong, which is exactly how
 * it surfaced in CI: two summary tests failing on an incident their chat POST
 * had never been allowed to create.
 */
export async function chatBody(response: JsonResponse): Promise<ChatTurnBody> {
  expect(response.ok(), `chat POST returned ${response.status()}`).toBe(true);
  return (await response.json()) as ChatTurnBody;
}
