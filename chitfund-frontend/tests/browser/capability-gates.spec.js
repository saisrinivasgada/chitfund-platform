import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures';

test('direct URLs remain visibly locked when the plan lacks capabilities', async ({ page }) => {
  await installAuthenticatedApp(page, { analyticsEnabled: false, settlementEnabled: false });

  await page.goto('/reports');
  await expectAuthenticatedShell(page);
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reports are not included in this plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Review plans/ })).toBeVisible();
  await expect(page.locator('nav').getByText('Not in plan', { exact: true })).toHaveCount(2);

  await page.goto('/settlement');
  await expect(page.getByRole('heading', { name: 'Settlement not in your plan' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Contact support to upgrade/ })).toBeVisible();
});
