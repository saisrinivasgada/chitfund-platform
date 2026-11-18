import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures';
test.use({ serviceWorkers: 'block' });

test('chit history exposes older pages, actors and recorded before/after changes', async ({ page }) => {
  const requestedPages = [];
  const chitId = 'audit-chit';
  await installAuthenticatedApp(page, { resolveApi: ({ url, json }) => {
    if (url.pathname === `/api/chits/${chitId}`) return json({ success: true, data: {
      id: chitId, name: 'Audit History QA', chitType: 'RESERVATION', winnerSelectionMode: 'RESERVATION',
      status: 'DRAFT', capacity: 2, durationMonths: 2, chitValue: 2000, totalAmount: 2000,
      installmentAmount: 1000, startDate: '2026-10-01', attributes: {}, orgHeldSpotsCount: 0,
    } });
    if (url.pathname === `/api/audit/logs/chit/${chitId}`) {
      const number = Number(url.searchParams.get('page') ?? 0); requestedPages.push(number);
      const entry = number === 0 ? {
        id: 'new-event', entityType: 'CHIT', entityId: chitId, chitId, action: 'CHIT_DETAILS_UPDATED',
        actorId: 'admin-audit', actorRole: 'ADMIN', createdAt: '2026-10-19T10:00:00Z',
        beforeState: JSON.stringify({ name: 'Original chit name' }), afterState: JSON.stringify({ name: 'Audit History QA' }),
      } : {
        id: 'old-event', entityType: 'RESERVATION_SLOT', entityId: 'slot-1', chitId, action: 'SLOT_UPDATED',
        actorId: 'admin-audit', actorRole: 'ADMIN', createdAt: '2026-10-18T10:00:00Z',
        beforeState: JSON.stringify({ payoutAmount: 1000 }), afterState: JSON.stringify({ payoutAmount: 1200 }),
      };
      return json({ success: true, data: { content: [entry], number, totalPages: 2, totalElements: 2, first: number === 0, last: number === 1 } });
    }
    if (url.pathname === '/api/users/staff') return json({ success: true, data: [{ id: 'admin-audit', fullName: 'Audit Administrator', role: 'ADMIN' }] });
    return null;
  } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/chits/${chitId}?tab=Audit`);
  await expectAuthenticatedShell(page);
  await expect(page.getByText('Page 1 of 2 · 2 events')).toBeVisible();
  await page.getByText('View recorded changes', { exact: true }).click();
  await expect(page.getByText('Original chit name → Audit History QA', { exact: true })).toBeVisible();
  await expect(page.getByText('Audit Administrator', { exact: true })).toBeVisible();
  await expect(page.getByText('By', { exact: true }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 of 2 · 2 events')).toBeVisible();
  await page.getByText('View recorded changes', { exact: true }).click();
  await expect(page.getByText('1000 → 1200', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(requestedPages).toEqual(expect.arrayContaining([0, 1]));
});

test('background refresh cannot silently advance the version of an open slot edit', async ({ page }) => {
  const chitId = 'edit-chit'; let version = 7; let reads = 0; const savedBodies = [];
  await installAuthenticatedApp(page, { offlineEnabled: true, resolveApi: ({ url, request, json }) => {
    if (url.pathname === `/api/chits/${chitId}`) return json({ success: true, data: {
      id: chitId, name: 'Concurrent Edit QA', chitType: 'RESERVATION', winnerSelectionMode: 'RESERVATION',
      status: 'DRAFT', capacity: 1, durationMonths: 1, chitValue: 1000, totalAmount: 1000,
      installmentAmount: 1000, startDate: '2026-10-01', attributes: {}, orgHeldSpotsCount: 0,
    } });
    if (url.pathname === `/api/chits/${chitId}/reservations` && request.method() === 'GET') {
      reads++;
      return json({ success: true, data: [{ id: 'slot-edit', chitId, version, monthNumber: 1,
        reservationMonth: '2026-10-01', status: 'UNALLOCATED', memberId: null, orgHeld: false, payoutAmount: version === 7 ? 1000 : 1100 }] });
    }
    if (url.pathname === `/api/chits/${chitId}/reservations/slot-edit` && request.method() === 'PUT') {
      savedBodies.push(request.postDataJSON());
      return json({ success: false, errorCode: 'GENERAL_006', message: 'This slot changed. Refresh the schedule.' }, 409);
    }
    return null;
  } });
  await page.goto(`/chits/${chitId}?tab=Schedule`); await expectAuthenticatedShell(page);
  const payout = page.locator('table input[type="number"]').first();
  await expect(payout).toHaveValue('1000'); await payout.fill('1200');
  const beforeRefresh = reads; version = 8;
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('chitwise-offline-v1');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('accounts', 'readwrite');
      const accounts = tx.objectStore('accounts');
      const request = accounts.openCursor();
      let scope;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const row = cursor.value;
        scope = row.scope;
        cursor.update({ ...row, offlineAccess: {
          enabled: true, actorId: row.user.id, tenantId: row.tenant.tenantId, role: row.user.role,
        } });
      };
      tx.oncomplete = () => {
        db.close();
        const channel = new BroadcastChannel('chitwise-offline');
        channel.postMessage({ scope });
        channel.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect.poll(() => reads).toBeGreaterThan(beforeRefresh);
  await page.getByLabel('Close', { exact: true }).click();
  await expect(payout).toHaveValue('1200');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('This slot changed. Refresh the schedule.', { exact: true })).toBeVisible();
  expect(savedBodies).toHaveLength(1); expect(savedBodies[0].expectedVersion).toBe(7);
});
