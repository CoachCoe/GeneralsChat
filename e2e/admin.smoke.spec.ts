import { test, expect } from '@playwright/test';

/**
 * Admin-only routes, which the reporter project cannot reach and therefore
 * had no coverage at all before this.
 */
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
    // The other half of SPEC-50: gating the link on role must not hide it from
    // the role it exists for.
    await page.goto('/');
    await expect(
      page.locator('nav[aria-label="Main"]').locator('a[href="/admin/prompt"]').first()
    ).toBeVisible();
  });
});
