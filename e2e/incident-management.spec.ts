import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * Ids of rows owned by the *other* user, written by global-setup. A test that
 * must prove it cannot reach something needs the real id of that something.
 */
function seededIds(): { adminIncidentId: string; adminObligationId: string } {
  return JSON.parse(readFileSync('e2e/.auth/seed.json', 'utf8'));
}

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
    // limit=100: earlier specs create incidents, and the seeded one must not
    // depend on landing inside the default page of ten.
    const list = await page.request.get('/api/incidents?status=open&limit=100');
    const { incidents } = await list.json();
    const target = incidents.find((i: { title: string }) => i.title === SEEDED_OPEN);
    expect(target, `seeded incident "${SEEDED_OPEN}" not found`).toBeTruthy();

    await page.goto(`/incidents/${target.id}`);

    await expect(page.getByText(SEEDED_OPEN)).toBeVisible();
    await expect(page.getByText('repeatedly targeted', { exact: false })).toBeVisible();
  });

  test('closing an incident persists across a reload and stamps closedAt', async ({ page }) => {
    const list = await page.request.get('/api/incidents?status=open&limit=100');
    const { incidents } = await list.json();
    const target = incidents.find((i: { title: string }) => i.title === SEEDED_OPEN);
    expect(target, `seeded incident "${SEEDED_OPEN}" not found`).toBeTruthy();

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
    // This used to assert only that the *list* omitted it, which the test above
    // already covers -- so deleting incidentScope from the by-id handlers left
    // it green while every reporter could read and rewrite every incident in
    // the district. That is SEC-7. Attempt the id itself. (TEST-28)
    const { adminIncidentId } = seededIds();

    const read = await page.request.get(`/api/incidents/${adminIncidentId}`);
    expect(read.status()).toBe(404);

    const write = await page.request.patch(`/api/incidents/${adminIncidentId}`, {
      data: { status: 'closed' },
    });
    expect(write.status()).toBe(404);

    // 404 and not 403: an id must not be confirmed to someone who may not read
    // it. And the list must still omit it.
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
    // This used to PATCH 'does-not-exist-id', which 404s whether or not the
    // handler scopes through the incident -- so removing that scope, and
    // letting any user discharge any obligation in the district, left the test
    // green. The fixture now seeds an obligation on the admin's incident so
    // there is a real foreign row to attempt. (TEST-27)
    const { adminObligationId } = seededIds();

    const foreign = await page.request.patch(`/api/obligations/${adminObligationId}`, {
      data: { status: 'completed' },
    });
    expect(foreign.status()).toBe(404);

    // It is not enough that the call was refused: the row must be untouched.
    const list = await page.request.get('/api/obligations');
    const { obligations } = await list.json();
    expect(
      obligations.some((o: { id: string }) => o.id === adminObligationId)
    ).toBe(false);
  });

  test('shows the empty state when nothing is outstanding', async ({ page }) => {
    // Production sits in exactly this state after clearing test data, and
    // nothing covered it: the queue rendered from a non-empty fixture every
    // time. Discharge everything, then assert the empty state rather than a
    // bare or broken queue.
    const list = await page.request.get('/api/obligations');
    const { obligations } = await list.json();

    for (const o of obligations) {
      const res = await page.request.patch(`/api/obligations/${o.id}`, {
        data: { status: 'completed' },
      });
      expect(res.ok()).toBe(true);
    }

    const after = await page.request.get('/api/obligations');
    expect((await after.json()).counts.open).toBe(0);

    await page.goto('/');
    await expect(page.getByText('Nothing outstanding')).toBeVisible();
    // The headline must not claim lateness when there is none.
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('late');
    // And the way in is still there.
    await expect(page.getByRole('link', { name: 'Report an incident' })).toBeVisible();
  });

  test('rejects an invalid obligation status', async ({ page }) => {
    // `window=all` includes completed obligations, so this does not depend on
    // any still being open -- another test in this file discharges them.
    const list = await page.request.get('/api/obligations?window=all');
    const { obligations } = await list.json();
    expect(obligations.length).toBeGreaterThan(0);

    const response = await page.request.patch(`/api/obligations/${obligations[0].id}`, {
      data: { status: 'banana' },
    });
    expect(response.status()).toBe(400);
  });
});

/**
 * A generated summary is part of the incident record, not a throwaway view.
 * The incident-page endpoint used to return one and store nothing, so it was
 * lost on refresh after being paid for. (SPEC-35)
 */
test.describe('Incident summary', () => {
  test('persists, survives a reload, and is not replayed as chat context', async ({ page }) => {
    // An incident with a real conversation to summarise.
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill(
      'A student is being bullied repeatedly by a classmate during recess.'
    );
    const [chat] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);
    const { incidentId } = await chat.json();

    const before = await page.request.get(`/api/incidents/${incidentId}`);
    const conversationsBefore = (await before.json()).conversations.length;

    const gen = await page.request.post(`/api/incidents/${incidentId}/summary`);
    expect(gen.status()).toBe(200);
    const { data } = await gen.json().then((b: { data?: unknown }) => (b.data ? b : { data: b }));
    expect((data as { summary: string }).summary.length).toBeGreaterThan(0);

    // Recorded against the file, so a reload still has it.
    const after = await page.request.get(`/api/incidents/${incidentId}`);
    const incident = await after.json();
    expect(incident.conversations.length).toBe(conversationsBefore + 1);
    const summaryRow = incident.conversations.find(
      (c: { sender: string }) => c.sender === 'summary'
    );
    expect(summaryRow, 'summary was not stored against the incident').toBeTruthy();

    // Its own sender, so later turns do not replay it back to the model.
    expect(summaryRow.sender).not.toBe('assistant');

    // And it shows in the timeline as what it is.
    await page.goto(`/incidents/${incidentId}`);
    await expect(page.getByText('Summary generated')).toBeVisible();
  });

  test('refuses to summarise an incident with no conversation', async ({ page }) => {
    const created = await page.request.post('/api/incidents', {
      data: { title: 'Empty incident', description: 'Filed with no conversation yet.' },
    });
    const { incident } = await created.json();

    const gen = await page.request.post(`/api/incidents/${incident.id}/summary`);
    expect(gen.status()).toBe(400);
  });

  test('does not summarise another user\'s incident', async ({ page }) => {
    // A real foreign id, not a nonexistent one: generating a summary reads the
    // whole transcript, so an unscoped handler here discloses the most of any
    // route in the app. (TEST-28)
    const { adminIncidentId } = seededIds();
    const gen = await page.request.post(`/api/incidents/${adminIncidentId}/summary`);
    expect(gen.status()).toBe(404);

    const missing = await page.request.post('/api/incidents/does-not-exist/summary');
    expect(missing.status()).toBe(404);
  });
});
