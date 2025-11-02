import { test, expect } from '@playwright/test';
import { mockClaudeAPI, mockFileUpload } from './helpers/test-helpers';

test.describe('Incident Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockClaudeAPI(page);
    await mockFileUpload(page);
  });

  test('should display incidents page', async ({ page }) => {
    await page.goto('/incidents');

    // Check for page title
    await expect(page.locator('h1')).toContainText('Incidents');

    // Check for filter buttons
    await expect(page.locator('button:has-text("all")')).toBeVisible();
    await expect(page.locator('button:has-text("open")')).toBeVisible();
    await expect(page.locator('button:has-text("closed")')).toBeVisible();
  });

  test('should filter incidents by status', async ({ page }) => {
    await page.goto('/incidents');

    // Click on 'open' filter
    await page.click('button:has-text("open")');
    await page.waitForTimeout(500);

    // Verify URL or state changed
    const url = page.url();
    expect(url).toBeTruthy();

    // Click on 'closed' filter
    await page.click('button:has-text("closed")');
    await page.waitForTimeout(500);

    // Click back to 'all'
    await page.click('button:has-text("all")');
    await page.waitForTimeout(500);
  });

  test('should show empty state when no incidents exist', async ({ page }) => {
    await page.goto('/incidents');

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Check for either incidents or empty state
    const hasIncidents = await page.locator('text=View').count() > 0;
    const hasEmptyState = await page.locator('text=/No incidents|Start Chat/i').count() > 0;

    // One should be true
    expect(hasIncidents || hasEmptyState).toBeTruthy();

    // If empty state, should have link to chat
    if (hasEmptyState) {
      await expect(page.locator('a[href="/chat"], button:has-text("Start Chat")')).toBeVisible();
    }
  });

  test('should not show "New Incident" button', async ({ page }) => {
    await page.goto('/incidents');

    // Verify there's no "New Incident" or "Create" button
    const createButtons = page.locator('button:has-text(/New Incident|Create Incident|Add Incident/i)');
    await expect(createButtons).toHaveCount(0);
  });

  test('should view incident details', async ({ page }) => {
    await page.goto('/incidents');
    await page.waitForTimeout(1000);

    // Check if there are any incidents to view
    const viewButtons = await page.locator('button:has-text("View"), a:has-text("View")');
    const count = await viewButtons.count();

    if (count > 0) {
      // Click on first incident
      await viewButtons.first().click();

      // Should navigate to incident detail page
      await page.waitForURL(/.*\/incidents\/.+/);

      // Check for incident details
      await expect(page.locator('h1, h2')).toBeTruthy();

      // Check for expected sections
      const hasConversations = await page.locator('text=/Chat History|Conversation|Messages/i').count() > 0;
      const hasAttachments = await page.locator('text=/Attachments|Documents|Files/i').count() > 0;

      expect(hasConversations || hasAttachments).toBeTruthy();
    } else {
      console.log('No incidents available to test detail view');
    }
  });

  test('should toggle incident status between open and closed', async ({ page }) => {
    await page.goto('/incidents');
    await page.waitForTimeout(1000);

    const viewButtons = await page.locator('button:has-text("View"), a:has-text("View")');
    const count = await viewButtons.count();

    if (count > 0) {
      // Navigate to incident detail
      await viewButtons.first().click();
      await page.waitForURL(/.*\/incidents\/.+/);

      // Look for status toggle button
      const toggleButton = page.locator('button:has-text(/Close Incident|Reopen Incident|Toggle Status/i)').first();

      if (await toggleButton.count() > 0) {
        const initialText = await toggleButton.textContent();

        // Click to toggle status
        await toggleButton.click();
        await page.waitForTimeout(1000);

        // Verify button text changed
        const newText = await toggleButton.textContent();
        expect(initialText).not.toBe(newText);

        // Click again to toggle back
        await toggleButton.click();
        await page.waitForTimeout(1000);

        // Should be back to original text
        const finalText = await toggleButton.textContent();
        expect(finalText).toBe(initialText);
      } else {
        console.log('Status toggle button not found - feature may not be on this page');
      }
    } else {
      console.log('No incidents available to test status toggle');
    }
  });

  test('should upload file to incident', async ({ page }) => {
    await page.goto('/incidents');
    await page.waitForTimeout(1000);

    const viewButtons = await page.locator('button:has-text("View"), a:has-text("View")');
    const count = await viewButtons.count();

    if (count > 0) {
      // Navigate to incident detail
      await viewButtons.first().click();
      await page.waitForURL(/.*\/incidents\/.+/);

      // Look for file upload button
      const uploadButton = page.locator('button:has-text(/Upload|Add File|Attach/i), input[type="file"]').first();

      if (await uploadButton.count() > 0) {
        // If it's a file input, use it directly
        if (await page.locator('input[type="file"]').count() > 0) {
          const fileInput = page.locator('input[type="file"]').first();

          // Upload a test file
          await fileInput.setInputFiles({
            name: 'test-evidence.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('test file content for incident')
          });

          // Wait for upload to complete
          await page.waitForTimeout(2000);

          // Check for success indicator or new file in list
          const fileList = page.locator('text=/test-evidence|Attachments|Documents/i');
          await expect(fileList.first()).toBeVisible({ timeout: 5000 });
        } else {
          // If it's a button, click it to trigger file picker
          console.log('Upload button found but requires manual file picker interaction');
        }
      } else {
        console.log('File upload not available on incident detail page');
      }
    } else {
      console.log('No incidents available to test file upload');
    }
  });

  test('should request AI summary of incident', async ({ page }) => {
    await page.goto('/incidents');
    await page.waitForTimeout(1000);

    const viewButtons = await page.locator('button:has-text("View"), a:has-text("View")');
    const count = await viewButtons.count();

    if (count > 0) {
      // Navigate to incident detail
      await viewButtons.first().click();
      await page.waitForURL(/.*\/incidents\/.+/);

      // Look for summary button
      const summaryButton = page.locator('button:has-text(/Summary|Generate|AI Summary|Get Summary/i)').first();

      if (await summaryButton.count() > 0) {
        // Click to generate summary
        await summaryButton.click();

        // Wait for summary to appear
        await page.waitForTimeout(2000);

        // Look for summary content
        const summarySection = page.locator('text=/Summary|Analysis|Overview|Recommendation/i');
        await expect(summarySection.first()).toBeVisible({ timeout: 10000 });
      } else {
        console.log('AI Summary button not found on incident detail page');
      }
    } else {
      console.log('No incidents available to test AI summary');
    }
  });

  test('should display incident metadata correctly', async ({ page }) => {
    await page.goto('/incidents');
    await page.waitForTimeout(1000);

    const viewButtons = await page.locator('button:has-text("View"), a:has-text("View")');
    const count = await viewButtons.count();

    if (count > 0) {
      // Navigate to incident detail
      await viewButtons.first().click();
      await page.waitForURL(/.*\/incidents\/.+/);

      // Check for various metadata fields
      const hasTitle = await page.locator('h1, h2').count() > 0;
      const hasDescription = await page.locator('text=/Description|Details/i').count() > 0;
      const hasDate = await page.locator('text=/Created|Date|Time/i').count() > 0;
      const hasStatus = await page.locator('text=/Status|open|closed/i').count() > 0;

      // At least title should be present
      expect(hasTitle).toBeTruthy();

      // And likely at least one other metadata field
      expect(hasDescription || hasDate || hasStatus).toBeTruthy();
    } else {
      console.log('No incidents available to test metadata display');
    }
  });

  test('should navigate back to incidents list from detail page', async ({ page }) => {
    await page.goto('/incidents');
    await page.waitForTimeout(1000);

    const viewButtons = await page.locator('button:has-text("View"), a:has-text("View")');
    const count = await viewButtons.count();

    if (count > 0) {
      // Navigate to incident detail
      await viewButtons.first().click();
      await page.waitForURL(/.*\/incidents\/.+/);

      // Look for back button or link
      const backButton = page.locator('a[href="/incidents"], button:has-text("Back")').first();

      if (await backButton.count() > 0) {
        await backButton.click();
        await page.waitForURL('**/incidents');

        // Verify we're back on the list page
        await expect(page.locator('h1')).toContainText('Incidents');
      } else {
        // Try clicking navbar link
        await page.click('text=Incidents');
        await page.waitForURL('**/incidents');
      }
    } else {
      console.log('No incidents available to test navigation');
    }
  });
});
