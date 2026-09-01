import { test, expect } from '@playwright/test';

/**
 * Mobile (design 1i). There was no working mobile layout at all before this
 * branch -- four of the eight responsive classes the markup used were never
 * defined, so they silently did nothing.
 *
 * Administrators are on a phone mid-incident, so the queue has to work at
 * 375px and every target has to be reachable with a thumb.
 */
test.use({ viewport: { width: 375, height: 812 } });

test.describe('Mobile', () => {
  test('the queue is usable at 375px and does not scroll sideways', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('primary targets are at least 44px tall', async ({ page }) => {
    await page.goto('/');
    const report = page.getByRole('link', { name: 'Report an incident' });
    const box = await report.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('the incidents list does not overflow horizontally', async ({ page }) => {
    await page.goto('/incidents?segment=all');
    await expect(page.getByRole('heading', { name: 'Incidents', level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('chat composer is reachable at 375px', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByTestId('chat-input')).toBeVisible();
    const send = page.getByRole('button', { name: 'Send message' });
    const box = await send.boundingBox();
    expect(box).not.toBeNull();
  });
});
