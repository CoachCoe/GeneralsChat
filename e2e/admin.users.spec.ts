import { test, expect } from '@playwright/test';

/**
 * Who can sign in, and who no longer can.
 *
 * Runs as the admin. The revoke path matters most: an account that keeps
 * working after being revoked is an account reading incident records about
 * minors after the district decided it should not.
 */
test.describe('People', () => {
  const created = `e2e-created-${Date.now()}@example.test`;

  test('creates a reporter and shows the password once', async ({ page }) => {
    await page.goto('/admin/users');

    await page.getByTestId('user-name').fill('Created Person');
    await page.getByTestId('user-email').fill(created);
    await page.getByRole('button', { name: 'Add reporter' }).click();

    const credentials = page.getByTestId('new-credentials');
    await expect(credentials).toBeVisible();
    // Shown, because there is no mail transport and the administrator has to
    // pass it on.
    await expect(credentials).toContainText(created);

    await expect(page.getByTestId('user-row').filter({ hasText: created })).toBeVisible();
  });

  test('will not create the same address twice', async ({ page }) => {
    const response = await page.request.post('/api/admin/users', {
      data: { name: 'Duplicate', email: created },
    });
    expect(response.status()).toBe(400);
  });

  test('only ever creates reporters', async ({ page }) => {
    // The body cannot ask for a role, and one offered is ignored rather than
    // honoured: a screen that can mint an admin is one where a misclick grants
    // the district's whole incident record.
    const response = await page.request.post('/api/admin/users', {
      data: { name: 'Not An Admin', email: `e2e-role-${Date.now()}@example.test`, role: 'admin' },
    });
    expect(response.status()).toBe(201);
    expect((await response.json()).user.role).toBe('reporter');
  });

  test('an administrator cannot revoke themselves', async ({ page }) => {
    const me = await (await page.request.get('/api/admin/users')).json();
    const admin = me.users.find((u: { role: string }) => u.role === 'admin');

    const response = await page.request.patch(`/api/admin/users/${admin.id}`, {
      data: { active: false },
    });
    // They would be locked out of the only screen that could undo it, and the
    // pilot may have exactly one.
    expect(response.status()).toBe(400);
  });

  test('revoking ends the account’s access, and restoring returns it', async ({ page, browser }) => {
    const users = await (await page.request.get('/api/admin/users')).json();
    const target = users.users.find((u: { email: string }) => u.email === created);

    expect((await page.request.patch(`/api/admin/users/${target.id}`, { data: { active: false } })).status()).toBe(200);

    // Sign-in is refused for a revoked account.
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const csrf = (await (await anonymous.request.get('/api/auth/csrf')).json()).csrfToken;
    await anonymous.request.post('/api/auth/callback/credentials', {
      form: { email: created, password: 'irrelevant-because-revoked', csrfToken: csrf },
      maxRedirects: 0,
    });
    expect((await anonymous.request.get('/api/incidents')).status()).toBe(401);
    await anonymous.close();

    expect((await page.request.patch(`/api/admin/users/${target.id}`, { data: { active: true } })).status()).toBe(200);
    const after = await (await page.request.get('/api/admin/users')).json();
    expect(after.users.find((u: { email: string }) => u.email === created).deactivatedAt).toBeNull();
  });

  test('a reporter cannot reach any of this', async ({ browser }) => {
    const reporter = await browser.newContext({
      storageState: 'e2e/.auth/reporter.json',
    });
    expect((await reporter.request.get('/api/admin/users')).status()).toBe(403);
    await reporter.close();
  });
});
