import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

const routes = [
  '/dashboard', '/activity', '/members', '/chits', '/payments/record',
  '/payments/cash-requests', '/payments/history', '/payouts', '/draws',
  '/reports', '/treasury', '/settlement', '/myorg', '/billing', '/roles',
];

test('main admin pages remain usable at phone, iPad, and computer browser widths', async ({ page }) => {
  await installAuthenticatedApp(page, { analyticsEnabled: true, settlementEnabled: true });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main').first(), `${route} at ${width}px`).toBeVisible();
      expect(pageErrors.splice(0), `${route} at ${width}px must render without a runtime error`).toEqual([]);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${route} at ${width}px must not scroll sideways`).toBeLessThanOrEqual(1);
    }
  }
});
