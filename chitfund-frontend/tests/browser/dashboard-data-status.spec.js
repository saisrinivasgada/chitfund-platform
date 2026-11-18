import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

test('dashboard does not turn incomplete or failed money data into exact zeros', async ({ page }) => {
  const wastedPayoutRequests = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/payouts/all' || /\/api\/chits\/[^/]+\/winners$/.test(path)) wastedPayoutRequests.push(path);
  });
  const firstPage = Array.from({ length: 20 }, (_, i) => ({
    id: `30000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    name: `Chit ${i + 1}`,
    status: 'ACTIVE',
    chitType: 'RESERVATION',
  }));

  await installAuthenticatedApp(page, {
    resolveApi: ({ url, json }) => {
      if (url.pathname === '/api/chits') {
        return json({ success: true, data: { content: firstPage, totalElements: 21 } });
      }
      if (url.pathname === '/api/payouts/all' || url.pathname === '/api/payouts/pending') {
        return json({ success: false, message: 'Temporarily unavailable' }, 503);
      }
      return null;
    },
  });

  await page.goto('/dashboard');
  await expect(page.getByText('Total Chits', { exact: true }).locator('..')).toContainText('20+');
  await expect(page.getByText('Active Chits', { exact: true }).locator('..')).toContainText('20+');
  await expect(page.getByText('Pending Payout', { exact: true }).locator('..')).toContainText('—');
  await expect(page.getByText('Pending Disbursement', { exact: true }).locator('..')).toContainText('—');
  await page.waitForLoadState('networkidle');
  expect(wastedPayoutRequests).toEqual([]);
});
