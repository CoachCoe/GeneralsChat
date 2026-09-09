import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { TEST_USERS, deleteUserByEmail, setUserRole } from './support/seed';

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

/**
 * SEC-19. Role was read off the JWT, and the `jwt` callback only writes it at
 * sign-in -- so a demotion took effect no sooner than the token expired, and
 * `updateAge` rolls the token forward on activity, meaning an administrator
 * demoted mid-shift kept administrator access for as long as they kept working.
 * There was no mechanism to revoke anything at all.
 *
 * Both tests act on a session that is already signed in, because that is the
 * only state in which the bug exists. Signing in again would mint a token
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
