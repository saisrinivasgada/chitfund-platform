import { test, expect } from '@playwright/test';

async function preparedBrowser(page, context) {
  await page.goto('/__offline-harness');
  await page.waitForFunction(() => !!window.harness);
  const account = await page.evaluate(async () => {
    const user = { id: 'actor-a', username: 'user-a', fullName: 'User a', role: 'ADMIN' };
    const tenant = { tenantId: 'org-a', tenantName: 'Organisation a', tenantSlug: 'org-a', tenantStatus: 'ACTIVE', tenantPlan: 'GROWTH' };
    const account = await window.harness.rememberAccount(user, tenant, 'access-a');
    localStorage.setItem('user', JSON.stringify(user));
    for (const [key, value] of Object.entries(tenant)) localStorage.setItem(key, value);
    localStorage.setItem('planExpiresAt', '2030-01-01T00:00:00');
    return { scope: account.scope, browserAccountId: account.browserAccountId };
  });
  await context.addCookies([{ name: `chitwise_account_${account.browserAccountId}`, value: 'refresh-a',
    domain: '127.0.0.1', path: `/api/auth/accounts/${account.browserAccountId}`, httpOnly: true, sameSite: 'Strict' }]);
  await page.evaluate(async (scope) => {
    await window.harness.refreshOfflineAccess(scope);
    await navigator.serviceWorker.register('/offline-worker.js', { type: 'module' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  }, account.scope);
  return account;
}

test('production app shell can reopen a signed-in organisation while fully offline', async ({ page, context }) => {
  const account = await preparedBrowser(page, context);
  await page.evaluate(async (scope) => {
    await window.harness.saveCachedResponse(scope, { method: 'get', url: '/members', params: { size: 200 } },
      { success: true, data: [{ id: 'member-a', fullName: 'Saved Member', status: 'ACTIVE' }] });
    await window.harness.saveCachedResponse(scope, { method: 'get', url: '/chits', params: {} }, { success: true, data: [] });
  }, account.scope);
  await context.setOffline(true);
  await page.goto('/dashboard');
  await expect(page.getByText('Offline · showing saved data', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accounts', exact: true })).toBeVisible();
  await expect.poll(() => page.getByAltText('ChitWise Admin').first().evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
});

test('service worker delivers a saved payment after its tab closes without a persisted bearer token', async ({ page, context, request }) => {
  const account = await preparedBrowser(page, context);
  const operationId = `closed-tab-${Date.now()}`;
  await page.evaluate(async ({ scope, operationId }) => {
    await window.harness.queuePayment(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 300,
      paymentMode: 'CASH', idempotencyKey: operationId });
  }, { scope: account.scope, operationId });
  await page.evaluate(() => navigator.serviceWorker.controller.postMessage({ type: 'SYNC_SAVED_PAYMENTS' }));
  await page.close();
  await expect.poll(async () => {
    const response = await request.get('/__test/receipts');
    return (await response.json()).filter((receipt) => receipt.operationId === operationId).length;
  }).toBe(1);
  const reopened = await context.newPage();
  await reopened.goto('/__offline-harness');
  await reopened.waitForFunction(() => !!window.harness);
  const state = await reopened.evaluate(async (operationId) => {
    const row = (await window.harness.readRows('outbox')).find((entry) => entry.operationId === operationId);
    const accounts = await window.harness.readRows('accounts');
    return { status: row.status, persistedBearer: JSON.stringify({ row, accounts }).includes('access-a') };
  }, operationId);
  expect(state).toEqual({ status: 'SUCCEEDED', persistedBearer: false });
});
