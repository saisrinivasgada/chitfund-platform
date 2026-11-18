import { test, expect } from '@playwright/test';

for (const [path, visibleText] of [
  ['/setup-account', 'Set up your account'],
  ['/setup', 'Set up your admin account'],
  ['/chitfund-request', 'Request link unavailable'],
  ['/hub/accept-invite', 'Set up your Hub account'],
]) {
  for (const tokenSeparator of ['?', '#']) {
    test(`${path} removes its ${tokenSeparator === '#' ? 'fragment' : 'query'} token from browser history`, async ({ page }) => {
      await page.route('**/api/**', (route) => route.fulfill({
        status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Expired link' }),
      }));
      await page.goto(`${path}${tokenSeparator}token=one-time-secret`);
      await expect(page.getByText(visibleText).first()).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
    });
  }
}
