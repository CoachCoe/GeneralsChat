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
    await page.goto('/incidents');

    await expect(page.getByRole('heading', { name: 'Incidents', level: 1 })).toBeVisible();
    await expect(page.getByText(SEEDED_OPEN)).toBeVisible();
    await expect(page.getByText(SEEDED_CLOSED)).toBeVisible();

    // Filed by the admin: a reporter must not see it. (SEC-7)
    await expect(page.getByText(ADMIN_ONLY)).toHaveCount(0);
  });

  test('active incidents page shows open incidents only', async ({ page }) => {
    // This page queried ?status=active, a value nothing ever writes, and threw
    // TypeError on every successful response. (FLOW-12, FLOW-13)
    await page.goto('/incidents/active');

    await expect(page.getByText(SEEDED_OPEN)).toBeVisible();
    await expect(page.getByText(SEEDED_CLOSED)).toHaveCount(0);
  });

  test('closed incidents page shows closed incidents only', async ({ page }) => {
    await page.goto('/incidents/closed');

    await expect(page.getByText(SEEDED_CLOSED)).toBeVisible();
    await expect(page.getByText(SEEDED_OPEN)).toHaveCount(0);
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
