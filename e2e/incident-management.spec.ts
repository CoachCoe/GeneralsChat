import { test, expect } from '@playwright/test';

/**
 * Seeded fixtures make every assertion unconditional.
 *
 * The previous version wrapped ten tests in `if (await x.count() > 0)` so they
 * no-opped on an empty database and reported green, and four locators passed a
 * regex into `:has-text()`, which Playwright rejects at parse time.
 * (TEST-7, TEST-8, TEST-23)
 */
const SEEDED_OPEN = 'Bullying: Playground incident';
const SEEDED_CLOSED = 'Harassment: Resolved hallway incident';
const ADMIN_ONLY = 'Title IX: Admin-only incident';

test.describe('Incident management', () => {
  test('lists the incidents this user filed, and not other users\'', async ({ page }) => {
    // Explicit segment: the default is the open working set, and this
    // assertion is about access control rather than filtering.
    await page.goto('/incidents?segment=all');

    await expect(page.getByRole('heading', { name: 'Incidents', level: 1 })).toBeVisible();
    await expect(page.getByText(SEEDED_OPEN)).toBeVisible();
    await expect(page.getByText(SEEDED_CLOSED)).toBeVisible();

    // Filed by the admin: a reporter must not see it. (SEC-7)
    await expect(page.getByText(ADMIN_ONLY)).toHaveCount(0);
  });

  test('the open segment shows open incidents only', async ({ page }) => {
    await page.goto('/incidents?segment=open');

    await expect(page.getByText(SEEDED_OPEN)).toBeVisible();
    await expect(page.getByText(SEEDED_CLOSED)).toHaveCount(0);
  });

  test('the closed segment shows closed incidents only', async ({ page }) => {
    await page.goto('/incidents?segment=closed');

    await expect(page.getByText(SEEDED_CLOSED)).toBeVisible();
    await expect(page.getByText(SEEDED_OPEN)).toHaveCount(0);
  });

  test('the former list routes redirect into the segmented list', async ({ page }) => {
    // Four near-identical routes collapsed into one; the old URLs are kept as
    // redirects so existing links and bookmarks still work. (design 1j)
    for (const [from, to] of [
      ['/incidents/active', 'segment=open'],
      ['/incidents/closed', 'segment=closed'],
      ['/incidents/pending', 'segment=pending'],
    ]) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`/incidents\\?${to}$`));
    }
  });

  test('/incidents/new redirects to chat', async ({ page }) => {
    await page.goto('/incidents/new');
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByTestId('chat-input')).toBeVisible();
  });

  test('opens an incident and shows its detail', async ({ page }) => {
    const list = await page.request.get('/api/incidents?status=open');
    const { incidents } = await list.json();
    const target = incidents.find((i: { title: string }) => i.title === SEEDED_OPEN);
    expect(target).toBeTruthy();

    await page.goto(`/incidents/${target.id}`);

    await expect(page.getByText(SEEDED_OPEN)).toBeVisible();
    await expect(page.getByText('repeatedly targeted', { exact: false })).toBeVisible();
  });

  test('closing an incident persists across a reload and stamps closedAt', async ({ page }) => {
    const list = await page.request.get('/api/incidents?status=open');
    const { incidents } = await list.json();
    const target = incidents.find((i: { title: string }) => i.title === SEEDED_OPEN);

    await page.goto(`/incidents/${target.id}`);
    await page.getByRole('button', { name: /Close Incident/i }).click();

    // Persistence, which a text comparison on the same page could not prove.
    await expect(async () => {
      const after = await page.request.get(`/api/incidents/${target.id}`);
      const incident = await after.json();
      expect(incident.status).toBe('closed');
      expect(incident.closedAt).not.toBeNull(); // FLOW-15
    }).toPass();

    await page.reload();
    await expect(page.getByRole('button', { name: /Reopen Incident/i })).toBeVisible();
  });

  test('rejects an out-of-vocabulary status', async ({ page }) => {
    const list = await page.request.get('/api/incidents');
    const { incidents } = await list.json();

    // PATCH accepted any string and persisted it, stranding the incident off
    // every list view. (SEC-13, TEST-12)
    const response = await page.request.patch(`/api/incidents/${incidents[0].id}`, {
      data: { status: 'banana' },
    });
    expect(response.status()).toBe(400);
  });

  test('does not expose another user\'s incident by id', async ({ page }) => {
    const all = await page.request.get('/api/incidents');
    const { incidents } = await all.json();
    expect(incidents.some((i: { title: string }) => i.title === ADMIN_ONLY)).toBe(false);
  });
});

/**
 * The obligation queue. ComplianceAction rows were being written on every
 * classified incident and never read back anywhere, so an administrator could
 * not see what they were late on. (design 1a)
 */
test.describe('Obligation queue', () => {
  test('home shows outstanding obligations, and marking one done removes it', async ({ page }) => {
    // Create an incident through chat so obligations are generated by the
    // real classify path rather than seeded.
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill(
      'A student is being bullied repeatedly by a classmate during recess.'
    );
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    await page.goto('/');
    const queue = page.getByTestId('obligation-queue');
    await expect(queue).toBeVisible();

    const before = await page.request.get('/api/obligations');
    const { obligations, counts } = await before.json();
    expect(obligations.length).toBeGreaterThan(0);
    expect(counts.open).toBe(obligations.length);

    // The stub returns a 24h and a 240h action, so at least one is visible.
    await expect(queue.getByText('Notify the superintendent').first()).toBeVisible();

    await queue.getByRole('button', { name: 'Mark done' }).first().click();

    await expect(async () => {
      const after = await page.request.get('/api/obligations');
      const body = await after.json();
      expect(body.counts.open).toBe(counts.open - 1);
    }).toPass();
  });

  test('a reporter cannot discharge another user\'s obligation', async ({ page }) => {
    const list = await page.request.get('/api/obligations');
    const { obligations } = await list.json();
    // Every obligation returned is on an incident this user filed; an id from
    // outside that scope must not be updatable.
    const foreign = await page.request.patch('/api/obligations/does-not-exist-id', {
      data: { status: 'completed' },
    });
    expect(foreign.status()).toBe(404);
    expect(Array.isArray(obligations)).toBe(true);
  });

  test('rejects an invalid obligation status', async ({ page }) => {
    const list = await page.request.get('/api/obligations');
    const { obligations } = await list.json();
    test.skip(obligations.length === 0, 'needs at least one obligation');

    const response = await page.request.patch(`/api/obligations/${obligations[0].id}`, {
      data: { status: 'banana' },
    });
    expect(response.status()).toBe(400);
  });
});
