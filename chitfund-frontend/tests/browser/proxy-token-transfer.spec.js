import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

test('platform proxy opens without placing its token in a URL', async ({ page, context }) => {
  const token = `header.${Buffer.from(JSON.stringify({
    sub: 'proxy-admin-1', username: 'proxy-admin', role: 'ADMIN',
    tenantId: 'tenant-1', tenantSlug: 'pilot-chit', tenantPlan: 'BASIC',
  })).toString('base64url')}.signature`;
  const requestedUrls = [];
  context.on('request', (request) => requestedUrls.push(request.url()));
  await page.addInitScript(() => {
    localStorage.setItem('hub_user', JSON.stringify({
      id: 'hub-admin-qa', username: 'hub-admin-qa', role: 'SUPER_ADMIN', mustChangePassword: false,
    }));
    sessionStorage.setItem('hub_token', 'hub-qa-token');
    sessionStorage.setItem('hub_saas_token', 'saas-qa-token');
  });
  await context.route('**/ws/**', (route) => route.abort());
  await context.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = route.request().method() === 'POST' && path === '/api/super-admin/tenants/tenant-1/proxy'
      ? { token, tenantId: 'tenant-1', tenantSlug: 'pilot-chit', proxyRole: 'ADMIN' }
      : path === '/api/super-admin/tenants'
        ? [{ id: 'tenant-1', name: 'Pilot Chit Fund', slug: 'pilot-chit', plan: 'BASIC', status: 'ACTIVE' }]
        : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  page.on('dialog', (dialog) => dialog.accept('Reviewing member collection support'));

  await page.goto('/superadmin/tenants');
  const row = page.locator('tr').filter({ hasText: 'Pilot Chit Fund' });
  await expect(row).toBeVisible();
  await row.locator('button').last().click();
  await page.getByRole('button', { name: 'Proxy as' }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  const popup = await popupPromise;

  await expect(popup).toHaveURL(/\/dashboard$/);
  expect(requestedUrls.some((url) => url.includes(token))).toBe(false);
  expect(popup.url()).not.toContain('token=');
  expect(await popup.evaluate(() => sessionStorage.getItem('chitwise.proxy.bootstrap'))).toBeNull();
  expect(await popup.evaluate(() => sessionStorage.getItem('token'))).toBe(token);
});
