import { expect, test } from '@playwright/test';

test('migrates the legacy cache, coordinates contexts, and retains tasks after session rotation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5179/tests/browser/offline.html');
  await expect(page.locator('#result')).toContainText(/PASS|FAIL/, { timeout: 45_000 });
  expect(await page.locator('#result').textContent()).toMatch(/^PASS/);
  expect(errors).toEqual([]);
});

test('opens the production application again with the network disabled', async ({ page, context }) => {
  await context.route('**/*.supabase.co/**', route => route.abort());
  await page.goto('http://127.0.0.1:5180/');
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
