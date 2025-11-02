import { Page } from '@playwright/test';

/**
 * Mock the Claude API responses for testing
 */
export async function mockClaudeAPI(page: Page) {
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const request = route.request();
    const postData = request.postDataJSON();

    // Generate a mock response based on the request
    const mockResponse = {
      id: 'msg-test-123',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'This is a test response from Claude. I understand you need help with an incident. Can you provide more details?'
        }
      ],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50
      }
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockResponse)
    });
  });
}

/**
 * Mock file upload for testing
 */
export async function mockFileUpload(page: Page) {
  await page.route('**/api/attachments/upload', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-attachment-123',
        filename: 'test-document.pdf',
        filePath: '/uploads/test-document.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        incidentId: 'test-incident-123',
        uploadedBy: 'test-user',
        createdAt: new Date().toISOString()
      })
    });
  });
}

/**
 * Wait for navigation to complete
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

/**
 * Clear test data - use with caution!
 * This should only be used in test environments
 */
export async function clearTestData(page: Page) {
  // This would require a test-only API endpoint
  // For now, we'll skip this and rely on test database isolation
  console.log('Test data cleanup - implement if needed');
}

/**
 * Login helper (if auth is added later)
 */
export async function login(page: Page, email: string = 'test@example.com') {
  // Placeholder for future authentication
  // For now, the app doesn't have auth
  await page.goto('/');
}

/**
 * Helper to wait for API response
 */
export async function waitForAPIResponse(page: Page, urlPattern: string | RegExp) {
  return await page.waitForResponse(urlPattern, { timeout: 10000 });
}
