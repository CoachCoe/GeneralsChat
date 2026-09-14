import { test, expect } from '@playwright/test';

/**
 * Who can sign in, and who no longer can.
 *
 * Runs as the admin. The revoke path matters most: an account that keeps
 * working after being revoked is an account reading incident records about
 * minors after the district decided it should not.
 */
test.describe('People', () => {
  // Declared, not incidental: the revocation test needs the password the create
  // test captured, so these must run in order and a retry of one alone would
  // otherwise sign in with `undefined`.
  test.describe.configure({ mode: 'serial' });

  const created = `e2e-created-${Date.now()}@example.test`;
  /**
   * Captured from the one screen that shows it. The revocation test below needs
   * the *correct* password: signing in with a wrong one is refused for every
   * account, so a 401 proves nothing about revocation.
   */
  let password: string;

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

    password = (await credentials.locator('code').innerText()).trim();
    expect(password.length).toBeGreaterThanOrEqual(12);

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

    /*
     * Sign in with the real password and report whether the session works.
     *
     * Each context carries its own `x-forwarded-for`. `navigation.spec.ts`
     * deliberately floods the credentials endpoint until the limiter refuses
     * it, and this project runs inside that five-minute window — so without a
     * bucket of its own this test would be refused for the one reason that
     * proves nothing about revocation. There is no proxy in front of the e2e
     * server, so the header is simply this test naming its own bucket.
     */
    let bucket = 0;
    const canSignIn = async () => {
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        extraHTTPHeaders: { 'x-forwarded-for': `198.51.100.${++bucket}` },
      });
      const csrf = (await (await context.request.get('/api/auth/csrf')).json()).csrfToken;
      await context.request.post('/api/auth/callback/credentials', {
        form: { email: created, password, csrfToken: csrf },
        maxRedirects: 0,
      });
      const status = (await context.request.get('/api/incidents')).status();
      await context.close();
      return status;
    };

    // Before: the account works. Without this the 401 below would hold for any
    // reason at all -- a wrong password, a broken endpoint, a typo in the email.
    expect(await canSignIn()).toBe(200);

    // A session held *before* revocation, to prove the next request is refused
    // rather than merely the next sign-in.
    const held = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.200' },
    });
    const heldCsrf = (await (await held.request.get('/api/auth/csrf')).json()).csrfToken;
    await held.request.post('/api/auth/callback/credentials', {
      form: { email: created, password, csrfToken: heldCsrf },
      maxRedirects: 0,
    });
    expect((await held.request.get('/api/incidents')).status()).toBe(200);

    expect((await page.request.patch(`/api/admin/users/${target.id}`, { data: { active: false } })).status()).toBe(200);

    // Sign-in is refused, and the cookie already in a browser stops working on
    // its next request -- the session names a user who may no longer act.
    expect(await canSignIn()).toBe(401);
    expect((await held.request.get('/api/incidents')).status()).toBe(401);
    await held.close();

    expect((await page.request.patch(`/api/admin/users/${target.id}`, { data: { active: true } })).status()).toBe(200);
    // Restoring gives access back, asserted by using it rather than by reading
    // the flag we just wrote.
    expect(await canSignIn()).toBe(200);
  });

  test('a reporter cannot reach any of this', async ({ browser }) => {
    const reporter = await browser.newContext({
      storageState: 'e2e/.auth/reporter.json',
    });
    expect((await reporter.request.get('/api/admin/users')).status()).toBe(403);
    await reporter.close();
  });
});
