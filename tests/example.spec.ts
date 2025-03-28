import { test, expect } from '@playwright/test';

test('homepage loads and modal gray-out works', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Check for the modal toggle button (change selector as needed)
  await page.click('text="Login"');

  // Expect backdrop to exist
  const backdrop = await page.locator('#auth-modal');
  await expect(backdrop).toBeVisible();

  // Expect input to be visible
  await expect(page.locator('input[placeholder="Email"]')).toBeVisible();
});
