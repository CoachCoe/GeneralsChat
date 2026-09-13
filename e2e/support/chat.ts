import { expect, type APIResponse } from '@playwright/test';

/**
 * The parsed body of a chat turn, having first asserted the turn was allowed.
 *
 * A refused POST -- rate limited, or a model outage -- carries no `incidentId`,
 * and every caller goes on to put one in a URL. Without this the failure
 * surfaces as a 404 on a later request in a test that did nothing wrong, which
 * is exactly how it surfaced in CI: two summary tests failing on an incident
 * their chat POST had never been allowed to create.
 */
export async function chatBody(response: APIResponse) {
  expect(response.ok(), `chat POST returned ${response.status()}`).toBe(true);
  return response.json();
}
