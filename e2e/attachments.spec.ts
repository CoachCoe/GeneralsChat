import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

/**
 * Attachments are the one invariant in `CLAUDE.md` that had no test of any
 * kind:
 *
 *   "**Attachments are student records.** They live outside `public/` and are
 *    served only through `GET /api/attachments/[id]`, which re-checks session
 *    and ownership. Never reintroduce a direct file URL."
 *
 * These need an `Attachment` row to exist: without one the ownership check,
 * the 404-not-403 response, the path-containment assertion and the three
 * response headers can all be deleted with a green suite.
 */
function seededIds(): {
  reporterAttachmentId: string;
  adminAttachmentId: string;
  reporterUploadedAdminAttachmentId: string;
} {
  return JSON.parse(readFileSync('e2e/.auth/seed.json', 'utf8'));
}

test.describe('Attachments', () => {
  test('the owner can download their own attachment', async ({ page }) => {
    const { reporterAttachmentId } = seededIds();

    const response = await page.request.get(`/api/attachments/${reporterAttachmentId}`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('witness statement filed by the reporter');
  });

  test('a reporter cannot download another user\'s attachment, and is not told it exists', async ({
    page,
  }) => {
    // The admin's attachment hangs off the admin's own Title IX incident. The
    // reporter has no relationship to either.
    const { adminAttachmentId } = seededIds();

    const response = await page.request.get(`/api/attachments/${adminAttachmentId}`);

    // 404, not 403: "do not confirm the id exists to someone who may not read
    // it." A 403 here would be a working id-enumeration oracle over student
    // records.
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('Title IX notes');
  });

  test('having uploaded a file is not a licence to keep reading it', async ({ page }) => {
    // The reporter uploaded this one, onto an incident they cannot read.
    // Access followed the upload rather than current scope, so a user kept a
    // student record after losing the incident it belongs to.
    const { reporterUploadedAdminAttachmentId } = seededIds();

    const response = await page.request.get(
      `/api/attachments/${reporterUploadedAdminAttachmentId}`
    );

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('uploaded by the reporter');
  });

  test('a missing attachment is indistinguishable from a forbidden one', async ({ page }) => {
    // Both must be 404 with the same body, or the difference between them is
    // the oracle the 404 exists to remove.
    const { adminAttachmentId } = seededIds();

    const forbidden = await page.request.get(`/api/attachments/${adminAttachmentId}`);
    const absent = await page.request.get('/api/attachments/cl000000000000000000000');

    expect(forbidden.status()).toBe(absent.status());
    expect(await forbidden.text()).toBe(await absent.text());
  });

  test('the download is served as an attachment that cannot execute on this origin', async ({
    page,
  }) => {
    const { reporterAttachmentId } = seededIds();

    const response = await page.request.get(`/api/attachments/${reporterAttachmentId}`);
    const headers = response.headers();

    // "Always download, never render: an uploaded document must not execute as
    // markup on this origin even if the extension allowlist is widened."
    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-disposition']).toContain('attachment;');
    // A student record must not sit in a shared cache.
    expect(headers['cache-control']).toContain('private');
    expect(headers['cache-control']).toContain('no-store');
  });

  test('an attachment is not reachable as a static file', async ({ page }) => {
    // The original defect: attachments lived under public/ and were served as
    // static assets with no access check, with the path handed out by
    // GET /api/incidents/[id].
    for (const path of [
      '/uploads/attachments/e2e-reporter-statement.txt',
      '/attachments/e2e-reporter-statement.txt',
      '/e2e-reporter-statement.txt',
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), `${path} must not serve the file`).not.toBe(200);
    }
  });

  test('signing out ends access to the attachment', async ({ page }) => {
    const { reporterAttachmentId } = seededIds();

    await page.context().clearCookies();
    const response = await page.request.get(`/api/attachments/${reporterAttachmentId}`, {
      maxRedirects: 0,
    });

    // Unauthenticated: never 200, whatever the id.
    expect(response.status()).not.toBe(200);
  });
});
