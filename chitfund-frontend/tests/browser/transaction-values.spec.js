import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

test('renders exact payment values and reflects a reasoned full void', async ({ page }) => {
  const batchId = 'batch-8500';
  let voided = false;
  let submittedReason = null;

  const batch = () => ({
    id: batchId,
    memberId: 'user-member-1',
    chitId: 'chit-100',
    totalAmount: 8500,
    paymentMode: 'UPI',
    referenceNumber: 'UPI-ACCEPTANCE-8500',
    status: voided ? 'VOIDED' : 'COMPLETED',
    recordedBy: 'admin-1',
    createdAt: '2026-10-12T09:15:00',
    recordedAt: '2026-10-12T09:15:00',
    collectedAt: '2026-10-12T09:15:00',
    syncedAt: '2026-10-12T09:17:00',
    notes: 'Offline collection confirmed by member',
    allocations: [
      { monthNumber: 1, allocatedAmount: 5000 },
      { monthNumber: 2, allocatedAmount: 3500 },
    ],
    ...(voided ? {
      voidedBy: 'admin-1',
      voidedAt: '2026-10-12T10:00:00',
      voidReason: submittedReason,
    } : {}),
  });

  await installAuthenticatedApp(page, {
    resolveApi: async ({ request, url, json }) => {
      if (url.pathname === `/api/payments/batches/${batchId}`) return json({ success: true, data: batch() });
      if (url.pathname === '/api/chits/chit-100') return json({ success: true, data: {
        id: 'chit-100', name: 'Lakshmi Monthly ₹1 Lakh', status: 'ACTIVE',
        chitValue: 100000, installmentAmount: 10000, durationMonths: 10,
        capacity: 10, enrolledCount: 10, startDate: '2026-01-01',
      } });
      if (url.pathname === '/api/users/staff') return json({ success: true, data: [
        { id: 'admin-1', fullName: 'Srinivas Admin', username: 'srinivas', role: 'ADMIN', email: 'admin@example.test' },
      ] });
      if (url.pathname === '/api/members') return json({ success: true, data: [
        { id: 'member-profile-1', userId: 'user-member-1', fullName: 'Ravi Kumar', phoneCountryCode: '+91', phone: '9000000001', email: 'ravi@example.test', status: 'ACTIVE' },
      ] });
      if (url.pathname === '/api/admin/draws/chit/chit-100') return json({ success: true, data: [
        { monthNumber: 1, drawDate: '2026-01-10' }, { monthNumber: 2, drawDate: '2026-02-10' },
      ] });
      if (url.pathname === '/api/payments/balance/total') return json({ success: true, data: 0 });
      if (url.pathname === '/api/chits/member/user-member-1') return json({ success: true, data: [] });
      if (url.pathname === `/api/payments/${batchId}/void` && request.method() === 'POST') {
        submittedReason = (await request.postDataJSON()).reason;
        voided = true;
        return json({ success: true, data: batch() });
      }
      return null;
    },
  });

  await page.goto(`/transactions/${batchId}`);
  await expect(page.getByRole('heading', { name: 'Transaction Detail' })).toBeVisible();
  const main = page.locator('main');
  await expect(main.locator('p').filter({ hasText: /^₹8,500$/ })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: /^Ravi Kumar$/ })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: /^Lakshmi Monthly ₹1 Lakh$/ }).first()).toBeVisible();
  await expect(page.getByText('₹5,000', { exact: true })).toBeVisible();
  await expect(page.getByText('₹3,500', { exact: true })).toBeVisible();
  await expect(page.getByText('Synced At', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Void', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm Void' });
  await expect(confirm).toBeDisabled();
  await page.getByPlaceholder('Reason for voiding…').fill('Duplicate collection entered by mistake');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect.poll(() => submittedReason).toBe('Duplicate collection entered by mistake');
  await expect(page.getByText('Void Details', { exact: true })).toBeVisible();
  await expect(page.getByText('Duplicate collection entered by mistake', { exact: true })).toBeVisible();
  await expect(page.getByText('Draw Allocations — Lakshmi Monthly ₹1 Lakh', { exact: true })).toBeVisible();
});
