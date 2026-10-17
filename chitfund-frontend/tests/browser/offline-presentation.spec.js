import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures';
test.use({ serviceWorkers: 'block' });

async function seedAccess(page, enabled) {
  await page.evaluate(async (enabled) => {
    const { activeAccountScope } = await import('/src/offline/accountClient.js');
    const { mutateRow } = await import('/src/offline/storage.js');
    const { notifyOfflineChange } = await import('/src/offline/outbox.js');
    const scope = activeAccountScope();
    await mutateRow('accounts', scope, (row) => ({ ...row, offlineAccess: { enabled, actorId: row.user.id, tenantId: row.tenant.tenantId, role: row.user.role } }));
    notifyOfflineChange(scope);
  }, enabled);
}

test('non-subscriber has ordinary online UI and no sync details on its account card', async ({ page }) => {
  await installAuthenticatedApp(page);
  await page.goto('/payments/record'); await expectAuthenticatedShell(page);
  await seedAccess(page, false);
  await expect(page.getByText(/Preparing offline|Up to date|Offline access is enabled/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /saved payment|Payment activity|Sync now/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your saved accounts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync now' })).toHaveCount(0);
  await expect(page.getByText('No collections waiting to sync')).toHaveCount(0);
});

test('connection loss blocks online-only business UI and reconnect restores it', async ({ page }) => {
  await installAuthenticatedApp(page); await page.goto('/payments/record'); await expectAuthenticatedShell(page);
  await seedAccess(page, false);
  // Simulate both the browser connectivity event and navigator state. API mocks
  // remain deterministic; production shell restore is separately covered by PWA tests.
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
  await expect(page.getByRole('heading', { name: 'No internet connection' })).toBeVisible();
  await expect(page.getByText(/hasn’t subscribed to Offline access & sync/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Record Cash Payment|Sync now/ })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/chitwise-web-no-offline-addon.png' });
  await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
  await expectAuthenticatedShell(page);
});

test('subscriber keeps offline business UI and sees only outstanding entries in the compact card', async ({ page }) => {
  await installAuthenticatedApp(page, { offlineEnabled: true }); await page.goto('/payments/record'); await expectAuthenticatedShell(page);
  await seedAccess(page, true);
  await page.evaluate(async () => {
    const { activeAccountScope } = await import('/src/offline/accountClient.js');
    const { writeRow, seal } = await import('/src/offline/storage.js');
    const { notifyOfflineChange } = await import('/src/offline/outbox.js');
    const scope = activeAccountScope();
    for (let n = 0; n < 70; n++) await writeRow('outbox', { key: `${scope}:test-${n}`, scope, operationId: `test-${n}`, status: n < 10 ? 'SUCCEEDED' : 'CONFLICT', createdAt: Date.now() + n,
      encrypted: await seal(scope, { memberId: `member-${n}`, chitId: 'chit-a', amount: 125, paymentMode: 'CASH' }) });
    notifyOfflineChange(scope);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline'));
  });
  await expect(page.getByRole('heading', { name: 'No internet connection' })).toHaveCount(0);
  const summary = page.getByRole('button', { name: /60 saved payments · needs attention/ });
  await expect(summary).toBeVisible();
  await expect(page.getByText('₹125', { exact: true })).toHaveCount(0);
  await summary.click();
  await expect(page.getByRole('heading', { name: 'Saved payment activity' })).toBeVisible();
  await expect(page.getByText('Synced', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Review needed', { exact: true })).toHaveCount(30);
  await page.getByRole('button', { name: 'Show more saved entries' }).click();
  await expect(page.getByText('Review needed', { exact: true })).toHaveCount(60);
});

test('tapping an unsynced entry opens its allocations and a guarded Cancel action', async ({ page }) => {
  await installAuthenticatedApp(page, { offlineEnabled: true }); await page.goto('/payments/record'); await expectAuthenticatedShell(page);
  await seedAccess(page, true);
  await page.evaluate(async () => {
    const { activeAccountScope } = await import('/src/offline/accountClient.js');
    const { writeRow, seal } = await import('/src/offline/storage.js');
    const { notifyOfflineChange } = await import('/src/offline/outbox.js');
    const scope = activeAccountScope();
    await writeRow('outbox', { key: `${scope}:cancel-me`, scope, operationId: 'cancel-me', action: 'RECORD_PAYMENT', status: 'QUEUED', attempts: 0, createdAt: Date.now(), nextAttemptAt: Date.now() + 86400000,
      encrypted: await seal(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 1000, paymentMode: 'CASH', allocations: [{ chitId: 'chit-a', amount: 600 }, { chitId: 'chit-b', amount: 400 }] }) });
    notifyOfflineChange(scope);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline'));
  });
  await page.getByRole('button', { name: /1 saved payment · waiting to sync/ }).click();
  await page.getByRole('button', { name: /₹1,000/ }).click();
  await expect(page.getByRole('heading', { name: 'Saved payment details' })).toBeVisible();
  await expect(page.getByText('₹600', { exact: true })).toBeVisible(); await expect(page.getByText('₹400', { exact: true })).toBeVisible();
  const cancel = page.getByRole('button', { name: 'Cancel payment', exact: true }); await expect(cancel).toBeDisabled();
  await page.getByLabel('Cancellation reason').fill('Mistaken entry; no money received'); await expect(cancel).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I confirm no money was collected' }).check(); await cancel.click();
  await expect(page.getByText('Entry cancelled. Its requested allocations will not be applied.')).toBeVisible();
  await expect(page.getByText('No payments waiting to sync.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(page.getByRole('button', { name: /saved payment.*waiting to sync/ })).toHaveCount(0);
});

test('offline payment search finds a member beyond the first 200 without rendering the whole organisation', async ({ page }) => {
  await installAuthenticatedApp(page, { offlineEnabled: true }); await page.goto('/payments/record'); await expectAuthenticatedShell(page);
  await page.evaluate(async () => {
    const { activeAccountScope } = await import('/src/offline/accountClient.js');
    const { writeRow, mutateRow, seal } = await import('/src/offline/storage.js');
    const { notifyOfflineChange } = await import('/src/offline/outbox.js');
    const scope = activeAccountScope();
    await mutateRow('accounts', scope, (row) => ({ ...row, offlineAccess: { enabled: true } }));
    const members = Array.from({ length: 12003 }, (_, n) => ({ id: `member-${n}`, fullName: n === 12002 ? 'Beyond First Page' : `Member ${String(n).padStart(5, '0')}`, status: 'ACTIVE', phone: `90000${String(n).padStart(5, '0')}` }));
    await writeRow('datasets', { key: `${scope}:published:members`, scope, savedAt: Date.now(), encrypted: await seal(scope, members) });
    notifyOfflineChange(scope);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline'));
  });
  await page.route('**/api/members?*', (route) => route.abort());
  await page.getByRole('textbox', { name: 'Search members by name or phone' }).fill('Beyond First');
  const picker = page.getByRole('combobox').filter({ has: page.locator('option[value="member-12002"]') });
  await expect(picker).toBeVisible();
  await expect(picker.locator('option')).toHaveCount(2);
  await picker.selectOption('member-12002');
  await expect(picker).toHaveValue('member-12002');
});
