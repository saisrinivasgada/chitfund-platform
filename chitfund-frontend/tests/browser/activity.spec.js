import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures';

test('renders audited activity values and sends exact filter parameters', async ({ page }) => {
  const requestedQueries = [];
  const events = [
    {
      id: 'audit-payment-1',
      entityType: 'PAYMENT_BATCH',
      entityId: 'batch-8500',
      chitId: 'chit-100',
      action: 'PAYMENT_RECORDED',
      actorRole: 'STAFF',
      source: 'OFFLINE_SYNC',
      outcome: 'SUCCESS',
      reason: 'Collected offline at member location',
      correlationId: 'corr-payment-8500',
      beforeState: 'OUTSTANDING: 12000.00',
      afterState: 'OUTSTANDING: 3500.00',
      occurredAt: '2026-10-12T09:15:00Z',
      createdAt: '2026-10-12T09:17:00Z',
      originalOfflineAt: '2026-10-12T09:15:00Z',
      synchronizedAt: '2026-10-12T09:17:00Z',
    },
    {
      id: 'audit-denied-1',
      entityType: 'SETTLEMENT',
      entityId: 'settlement-2',
      action: 'SETTLEMENT_CONFIRM_DENIED',
      actorRole: 'MANAGER',
      source: 'WEB',
      outcome: 'DENIED',
      reason: 'Capability not included in plan',
      occurredAt: '2026-10-12T08:00:00Z',
      createdAt: '2026-10-12T08:00:01Z',
    },
  ];

  await installAuthenticatedApp(page, {
    resolveApi: ({ url, json }) => {
      if (url.pathname !== '/api/audit/logs') return null;
      requestedQueries.push(url.search);
      const source = url.searchParams.get('source');
      const entityType = url.searchParams.get('entityType');
      const content = events.filter((event) =>
        (!source || event.source === source) && (!entityType || event.entityType === entityType));
      return json({
        success: true,
        data: { content, number: 0, totalPages: 1, totalElements: content.length, first: true, last: true },
      });
    },
  });

  await page.goto('/activity');
  await expectAuthenticatedShell(page);
  await expect(page.getByRole('heading', { name: 'Organization Activity' })).toBeVisible();
  await expect(page.getByText('Payment Recorded', { exact: true })).toBeVisible();
  await expect(page.getByText('Settlement Confirm Denied', { exact: true })).toBeVisible();
  await expect(page.getByText(/Collected offline at member location/)).toBeVisible();

  await page.getByText('Payment Recorded', { exact: true }).click();
  await expect(page.getByText('batch-8500', { exact: true })).toBeVisible();
  await expect(page.getByText(/Offline Sync · corr-payment-8500/)).toBeVisible();
  await expect(page.getByText('OUTSTANDING: 12000.00 → OUTSTANDING: 3500.00')).toBeVisible();

  await page.getByRole('combobox').nth(1).selectOption('OFFLINE_SYNC');
  await expect.poll(() => requestedQueries.some((query) => query.includes('source=OFFLINE_SYNC'))).toBe(true);
  await expect(page.getByText('Settlement Confirm Denied', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Payments' }).click();
  await expect.poll(() => requestedQueries.some((query) => query.includes('entityType=PAYMENT_BATCH'))).toBe(true);
  await expect(page.getByText('Payment Recorded', { exact: true })).toBeVisible();
});
