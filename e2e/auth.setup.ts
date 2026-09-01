import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { TEST_PASSWORD, TEST_USERS } from './support/seed';

/**
 * Signs in once per role and saves the session, so individual specs do not
 * each pay for a login. The old helpers had a `login()` that just navigated to
 * `/` and a `clearTestData()` that logged "implement if needed".
 */
for (const [role, user] of Object.entries(TEST_USERS)) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Landing anywhere other than /login proves the session was established.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await expect(page).toHaveURL(/localhost/);

    await page.context().storageState({
      path: STORAGE_STATE[role as keyof typeof STORAGE_STATE],
    });
  });
}
