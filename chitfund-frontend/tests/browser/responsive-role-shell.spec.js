import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

const cases = [
  { role: 'MANAGER', routes: ['/dashboard', '/members', '/chits', '/payments/cash-requests', '/pickups'] },
  { role: 'STAFF', routes: ['/dashboard', '/tasks'] },
  { role: 'MEMBER', routes: ['/member', '/member/invitations', '/member/profile', '/member/chitfund-requests'] },
];

for (const { role, routes } of cases) {
  test(`${role.toLowerCase()} pages fit phone, iPad, and desktop browser widths`, async ({ page }) => {
    const user = {
      id: `responsive-${role.toLowerCase()}`, username: `responsive-${role.toLowerCase()}`,
      fullName: `${role} QA`, name: `${role} QA`, role,
    };
    await installAuthenticatedApp(page, { user, tenantRole: role });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('main').first(), `${role} ${route} at ${width}px`).toBeVisible();
        expect(errors.splice(0), `${role} ${route} at ${width}px must render without a runtime error`).toEqual([]);
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${role} ${route} at ${width}px must not scroll sideways`).toBeLessThanOrEqual(1);
      }
    }
  });
}
