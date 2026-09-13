import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import {
  TEST_USERS,
  clearAdvisorProfiles,
  deleteUserByEmail,
  setUserRole,
} from './support/seed';

/** Admin-only routes, which the reporter project cannot reach. */
test.describe('Admin routes', () => {
  for (const route of ['/admin/policies', '/admin/prompt', '/policies']) {
    test(`${route} renders for an admin`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', err => errors.push(err.message));

      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator('nav[aria-label="Main"]')).toBeVisible();
      expect(errors).toHaveLength(0);
    });
  }

  test('an admin sees the route into policy management', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByRole('link', { name: 'Manage policies' })).toBeVisible();
  });

  test('an admin still sees the advisor-profile link a reporter does not', async ({ page }) => {
    // Gating the link on role must not hide it from the role it exists for.
    await page.goto('/');
    await expect(
      page.locator('nav[aria-label="Main"]').locator('a[href="/admin/prompt"]').first()
    ).toBeVisible();
  });
});

/**
 * Role must come from the user row, not the JWT: the `jwt` callback writes it
 * only at sign-in, and `updateAge` rolls the token forward on activity, so a
 * token-derived role would keep an administrator demoted mid-shift in place
 * for as long as they kept working.
 *
 * Both tests act on a session that is already signed in, because that is the
 * only state in which the bug can exist. Signing in again would mint a token
 * carrying the new role and prove nothing.
 */
test.describe('Revoking access', () => {
  test('a demoted admin loses admin access on the next request', async ({ context }) => {
    // Prove the access exists first, or the assertion below could pass because
    // the endpoint is broken rather than because the demotion worked.
    expect((await context.request.get('/api/admin/policies')).status()).toBe(200);

    const previous = await setUserRole(TEST_USERS.admin.email, 'reporter');
    try {
      const demoted = await context.request.get('/api/admin/policies');
      expect(demoted.status()).toBe(403);
    } finally {
      await setUserRole(TEST_USERS.admin.email, previous);
    }

    // Restored on the same session, with no sign-in in between -- which is the
    // other half of reading the role from the row rather than the token.
    expect((await context.request.get('/api/admin/policies')).status()).toBe(200);
  });

  test('a deleted account is unauthenticated, not merely unauthorised', async ({ browser }) => {
    /*
     * The session is the one `auth.setup.ts` minted, not one signed in here.
     * Signing in inside a test cannot work: `navigation.spec.ts` floods the
     * credentials endpoint until the limiter refuses it, by design, and this
     * project runs afterwards inside the same five-minute window.
     */
    const context = await browser.newContext({ storageState: STORAGE_STATE.revocable });
    try {
      expect((await context.request.get('/api/incidents')).status()).toBe(200);

      // The cookie is still valid and still correctly signed. What has gone is
      // the user it names, and that is enough: the session cannot be honoured,
      // and it cannot be reissued either, because sign-in would fail too.
      await deleteUserByEmail(TEST_USERS.revocable.email);

      const after = await context.request.get('/api/incidents');
      expect(after.status()).toBe(401);
    } finally {
      await context.close();
    }
  });
});

/**
 * `PUT /api/admin/policies/[id]` edits a row the guidance is already citing,
 * so an unchecked field here degrades a live policy rather than failing to
 * create one. Every other write path in the app goes through
 * `validateRequest`; asserting the schema in isolation would not catch this
 * one being wired back to a hand-rolled check of two fields.
 *
 * Only rejections are asserted against real values, so the seeded library is
 * unchanged by the run.
 */
test.describe('Policy update validation', () => {
  async function firstPolicy(request: import('@playwright/test').APIRequestContext) {
    const response = await request.get('/api/policies?active=true');
    expect(response.status()).toBe(200);
    const { policies } = await response.json();
    expect(policies.length).toBeGreaterThan(0);
    return policies[0] as { id: string; title: string };
  }

  test('refuses an empty title rather than blanking a live policy', async ({ page }) => {
    const policy = await firstPolicy(page.request);
    const response = await page.request.put(`/api/admin/policies/${policy.id}`, {
      data: { title: '' },
    });
    expect(response.status()).toBe(400);

    const after = await firstPolicy(page.request);
    expect(after.title).toBe(policy.title);
  });

  test('refuses a non-boolean isActive rather than 500ing in Prisma', async ({ page }) => {
    const policy = await firstPolicy(page.request);
    const response = await page.request.put(`/api/admin/policies/${policy.id}`, {
      data: { isActive: 'yes' },
    });
    expect(response.status()).toBe(400);
  });

  test('refuses a field the handler does not apply', async ({ page }) => {
    // `version` is a real column that no branch of the handler writes, so
    // accepting it would report a write that did not happen.
    const policy = await firstPolicy(page.request);
    const response = await page.request.put(`/api/admin/policies/${policy.id}`, {
      data: { version: 2 },
    });
    expect(response.status()).toBe(400);
  });

  test('still applies a valid update', async ({ page }) => {
    const policy = await firstPolicy(page.request);
    const response = await page.request.put(`/api/admin/policies/${policy.id}`, {
      data: { title: policy.title },
    });
    expect(response.status()).toBe(200);
  });
});

/**
 * One advisor profile, and both ways back to a known text.
 *
 * The fixture seeds no `SystemPrompt`, which is the state a district starts
 * in: the model is being sent the in-code default, so that is what the editor
 * must show rather than an empty box.
 */
test.describe('Advisor profile', () => {
  const editor = (page: import('@playwright/test').Page) =>
    page.getByLabel('Profile content');

  // These read real rows, and one asserts the state with nothing configured.
  test.beforeEach(async () => { await clearAdvisorProfiles(); });
  test.afterAll(async () => { await clearAdvisorProfiles(); });

  /*
   * Read-only for the testing round -- `ADVISOR_PROFILE_EDITABLE` in
   * `src/lib/ai/advisor-profile.ts`. What the model is told has to be one
   * thing, the same for every tester, so their reports can be compared.
   *
   * These assert what the system does now. When editing is restored, they are
   * rewritten with it; the saving behaviour they used to cover -- one row
   * reused, one level of undo, restore to the shipped text -- is still in
   * `saveActiveProfile` and its own tests.
   */
  test('shows the profile in force, and says it cannot be changed here', async ({ page }) => {
    await page.goto('/admin/prompt');

    // Seeing what the model is told is the point of the page: an admin who
    // cannot read it has no way to judge an answer they think is wrong.
    await expect(editor(page)).toContainText('trusted compliance advisor');
    await expect(editor(page)).toHaveAttribute('readonly', '');
    await expect(page.getByTestId('profile-status')).toHaveText('Using the shipped default');
    await expect(page.getByTestId('profile-read-only')).toBeVisible();
  });

  test('offers no control that would write', async ({ page }) => {
    await page.goto('/admin/prompt');

    for (const name of ['Save', 'Restore original', 'Undo last save']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
  });

  test('refuses a write even when the request is made directly', async ({ page }) => {
    // The page hiding a button is not the control. Both read the same flag, so
    // an admin with the API cannot do what the screen does not offer.
    const active = await page.request.put('/api/admin/prompts/active', {
      data: { content: 'Answer however you like.' },
    });
    expect(active.status()).toBe(403);
    expect((await active.json()).error).toContain('read-only');

    const created = await page.request.post('/api/admin/prompts', {
      data: { name: 'Sneaky', content: 'Answer however you like.' },
    });
    expect(created.status()).toBe(403);

    // And nothing was written.
    const { prompts } = await (await page.request.get('/api/admin/prompts')).json();
    expect(prompts).toHaveLength(0);
  });
});
