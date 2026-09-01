import { test, expect } from '@playwright/test';

/**
 * Every route a signed-in reporter can reach must render without a client
 * error. The redesign touched every page, and a page that throws on mount
 * still returns 200 -- so status codes alone would not catch it.
 */
const REPORTER_ROUTES = ['/', '/chat', '/incidents', '/incidents?segment=all', '/policies', '/about'];

test.describe('Route smoke', () => {
  for (const route of REPORTER_ROUTES) {
    test(`${route} renders without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', err => errors.push(err.message));

      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);

      // A rendered <main> or <nav> proves the tree mounted rather than
      // falling through to an error boundary.
      await expect(page.locator('nav[aria-label="Main"]')).toBeVisible();

      // Next's dev overlay and font preload warnings are not our concern;
      // React render errors are.
      const real = errors.filter(
        e => !/favicon|preload|Download the React DevTools|hydrat/i.test(e)
      );
      expect(real, `console errors on ${route}:\n${real.join('\n')}`).toHaveLength(0);
    });
  }

  test('incident detail renders', async ({ page }) => {
    const list = await page.request.get('/api/incidents?status=open');
    const { incidents } = await list.json();
    expect(incidents.length).toBeGreaterThan(0);

    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`/incidents/${incidents[0].id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});
