import { readFileSync } from 'fs';
import { test, expect } from '@playwright/test';
import { STUB_REPLY, STUB_QUESTION_REPLY } from './support/claude-stub';

/**
 * Every assertion here is one that can fail.
 *
 * The previous version of this file could never have passed: it looked for
 * `[placeholder*="message"]` (case-sensitive, against "Message General...")
 * and `button:has-text("Send")` against an icon-only button with no text node.
 * Six of its seven tests timed out on the locator, and the one that "passed"
 * asserted `expect(locator).toBeTruthy()`, which is true for any Locator.
 */
test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
  });

  test('renders the composer', async ({ page }) => {
    await expect(page.getByTestId('chat-input')).toBeVisible();
    // Both handles CLAUDE.md declares: the accessible name tests read by, and
    // the testid it also promises. A declared contract nothing asserts reads
    // as covered while being free to move.
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
    await expect(page.getByTestId('chat-send')).toBeVisible();
  });

  test('send button is disabled until there is input', async ({ page }) => {
    const send = page.getByRole('button', { name: 'Send message' });
    await expect(send).toBeDisabled();

    await page.getByTestId('chat-input').fill('A student was pushed at recess.');
    await expect(send).toBeEnabled();
  });

  test('sends a message and renders the assistant reply', async ({ page }) => {
    const message = 'A student was repeatedly targeted by a peer during recess today.';

    await page.getByTestId('chat-input').fill(message);

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.incidentId).toBeTruthy();
    expect(body.response).toContain('superintendent');

    // The user's own text and the assistant's reply are both on screen.
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByText(STUB_REPLY, { exact: false })).toBeVisible();
  });

  test('shows a loading indicator while the request is in flight', async ({ page }) => {
    // Stall the response so the indicator is observable deterministically,
    // rather than racing a timer that resolved true regardless.
    await page.route('**/api/chat', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.getByTestId('chat-input').fill('A student disclosed an incident to me.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByTestId('chat-loading')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await expect(page.getByTestId('chat-loading')).toBeHidden({ timeout: 20_000 });
  });

  test('creates an incident that then appears in the sidebar and the incident list', async ({ page }) => {
    const message = 'Two students were involved in a physical altercation in the hallway.';

    await page.getByTestId('chat-input').fill(message);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);
    const { incidentId } = await response.json();
    expect(incidentId).toBeTruthy();

    // Persisted, not just rendered.
    const detail = await page.request.get(`/api/incidents/${incidentId}`);
    expect(detail.status()).toBe(200);
    const incident = await detail.json();
    expect(incident.description).toBe(message);
    expect(incident.status).toBe('open');
    expect(incident.conversations.length).toBeGreaterThanOrEqual(2);

    await page.goto('/incidents');
    await expect(page.getByText(incident.title, { exact: false }).first()).toBeVisible();
  });
});

/**
 * Policies have two independent facets: jurisdiction (who issued it) and
 * category (what it covers). An incident normally implicates several
 * jurisdictions at once, and guidance has to assemble them -- the federal
 * floor, the state requirement, and the local procedure implementing both.
 */
test.describe('Policy retrieval across jurisdictions', () => {
  test('assembles guidance from federal, state and district policy', async ({ page }) => {
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill(
      'A student is being bullied repeatedly by a classmate during recess.'
    );

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    const body = await response.json();

    // The stub echoes which jurisdictions reached the system prompt.
    expect(body.response).toContain('FEDERAL');
    expect(body.response).toContain('STATE');
    expect(body.response).toContain('DISTRICT');

    // Citations name the policy, not a raw cuid.
    const titles = body.citations.map((c: { title: string }) => c.title);
    expect(titles).toContain('Policy JICK: Bullying Prevention');
    expect(titles).toContain('RSA 193-F: Pupil Safety and Violence Prevention');

    const jurisdictions = body.citations.map((c: { jurisdiction: string }) => c.jurisdiction);
    expect(new Set(jurisdictions).size).toBeGreaterThan(1);
  });

  test('renders the policies it referenced', async ({ page }) => {
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill(
      'A student is being bullied repeatedly by a classmate during recess.'
    );
    await page.getByRole('button', { name: 'Send message' }).click();

    // Citations were computed and returned but never displayed, so a user had
    // no way to check what the guidance was based on.
    const sources = page.getByTestId('chat-sources');
    await expect(sources).toBeVisible();
    await expect(sources).toContainText('Policy JICK: Bullying Prevention');
    // SourceLadder labels each rung by jurisdiction, highest authority first.
    await expect(sources).toContainText('Federal');
    await expect(sources).toContainText('State');
    await expect(sources).toContainText('District');
  });

  test('cites the specific provision a policy rests on, not just the policy', async ({ page }) => {
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill(
      'A student is being bullied repeatedly by a classmate during recess.'
    );
    await page.getByRole('button', { name: 'Send message' }).click();

    // Citing the whole policy tells an administrator where to start reading;
    // citing the provision tells them what they are relying on. The seeded
    // JICK policy is written with lettered sections and is chunked through the
    // production parser, so this asserts the section survives retrieval and is
    // rendered -- including the statute the section implements.
    const sources = page.getByTestId('chat-sources');
    await expect(sources).toContainText('JICK §D');
    await expect(sources).toContainText('Procedures for Reporting Bullying');
    await expect(sources).toContainText('RSA 193-F:4, II(f) - (h)');
  });

  test('mandatory reporting policy is retrieved for every incident type', async ({ page }) => {
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill(
      'A student disclosed something concerning about their home life to me today.'
    );

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    const body = await response.json();
    const categories = body.citations.map((c: { category: string }) => c.category);
    expect(categories).toContain('mandatory_reporting');
  });
});

test.describe('Local policy coverage', () => {
  test('flags categories with federal or state authority but no local policy', async ({ page }) => {
    await page.goto('/chat');
    // Classifies as violence, whose categories (school_safety, discipline,
    // emergency_operations) have no district or school policy in the fixture
    // set -- the situation the district most needs told to it.
    await page.getByTestId('chat-input').fill(
      'Two students got into a physical fight in the cafeteria this morning.'
    );

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    const body = await response.json();
    expect(body.coverage.categories).toContain('school_safety');

    // school_safety and emergency_operations have no policy at all in the
    // fixture set; discipline and mandatory_reporting do, and must not be
    // reported as gaps.
    //
    // school_safety carries a second job: the fixture seeds an active district
    // school_safety policy with NO chunks. Retrieval can never return it, so it
    // must not cancel this gap. Drop the `chunks: { some: {} }` predicate from
    // assessCoverage and this assertion fails -- which is the point.
    expect(body.coverage.categoriesWithoutLocalPolicy).toContain('school_safety');
    expect(body.coverage.byCategory.school_safety).toEqual([]);
    expect(body.coverage.categoriesWithoutLocalPolicy).toContain('emergency_operations');
    expect(body.coverage.categoriesWithoutLocalPolicy).not.toContain('discipline');

    // The stub echoes whether the coverage-gap instruction reached the prompt.
    expect(body.response).toContain('GAP');
  });

  test('does not flag a gap when district policy exists', async ({ page }) => {
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill(
      'A student is being bullied repeatedly by a classmate during recess.'
    );

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    const body = await response.json();
    // Every category a bullying incident implicates has a district policy.
    expect(body.coverage.byCategory.bullying).toEqual(
      expect.arrayContaining(['federal', 'state', 'district'])
    );
    expect(body.coverage.categoriesWithoutLocalPolicy).toEqual([]);
    expect(body.response).not.toContain('GAP');
  });
});

/**
 * The classification is the determination everything else follows from --
 * which policies apply and which clocks start -- so it has to be visible.
 * During a pilot with a deliberately narrow library it also answers the
 * question the maintainer actually asked: is this a bullying incident or not.
 */
test.describe('Classification and library scope', () => {
  test('shows what the incident was classified as', async ({ page }) => {
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill(
      'A student is being bullied repeatedly by a classmate during recess.'
    );
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    await expect(page.getByText('Classified as')).toBeVisible();
    await expect(page.getByText('Bullying', { exact: true })).toBeVisible();
  });

  test('says plainly when no local policy is loaded for the subject', async ({ page }) => {
    await page.goto('/chat');
    // Classifies as violence, whose categories have no district or school
    // policy in the fixture set at all.
    await page.getByTestId('chat-input').fill(
      'Two students got into a physical fight in the cafeteria this morning.'
    );
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    const body = await response.json();

    // Violence implicates school_safety, discipline, emergency_operations and
    // mandatory_reporting. The fixture covers the last two locally, so this is
    // a partial gap -- which is the honest answer, and the card that belongs.
    expect(body.coverage.categoriesWithoutLocalPolicy).toContain('school_safety');
    expect(body.coverage.categoriesWithoutLocalPolicy).toContain('emergency_operations');
    expect(body.coverage.categoriesWithoutLocalPolicy).not.toContain('discipline');

    // The rail reports the gap as a dashed local rung. It is the only telling
    // of it now -- the amber card that used to restate it under the answer
    // said, for a third time in one turn, what the ladder and the answer's own
    // prose already said.
    const sources = page.getByTestId('chat-sources');
    await expect(sources).toContainText('Nothing on file for');
    await expect(sources).toContainText('school safety');
    await expect(sources).toContainText('emergency operations');
    // Labelled, not the database slug an administrator should never meet.
    await expect(sources).not.toContainText('school_safety');
  });

  test('flags the whole subject as outside the library when nothing local covers it', async ({ page }) => {
    await page.goto('/chat');
    // Classifies as title_ix. The fixture has a FEDERAL Title IX policy but no
    // district or school one, and nothing at all for discrimination -- so every
    // category the subject is about lacks local cover. This is the pilot's
    // real shape: bullying loaded locally, other subjects not.
    await page.getByTestId('chat-input').fill(
      'A student reported unwanted sexual comments from a classmate in the corridor.'
    );
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    const body = await response.json();
    const subject = body.coverage.categories.filter((c: string) => c !== 'mandatory_reporting');
    expect(subject.length).toBeGreaterThan(0);
    expect(
      subject.every((c: string) => body.coverage.categoriesWithoutLocalPolicy.includes(c))
    ).toBe(true);

    // The note, not the partial-gap card.
    const note = page.getByRole('note');
    await expect(note).toContainText('no district or school policy is loaded');
    await expect(note).toContainText('confirm the district procedure');
    // And it names what it thinks the incident is, so the reader can disagree.
    await expect(note).toContainText('title ix');
  });

  test('a clarifying question carries no sources block, and the next answer does', async ({
    page,
  }) => {
    /*
     * The provenance block is a claim about the turn above it: these are the
     * policies it rests on. A turn that only asks "can you describe what
     * happened between them?" rests on nothing, and it was still shown the
     * full ladder plus an amber coverage-gap card -- vouching for an assertion
     * nobody had made, and repeating the gap warning on every turn until it
     * read as page furniture rather than a warning.
     *
     * Both halves are asserted in one test on purpose. Suppression alone would
     * pass if the block never rendered at all, which is the worse bug: a
     * statutory deadline shown with nothing behind it.
     */
    await page.goto('/chat');

    await page.getByTestId('chat-input').fill(
      "A student came to me about another student, I'm not sure what happened yet."
    );
    const [asked] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    const question = await asked.json();
    expect(question.kind).toBe('question');
    await expect(page.getByText(STUB_QUESTION_REPLY)).toBeVisible();
    await expect(page.getByTestId('chat-sources')).toHaveCount(0);

    // The marker is metadata. It must never reach the page.
    await expect(page.getByText('[[TURN:')).toHaveCount(0);

    // Retrieval still ran and the coverage is still known -- it describes the
    // incident, not this turn. Suppressing the block must not be implemented
    // by suppressing the retrieval behind it, or the next turn has nothing to
    // show.
    expect(question.citations.length).toBeGreaterThan(0);

    await page.getByTestId('chat-input').fill('It was repeated name-calling at recess.');
    const [answered] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    expect((await answered.json()).kind).toBe('guidance');
    await expect(page.getByText(STUB_REPLY)).toBeVisible();
    await expect(page.getByTestId('chat-sources')).toHaveCount(1);
    // The rail names what it is describing: the incident, not this one turn.
    await expect(page.getByRole('complementary', { name: 'Sources' })).toContainText(
      'This incident rests on'
    );
  });

  test('reopening a past incident still shows what each answer rested on', async ({ page }) => {
    /*
     * Provenance must survive the round trip, not live only in the browser
     * tab. A GET /api/chat/[id] returning id, type, content and timestamp
     * alone drops every citation the guidance rested on -- on a tool whose
     * answers exist to be checked, and whose record is the thing an
     * administrator goes back to weeks later.
     *
     * The turn kind survives the round trip too, so the distinction this
     * feature is built on is not a live-only nicety: the reopened question
     * turn is still bare and the reopened answer still carries its ladder.
     */
    await page.goto('/chat');

    await page.getByTestId('chat-input').fill(
      "A student came to me about another student, I'm not sure what happened yet."
    );
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);

    await page.getByTestId('chat-input').fill('It was repeated name-calling at recess.');
    const [answered] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);
    const { incidentId } = await answered.json();

    // Leave the conversation entirely and come back to it the way a user does.
    await page.reload();
    await expect(page.getByText(STUB_REPLY)).toHaveCount(0);
    await page
      .locator(`[data-testid="chat-history-item"][data-incident-id="${incidentId}"]`)
      .click();

    await expect(page.getByText(STUB_QUESTION_REPLY)).toBeVisible();
    await expect(page.getByText(STUB_REPLY)).toBeVisible();

    // One rail for the conversation, holding what the answer rested on. The
    // question contributed nothing to it -- it is the same claim it always
    // was, kept beside the transcript rather than under each turn.
    const sources = page.getByTestId('chat-sources');
    await expect(sources).toHaveCount(1);
    await expect(page.getByRole('complementary', { name: 'Sources' })).toContainText(
      'This incident rests on'
    );
    await expect(sources).toContainText('Policy JICK: Bullying Prevention');
    // Down to the provision, which is the half that makes a citation checkable.
    await expect(sources).toContainText('JICK §D');
  });

  test('opens the incident named in the URL, so an obligation can link here', async ({ page }) => {
    /*
     * The obligation queue and the incident page both send an administrator
     * back to the conversation. Reopening was previously reachable only by
     * clicking the sidebar, which is internal state and cannot be linked to.
     */
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill('Two students were fighting on the bus this morning.');
    const [answered] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);
    const { incidentId } = await answered.json();

    await page.goto(`/chat?incident=${incidentId}`);
    await expect(page.getByText(STUB_REPLY)).toBeVisible();
    await expect(
      page.locator(`[data-testid="chat-history-item"][data-incident-id="${incidentId}"]`)
    ).toHaveAttribute('aria-current', 'true');
  });

  test('keeps the address on the thread that is open', async ({ page }) => {
    // `?incident=` is read on mount, so an address left naming the previous
    // thread sends a reload somewhere the user has already navigated away
    // from.
    await page.goto('/chat');
    await page.getByTestId('chat-input').fill('A student reported name-calling in the corridor.');
    const [answered] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/chat') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);
    const { incidentId } = await answered.json();

    await expect(page).toHaveURL(new RegExp(`incident=${incidentId}`));

    // And the address survives the round trip it now promises.
    await page.reload();
    await expect(page.getByText(STUB_REPLY)).toBeVisible();

    // Starting a new chat drops it, or the next reload reopens the old one.
    await page.getByRole('button', { name: /New chat/i }).click();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('does not confirm an incident the reporter may not read', async ({ page }) => {
    // 404, not 403, all the way to the UI: a foreign id must not be revealed
    // as existing. The thread stays empty and nothing is marked current.
    const { adminIncidentId } = JSON.parse(readFileSync('e2e/.auth/seed.json', 'utf8'));
    await page.goto(`/chat?incident=${adminIncidentId}`);
    await expect(page.getByTestId('chat-input')).toBeVisible();
    await expect(page.getByTestId('chat-sources')).toHaveCount(0);
    await expect(
      page.locator(`[data-testid="chat-history-item"][data-incident-id="${adminIncidentId}"]`)
    ).toHaveCount(0);
  });
});

test.describe('A failed turn', () => {
  test('is not rendered as the assistant speaking, and says nothing was written', async ({
    page,
  }) => {
    // A failure appended as a `type: 'general'` message with apology text
    // would carry the same component, place and avatar as real guidance.
    // `generateSchoolComplianceResponse` throws rather than returning filler
    // precisely so a failed call cannot be mistaken for guidance, and the
    // client must not reintroduce it visually. It would also be client-only,
    // so a reload would leave the question with no answer and no
    // explanation.
    await page.goto('/chat');

    await page.route('**/api/chat', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The compliance assistant is temporarily unavailable.' }),
      })
    );

    const question = 'A student disclosed abuse at home this morning.';
    await page.getByTestId('chat-input').fill(question);
    await page.getByRole('button', { name: 'Send message' }).click();

    // Reported as a failure, with the endpoint's own message.
    const failure = page.getByTestId('chat-error');
    await expect(failure).toBeVisible();
    await expect(failure).toContainText('temporarily unavailable');

    // Not as guidance. The old apology text must not appear anywhere.
    await expect(page.getByText("I'm sorry, I'm experiencing technical difficulties")).toHaveCount(
      0
    );
    // And no sources block, which is what makes a turn look like an answer.
    await expect(page.getByTestId('chat-sources')).toHaveCount(0);

    // The unsent text is recoverable rather than lost.
    await failure.getByRole('button', { name: 'Put my message back' }).click();
    await expect(page.getByTestId('chat-input')).toHaveValue(question);
  });
});
