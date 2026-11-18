import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures.js';

test('manager draw and winner views load payout status through the manager-authorized API', async ({ page }) => {
  const chitId = 'manager-payout-chit';
  const payoutReads = [];
  const chit = {
    id: chitId, name: 'Pilot Chit', chitType: 'RESERVATION', winnerSelectionMode: 'RESERVATION',
    status: 'ACTIVE', capacity: 1, payingMemberSlots: 1, orgHeldSpotsCount: 0,
    durationMonths: 1, chitValue: 1000, installmentAmount: 1000, startDate: '2026-10-01',
  };
  await installAuthenticatedApp(page, {
    user: { id: 'manager-1', username: 'pilot-manager', fullName: 'Pilot Manager', role: 'MANAGER' },
    resolveApi: ({ url, request, json }) => {
      if (url.pathname === `/api/chits/${chitId}`) return json({ success: true, data: chit });
      if (url.pathname === '/api/chits') return json({ success: true, data: [chit] });
      if (url.pathname.startsWith('/api/payouts/') && request.method() === 'GET') {
        payoutReads.push(url.pathname);
        if (url.pathname === '/api/payouts/all' && url.searchParams.get('chitId') === chitId) {
          return json({ success: true, data: [{ id: 'payout-1', chitId, memberId: 'member-1',
            monthNumber: 1, netPayoutAmount: 1000, status: 'PENDING' }] });
        }
        return json({ success: false, message: 'Forbidden' }, 403);
      }
      if (url.pathname === `/api/chits/${chitId}/winners`) return json({ success: true, data: [
        { id: 'winner-1', memberId: 'member-1', monthNumber: 1, winningAmount: 1000 },
      ] });
      return null;
    },
  });

  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ['Draws', 'Winners']) {
      payoutReads.length = 0;
      await page.goto(`/chits/${chitId}?tab=${tab}`);
      await expectAuthenticatedShell(page);
      await expect.poll(() => payoutReads.length).toBeGreaterThan(0);
      expect(payoutReads).toContain('/api/payouts/all');
      expect(payoutReads).not.toContain(`/api/payouts/chit/${chitId}`);
    }
    payoutReads.length = 0;
    await page.goto('/draws');
    await page.getByRole('button', { name: /Pilot Chit/ }).click();
    await expect.poll(() => payoutReads.length).toBeGreaterThan(0);
    expect(payoutReads).toContain('/api/payouts/all');
    expect(payoutReads).not.toContain(`/api/payouts/chit/${chitId}`);
  }
});
