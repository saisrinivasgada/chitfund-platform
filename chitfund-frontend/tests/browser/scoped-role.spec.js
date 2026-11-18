import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { installAuthenticatedApp, expectAuthenticatedShell, TEST_TENANT } from './fixtures';

test('session restoration uses the selected organisation role instead of the primary user role', async ({ page }) => {
  const user = { id: '20000000-0000-0000-0000-000000000001', username: 'scoped-role-qa', fullName: 'Scoped Role QA', role: 'STAFF', mustChangePassword: false };
  await installAuthenticatedApp(page, { user, tenantRole: 'ADMIN' });
  await page.goto('/dashboard'); await expectAuthenticatedShell(page);
  await expect(page.locator('nav').getByRole('link', { name: 'Members', exact: true })).toBeVisible();
  const expectedScope = `WEB:${user.id}:${TEST_TENANT}:ADMIN`;
  const readAccount = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('chitwise-offline-v1');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('accounts', 'readonly');
      const request = tx.objectStore('accounts').getAll();
      request.onsuccess = () => resolve(request.result[0]);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    };
  }));
  await expect.poll(async () => (await readAccount())?.scope).toBe(expectedScope);
  const account = await readAccount();
  const identity = { role: account.user.role, browserAccountId: account.browserAccountId };
  expect(identity.role).toBe('ADMIN');
  expect(identity.browserAccountId).toBe(createHash('sha256').update(expectedScope).digest('hex').slice(0, 32));
});

test('manager cannot open the admin billing page through a direct URL', async ({ page }) => {
  const user = { id: '20000000-0000-0000-0000-000000000002', username: 'manager-qa', fullName: 'Manager QA', role: 'MANAGER' };
  await installAuthenticatedApp(page, { user, tenantRole: 'MANAGER' });
  await page.goto('/billing');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Billing & Plan' })).toHaveCount(0);
});

test('manager dashboard does not request the admin member summary page', async ({ page }) => {
  const user = { id: '20000000-0000-0000-0000-000000000003', username: 'manager-traffic', name: 'Manager QA', role: 'MANAGER' };
  const adminRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/members' && url.searchParams.get('size') === '50') adminRequests.push(request.url());
  });
  await installAuthenticatedApp(page, { user, tenantRole: 'MANAGER' });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Manager QA/ })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(adminRequests).toEqual([]);
});
