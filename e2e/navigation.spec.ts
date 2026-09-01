import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('navigates to the main pages from the navbar', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Generals Chat|School Compliance/i);

    await page.click('a[href="/chat"]');
    await page.waitForURL('**/chat');
    // The chat page has no <h1>; the composer is the real signal it rendered.
    await expect(page.getByTestId('chat-input')).toBeVisible();

    await page.click('a[href="/incidents"]');
    await page.waitForURL('**/incidents');
    await expect(page.getByRole('heading', { name: 'Incidents', level: 1 })).toBeVisible();
  });

  test('navbar links are present on every page', async ({ page }) => {
    for (const url of ['/', '/chat', '/incidents']) {
      await page.goto(url);
      const navbar = page.locator('nav[aria-label="Main"]');
      await expect(navbar).toBeVisible();
      await expect(navbar.locator('a[href="/chat"]').first()).toBeVisible();
      await expect(navbar.locator('a[href="/incidents"]').first()).toBeVisible();
    }
  });

  test('the navbar offers a reporter only what they can actually reach', async ({ page }) => {
    // "Policies" pointed at /admin/policies for every role, so a reporter
    // clicking it was bounced to the home queue with no explanation, and the
    // read-only library README documents was reachable only by typing the URL.
    // The admin-only "Advisor" link had the same problem. (SPEC-50)
    await page.goto('/');
    const navbar = page.locator('nav[aria-label="Main"]');

    await expect(navbar.locator('a[href="/policies"]').first()).toBeVisible();
    await expect(navbar.locator('a[href="/admin/policies"]')).toHaveCount(0);
    await expect(navbar.locator('a[href="/admin/prompt"]')).toHaveCount(0);

    // And the link goes somewhere the reporter can actually use.
    await navbar.locator('a[href="/policies"]').first().click();
    await expect(page).toHaveURL(/\/policies$/);
    await expect(page.getByRole('link', { name: 'Manage policies' })).toHaveCount(0);
  });

  test('a reporter cannot reach the admin pages', async ({ page }) => {
    // Redirected away rather than shown the admin UI. (SEC-6)
    await page.goto('/admin/policies');
    await expect(page).toHaveURL(/\/$|\/login/);
    await expect(page.getByRole('heading', { name: 'Policy Management' })).toHaveCount(0);
  });

  test('a reporter cannot call the admin API, only the admin pages were guarded', async ({
    page,
  }) => {
    // The page redirect above was the only admin coverage there was. Deleting
    // requireRole('admin') from the policy DELETE handler lets any reporter
    // remove the district's bullying procedure from every future retrieval,
    // and nothing failed. These are the nine handlers that guard actually
    // holds. (TEST-35)
    const attempts: [('post' | 'put' | 'patch' | 'delete'), string][] = [
      ['post', '/api/admin/policies'],
      ['put', '/api/admin/policies/any-id'],
      ['delete', '/api/admin/policies/any-id'],
      ['post', '/api/admin/policies/upload'],
      ['post', '/api/admin/prompts'],
      ['put', '/api/admin/prompts/any-id'],
      ['delete', '/api/admin/prompts/any-id'],
    ];

    for (const [method, url] of attempts) {
      const response = await page.request[method](url, { data: {} });
      // 403, not 404: the caller is authenticated and the route exists — it is
      // the role that is insufficient. Scoping hides rows; roles refuse verbs.
      expect(
        response.status(),
        `${method.toUpperCase()} ${url} should be refused for a reporter`
      ).toBe(403);
    }

    // The third ingestion route is gone: called by nothing, and outside the
    // /api/admin prefix the middleware gates, so its handler guard was the only
    // thing holding. Reading the library is still allowed. (OQ-2)
    const removed = await page.request.post('/api/policies', { data: {} });
    expect(removed.status()).toBe(405);
    expect((await page.request.get('/api/policies?active=true')).status()).toBe(200);
  });

  test('the health probe is reachable without a session and says nothing else', async ({
    browser,
  }) => {
    // Container platforms probe without credentials, so this is the one route
    // outside the deny-by-default gate. It must stay reachable, and it must
    // stay uninformative -- no version, no environment, no dependency status.
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const response = await anonymous.request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    await anonymous.close();
  });

  test('signing out ends the session', async ({ page, context }) => {
    await page.goto('/');
    await page.getByText('Settings').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login**');

    // The session cookie is gone, so a protected API call is refused.
    const response = await context.request.get('/api/incidents');
    expect(response.status()).toBe(401);
  });
});

test.describe('Policy library', () => {
  test('a non-admin can read the library but not manage it', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByRole('heading', { name: 'Policy library', level: 1 })).toBeVisible();

    // Seeded fixtures include federal, state and district policies.
    await expect(page.getByText('Policy JICK: Bullying Prevention')).toBeVisible();

    // Management stays admin-only; a reporter gets no route into it.
    await expect(page.getByRole('link', { name: 'Manage policies' })).toHaveCount(0);
  });
});
