import { test, expect } from '@playwright/test';
import { STUB_REPLY } from './support/claude-stub';

/**
 * Every assertion here is one that can fail.
 *
 * The previous version of this file could never have passed: it looked for
 * `[placeholder*="message"]` (case-sensitive, against "Message General...")
 * and `button:has-text("Send")` against an icon-only button with no text node.
 * Six of its seven tests timed out on the locator, and the one that "passed"
 * asserted `expect(locator).toBeTruthy()`, which is true for any Locator.
 * (TEST-2, TEST-8, TEST-9)
 */
test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
  });

  test('renders the composer', async ({ page }) => {
    await expect(page.getByTestId('chat-input')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  });

  test('send button is disabled until there is input', async ({ page }) => {
    const send = page.getByRole('button', { name: 'Send message' });
    await expect(send).toBeDisabled();

    await page.getByTestId('chat-input').fill('A student was pushed at recess.');
    await expect(send).toBeEnabled();
  });

  test('sends a message and renders the assistant reply', async ({ page }) => {
    const message = 'A student was repeatedly targeted by a peer during recess today.';

    await page.getByTestId('chat-input').fill(message);

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.incidentId).toBeTruthy();
    expect(body.response).toContain('superintendent');

    // The user's own text and the assistant's reply are both on screen.
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByText(STUB_REPLY, { exact: false })).toBeVisible();
  });

  test('shows a loading indicator while the request is in flight', async ({ page }) => {
    // Stall the response so the indicator is observable deterministically,
    // rather than racing a timer that resolved true regardless. (TEST-9)
    await page.route('**/api/chat', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.getByTestId('chat-input').fill('A student disclosed an incident to me.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByTestId('chat-loading')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await expect(page.getByTestId('chat-loading')).toBeHidden({ timeout: 20_000 });
  });

  test('creates an incident that then appears in the sidebar and the incident list', async ({ page }) => {
    const message = 'Two students were involved in a physical altercation in the hallway.';

    await page.getByTestId('chat-input').fill(message);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);
    const { incidentId } = await response.json();
    expect(incidentId).toBeTruthy();

    // Persisted, not just rendered.
    const detail = await page.request.get(`/api/incidents/${incidentId}`);
    expect(detail.status()).toBe(200);
    const incident = await detail.json();
    expect(incident.description).toBe(message);
    expect(incident.status).toBe('open');
    expect(incident.conversations.length).toBeGreaterThanOrEqual(2);

    await page.goto('/incidents');
    await expect(page.getByText(incident.title, { exact: false }).first()).toBeVisible();
  });
});
