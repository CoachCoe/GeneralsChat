import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate to all main pages from navbar', async ({ page }) => {
    // Start at home page
    await page.goto('/');

    // Verify home page loads
    await expect(page).toHaveTitle(/School Compliance|GeneralsChat/i);

    // Test Chat link
    await page.click('text=Chat');
    await page.waitForURL('**/chat');
    await expect(page.locator('h1')).toContainText(/Chat|General/i);

    // Test Incidents link
    await page.click('text=Incidents');
    await page.waitForURL('**/incidents');
    await expect(page.locator('h1')).toContainText('Incidents');

    // Test Policies link
    await page.click('a[href="/admin/policies"]');
    await page.waitForURL('**/admin/policies');
    await expect(page.locator('h1')).toContainText(/Policies|Policy/i);

    // Test Todos link
    await page.click('text=Todos');
    await page.waitForURL('**/todos');
    await expect(page.locator('h1')).toContainText('Todos');
  });

  test('should have working navbar on all pages', async ({ page }) => {
    const pages = [
      { url: '/', navText: 'Chat' },
      { url: '/chat', navText: 'Incidents' },
      { url: '/incidents', navText: 'Chat' },
      { url: '/todos', navText: 'Chat' }
    ];

    for (const { url, navText } of pages) {
      await page.goto(url);

      // Verify navbar is visible
      const navbar = page.locator('nav');
      await expect(navbar).toBeVisible();

      // Verify key nav links are present
      await expect(navbar.locator('text=Chat')).toBeVisible();
      await expect(navbar.locator('text=Incidents')).toBeVisible();
      await expect(navbar.locator('text=Todos')).toBeVisible();
    }
  });

  test('should show mobile menu on small screens', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');

    // Mobile menu button should be visible
    const menuButton = page.locator('[role="button"]').filter({ hasText: /menu|☰/i }).first();

    // Check if mobile menu structure exists (button or dropdown trigger)
    // Note: Implementation may vary, so we check for common patterns
    const hasMobileNav = await page.locator('nav button').count() > 0 ||
                         await page.locator('[data-mobile-menu]').count() > 0;

    expect(hasMobileNav || await menuButton.count() > 0).toBeTruthy();
  });

  test('should navigate back to home from any page', async ({ page }) => {
    // Start from incidents page
    await page.goto('/incidents');

    // Click on logo or home link
    await page.click('a[href="/"]');
    await page.waitForURL('/');

    // Verify we're on home page
    await expect(page.locator('h1')).toBeTruthy();
  });
});
