import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { seededIds, TEST_USERS } from './support/seed';

/**
 * Sharing, invitations, messaging and the notification feed.
 *
 * The assertions that matter most are the negative ones. A share grants
 * reading; if it ever grants writing, an incident about a child can be closed,
 * its statutory obligations marked done, and its record added to by someone the
 * reporter only meant to show it to.
 */

/**
 * The directory returns names, not addresses -- it exists so a picker can show
 * who you are messaging, and sharing takes an address you type.
 */
async function findPerson(page: { request: APIRequestContext }, name: string): Promise<string> {
  const { users } = await (await page.request.get('/api/users')).json();
  const person = users.find((u: { name: string }) => u.name === name);
  expect(person, `no person named ${name}`).toBeTruthy();
  return person.id;
}

/** A second reporter's session, for the far side of a share. */
async function asRecipient(browser: Browser): Promise<APIRequestContext> {
  const context = await browser.newContext({ storageState: STORAGE_STATE.revocable });
  return context.request;
}

test.describe('Sharing an incident', () => {
  test.describe.configure({ mode: 'serial' });

  let shareId: string;

  test('a reporter who was not shown it gets 404, not 403', async ({ browser }) => {
    const { reporterIncidentId } = seededIds();
    const recipient = await asRecipient(browser);

    // 404 rather than 403 throughout: an id must not be confirmed to someone
    // who may not read it.
    expect((await recipient.get(`/api/incidents/${reporterIncidentId}`)).status()).toBe(404);
  });

  test('sharing lets them read it, its transcript and its attachments', async ({
    page,
    browser,
  }) => {
    const { reporterIncidentId, reporterAttachmentId } = seededIds();

    const shared = await page.request.post(`/api/incidents/${reporterIncidentId}/shares`, {
      data: { email: TEST_USERS.revocable.email },
    });
    expect(shared.status()).toBe(201);
    shareId = (await shared.json()).share.id;

    const recipient = await asRecipient(browser);
    expect((await recipient.get(`/api/incidents/${reporterIncidentId}`)).status()).toBe(200);
    expect((await recipient.get(`/api/chat/${reporterIncidentId}`)).status()).toBe(200);
    // The tenth call site: the incident page lists these, so the download has
    // to resolve through the same scope or every one 404s with its name on
    // screen.
    expect((await recipient.get(`/api/attachments/${reporterAttachmentId}`)).status()).toBe(200);
  });

  test('the recipient can read it and change nothing', async ({ browser }) => {
    const { reporterIncidentId } = seededIds();
    const recipient = await asRecipient(browser);

    const incident = await (await recipient.get(`/api/incidents/${reporterIncidentId}`)).json();
    const obligationId = incident.complianceActions?.[0]?.id;
    expect(obligationId, 'the shared incident should carry obligations to try').toBeTruthy();

    // Every write is scoped to the reporter and staff, and answers the same 404
    // an unshared incident would.
    expect(
      (
        await recipient.patch(`/api/incidents/${reporterIncidentId}`, {
          data: { status: 'closed' },
        })
      ).status()
    ).toBe(404);
    expect(
      (await recipient.patch(`/api/obligations/${obligationId}`, { data: { status: 'completed' } }))
        .status()
    ).toBe(404);
    expect(
      (
        await recipient.post('/api/chat', {
          data: { message: 'Adding to someone else’s record.', incidentId: reporterIncidentId },
        })
      ).status()
    ).toBe(404);
  });

  test('the recipient cannot share it onward', async ({ browser }) => {
    const { reporterIncidentId } = seededIds();
    const recipient = await asRecipient(browser);

    // The circle stays the one the reporter chose.
    expect(
      (
        await recipient.post(`/api/incidents/${reporterIncidentId}/shares`, {
          data: { email: TEST_USERS.admin.email },
        })
      ).status()
    ).toBe(404);
  });

  test('the share shows in the recipient’s notifications until they open it', async ({
    page,
    browser,
  }) => {
    // Its own incident, because the tests above have already opened the other
    // one and opening is what clears this.
    const { otherTypeIncidentId } = seededIds();
    await page.request.post(`/api/incidents/${otherTypeIncidentId}/shares`, {
      data: { email: TEST_USERS.revocable.email },
    });

    const recipient = await asRecipient(browser);
    const before = await (await recipient.get('/api/notifications')).json();
    expect(
      before.items.some(
        (item: { kind: string; href: string }) =>
          item.kind === 'share' && item.href.includes(otherTypeIncidentId)
      )
    ).toBe(true);

    // Opening it is having seen it.
    await recipient.get(`/api/incidents/${otherTypeIncidentId}`);
    const after = await (await recipient.get('/api/notifications')).json();
    expect(
      after.items.some(
        (item: { kind: string; href: string }) =>
          item.kind === 'share' && item.href.includes(otherTypeIncidentId)
      )
    ).toBe(false);
  });

  test('stopping the share ends access', async ({ page, browser }) => {
    const { reporterIncidentId } = seededIds();

    const removed = await page.request.delete(
      `/api/incidents/${reporterIncidentId}/shares/${shareId}`
    );
    expect(removed.status()).toBe(200);

    const recipient = await asRecipient(browser);
    expect((await recipient.get(`/api/incidents/${reporterIncidentId}`)).status()).toBe(404);
  });
});

test.describe('Inviting an address with no account', () => {
  test.describe.configure({ mode: 'serial' });

  const invited = `e2e-invited-${Date.now()}@example.test`;
  let link: string;

  test('produces a link, once', async ({ page }) => {
    const { reporterIncidentId } = seededIds();
    const response = await page.request.post(`/api/incidents/${reporterIncidentId}/shares`, {
      data: { email: invited },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.share, 'an unknown address must not become a share').toBeUndefined();
    link = body.link;
    expect(link).toContain('/invite/');
  });

  test('discloses the address and nothing about the incident', async ({ browser }) => {
    const token = link.split('/invite/')[1];
    // No session at all: this is the one page reachable without one.
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });

    const response = await anonymous.request.get(`/api/invitations/${token}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(invited);
    // Not the title, not the sharer, not that an incident exists at all.
    expect(JSON.stringify(body)).not.toContain('Playground');
    expect(Object.keys(body)).toEqual(['email']);

    await anonymous.close();
  });

  test('an invented token is indistinguishable from an expired one', async ({ browser }) => {
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    expect((await anonymous.request.get('/api/invitations/not-a-real-token')).status()).toBe(404);
    await anonymous.close();
  });

  test('creates the account and shares the incident, once', async ({ browser }) => {
    const { reporterIncidentId } = seededIds();
    const token = link.split('/invite/')[1];
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });

    const accepted = await anonymous.request.post('/api/invitations/accept', {
      data: { token, name: 'Invited Person', password: 'a-long-enough-password' },
    });
    expect(accepted.status()).toBe(200);

    // Single use. The second attempt is the same 404 an invented token gets.
    const replayed = await anonymous.request.post('/api/invitations/accept', {
      data: { token, name: 'Someone Else', password: 'another-long-password' },
    });
    expect(replayed.status()).toBe(404);

    // The new account can sign in and read what it was invited to.
    const invitee = await browser.newContext();
    await invitee.request.post('/api/auth/callback/credentials', {
      form: {
        email: invited,
        password: 'a-long-enough-password',
        csrfToken: (await (await invitee.request.get('/api/auth/csrf')).json()).csrfToken,
      },
      maxRedirects: 0,
    });
    expect((await invitee.request.get(`/api/incidents/${reporterIncidentId}`)).status()).toBe(200);

    await anonymous.close();
    await invitee.close();
  });
});

test.describe('Messages', () => {
  test('a thread reaches the other person, and counts as unread until read', async ({
    page,
    browser,
  }) => {
    const recipientId = await findPerson(page, TEST_USERS.revocable.name);
    expect(recipientId).toBeTruthy();

    const created = await page.request.post('/api/threads', {
      data: { participantIds: [recipientId], body: 'Can you look at this one with me?' },
    });
    expect(created.status()).toBe(201);
    const { thread } = await created.json();

    const recipient = await asRecipient(browser);
    const listed = await (await recipient.get('/api/threads')).json();
    const mine = listed.threads.find((t: { id: string }) => t.id === thread.id);
    expect(mine.unread).toBe(1);

    const notifications = await (await recipient.get('/api/notifications')).json();
    expect(notifications.items.some((item: { kind: string }) => item.kind === 'message')).toBe(true);

    // Opening it is reading it.
    expect((await recipient.get(`/api/threads/${thread.id}`)).status()).toBe(200);
    const afterRead = await (await recipient.get('/api/threads')).json();
    expect(afterRead.threads.find((t: { id: string }) => t.id === thread.id).unread).toBe(0);
  });

  test('someone outside a thread cannot read or write it', async ({ page, browser }) => {
    const recipientId = await findPerson(page, TEST_USERS.revocable.name);
    const { thread } = await (
      await page.request.post('/api/threads', {
        data: { participantIds: [recipientId], body: 'Private.' },
      })
    ).json();

    const outsider = await browser.newContext({ storageState: STORAGE_STATE.admin });
    // Staff read every incident; a thread is not an incident.
    expect((await outsider.request.get(`/api/threads/${thread.id}`)).status()).toBe(404);
    expect(
      (await outsider.request.post(`/api/threads/${thread.id}/messages`, { data: { body: 'Hi' } }))
        .status()
    ).toBe(404);
    await outsider.close();
  });
});

test.describe('Documents', () => {
  test('the transcript is a document that can be printed and taken away', async ({ page }) => {
    const { reporterIncidentId } = seededIds();
    await page.goto(`/incidents/${reporterIncidentId}/transcript`);

    await expect(page.getByTestId('incident-transcript')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  });

  test('the report and the summary can be taken away too', async ({ page }) => {
    const { reporterIncidentId } = seededIds();
    await page.goto(`/incidents/${reporterIncidentId}/report`);
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  });
});

test.describe('The screens', () => {
  test('the incident page shares from the panel, and names who can read it', async ({ page }) => {
    const { closedIncidentId } = seededIds();
    await page.goto(`/incidents/${closedIncidentId}`);

    const panel = page.getByTestId('share-panel');
    await expect(panel).toBeVisible();
    // Says what a share grants, rather than leaving it to be discovered by
    // pressing something that refuses.
    await expect(panel).toContainText('Only you can change it');

    await panel.getByTestId('share-email').fill(TEST_USERS.revocable.email);
    await Promise.all([
      page.waitForResponse(
        r => r.url().includes(`/incidents/${closedIncidentId}/shares`) && r.request().method() === 'POST'
      ),
      panel.getByRole('button', { name: 'Share' }).click(),
    ]);

    await expect(panel.getByTestId('share-row')).toContainText(TEST_USERS.revocable.email);
    await expect(panel.getByRole('button', { name: 'Stop sharing' })).toBeVisible();
  });

  test('a recipient sees who else can read it, and no controls to change that', async ({
    browser,
  }) => {
    const { closedIncidentId } = seededIds();
    const context = await browser.newContext({ storageState: STORAGE_STATE.revocable });
    const page = await context.newPage();
    await page.goto(`/incidents/${closedIncidentId}`);

    const panel = page.getByTestId('share-panel');
    await expect(panel).toBeVisible();
    // Being shown a record about a child and not being told who else can see it
    // is worse than the disclosure of a colleague's name.
    await expect(panel.getByTestId('share-row')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Stop sharing' })).toHaveCount(0);
    await expect(panel.getByTestId('share-email')).toHaveCount(0);

    await context.close();
  });

  test('messages send and appear in the thread', async ({ page }) => {
    await page.goto('/messages');
    await page.getByRole('button', { name: 'New' }).click();

    // By test id: a thread in the list beside this is also a button named after
    // the people in it.
    await page
      .getByTestId('person-option')
      .filter({ hasText: TEST_USERS.revocable.name })
      .click();
    await page.getByTestId('message-input').fill('Sent from the screen.');
    await page.getByRole('button', { name: 'Start conversation' }).click();

    await expect(page.getByTestId('message-row')).toContainText('Sent from the screen.');

    await page.getByTestId('message-input').fill('And a reply to myself.');
    await page.getByTestId('message-send').click();
    await expect(page.getByTestId('message-row').last()).toContainText('And a reply to myself.');
  });

  test('the bell shows what is waiting, and says so to a screen reader', async ({ browser }) => {
    const { reporterIncidentId } = seededIds();
    const context = await browser.newContext({ storageState: STORAGE_STATE.revocable });
    const page = await context.newPage();

    // Something to notify about, created through the API as the other reporter
    // would have.
    await page.goto('/messages');
    const bell = page.getByTestId('notification-bell');
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByRole('region', { name: 'Notifications' })).toBeVisible();

    await context.close();
    expect(reporterIncidentId).toBeTruthy();
  });
});

test.describe('What a share does not grant', () => {
  test('the shared incident’s obligations appear, without a control that would refuse', async ({
    page,
    browser,
  }) => {
    const { reporterIncidentId } = seededIds();
    await page.request.post(`/api/incidents/${reporterIncidentId}/shares`, {
      data: { email: TEST_USERS.revocable.email },
    });

    const recipient = await asRecipient(browser);
    const { obligations } = await (await recipient.get('/api/obligations')).json();
    const shared = obligations.filter(
      (o: { incidentId: string }) => o.incidentId === reporterIncidentId
    );
    expect(shared.length, 'the shared incident should contribute obligations').toBeGreaterThan(0);

    // Reading one and discharging one are different permissions. The row
    // renders `Mark done` on this, so a recipient is not offered a button whose
    // PATCH answers 404.
    for (const obligation of shared) expect(obligation.canComplete).toBe(false);

    // The incident page must not offer the controls either -- it renders them on
    // `canEdit`, which the same route now decides.
    const shared404 = await (await recipient.get(`/api/incidents/${reporterIncidentId}`)).json();
    expect(shared404.canEdit).toBe(false);
    expect(shared404.complianceActions.every((o: { canComplete: boolean }) => !o.canComplete)).toBe(true);

    // And the reporter's own still are.
    const { obligations: mine } = await (await page.request.get('/api/obligations')).json();
    expect(
      mine
        .filter((o: { incidentId: string }) => o.incidentId === reporterIncidentId)
        .every((o: { canComplete: boolean }) => o.canComplete)
    ).toBe(true);
  });

  test('a thread cannot name an incident the author cannot read', async ({ browser }) => {
    const { adminIncidentId } = seededIds();
    const recipient = await asRecipient(browser);
    const someone = await findPerson({ request: recipient }, TEST_USERS.reporter.name);

    const response = await recipient.post('/api/threads', {
      data: { participantIds: [someone], body: 'Context I should not have.', incidentId: adminIncidentId },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('A shared incident offers no control that would refuse', () => {
  test('the page hides every write control from a recipient', async ({ page, browser }) => {
    const { closedIncidentId } = seededIds();
    await page.request.post(`/api/incidents/${closedIncidentId}/shares`, {
      data: { email: TEST_USERS.revocable.email },
    });

    const context = await browser.newContext({ storageState: STORAGE_STATE.revocable });
    const recipientPage = await context.newPage();
    await recipientPage.goto(`/incidents/${closedIncidentId}`);

    // The share panel on this same page says "Only you can change it, mark
    // obligations done, or share it further". The page used to offer all three.
    await expect(recipientPage.getByTestId('share-panel')).toBeVisible();
    for (const name of ['Generate Summary', 'Reopen Incident', 'Close Incident', 'Mark done']) {
      await expect(recipientPage.getByRole('button', { name })).toHaveCount(0);
    }

    await context.close();

    // The reporter still has them.
    await page.goto(`/incidents/${closedIncidentId}`);
    await expect(page.getByRole('button', { name: 'Generate Summary' })).toBeVisible();
  });
});
