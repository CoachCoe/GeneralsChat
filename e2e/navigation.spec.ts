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

  test('a reporter cannot reach the admin pages', async ({ page }) => {
    // Redirected away rather than shown the admin UI. (SEC-6)
    await page.goto('/admin/policies');
    await expect(page).toHaveURL(/\/$|\/login/);
    await expect(page.getByRole('heading', { name: 'Policy Management' })).toHaveCount(0);
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
