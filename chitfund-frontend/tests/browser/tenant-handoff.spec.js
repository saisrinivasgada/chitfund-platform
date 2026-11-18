import { test, expect } from '@playwright/test';

const code = 'a'.repeat(64);
const deviceToken = 'b'.repeat(64);

test('tenant host removes the handoff code before exchange and remembers this browser', async ({ page }) => {
  let exchanged = null;
  let addressAtExchange = null;

  await page.route('**/api/**', (route) => route.fulfill({
    json: { success: true, data: [] },
  }));
  await page.route('**/api/members/notes', (route) => route.fulfill({
    json: { success: true, data: [] },
  }));
  await page.route('**/api/auth/handoff-exchange', (route) => {
    exchanged = route.request().postDataJSON();
    addressAtExchange = page.url();
    return route.fulfill({ json: { success: true, data: {
      accessToken: 'scoped-access-token',
      user: { id: 'user-1', username: 'alice', fullName: 'Alice', role: 'ADMIN', hasLocalPassword: true },
      tenant: { tenantId: 'tenant-1', slug: 'alpha', name: 'Alpha Chits', role: 'ADMIN',
        status: 'ACTIVE', plan: 'BASIC', addOns: [] },
      deviceToken,
    } } });
  });

  await page.goto(`http://alpha.localhost:3101/auth/transfer#handoff=${code}&browserKey=username%3Aalice`);

  await expect(page).toHaveURL(/alpha\.localhost:3101\/dashboard$/);
  expect(exchanged).toEqual({ code, tenantSlug: 'alpha' });
  expect(new URL(addressAtExchange).hash).toBe('');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chitwise_device_tokens') || '{}'));
  expect(saved['username:alice']?.token).toBe(deviceToken);
  expect(new URL(page.url()).hash).toBe('');
});
