import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

test('admin dashboard and billing fit phone and iPad browser widths', async ({ page }) => {
  await installAuthenticatedApp(page);

  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/dashboard', '/billing']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      if (path === '/dashboard') {
        await expect(page.getByText('Total Chits', { exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Billing & Plan' })).toBeVisible();
      }
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${path} at ${width}px must not scroll sideways`).toBeLessThanOrEqual(1);
    }
  }
});
