import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

test('auto allocation requires an explicit review before creating member credit', async ({ page }) => {
  const posted = [];
  await installAuthenticatedApp(page, {
    resolveApi: async ({ request, url, json }) => {
      if (url.pathname === '/api/members') return json({ success: true, data: {
        content: [{ id: 'member-1', fullName: 'Ravi Kumar', status: 'ACTIVE' }], number: 0, last: true,
      } });
      if (url.pathname === '/api/chits/member/member-1') return json({ success: true, data: [
        { id: 'chit-1', name: 'Pilot Chit', status: 'ACTIVE', installmentAmount: 1000 },
      ] });
      if (url.pathname === '/api/payments/balance') return json({ success: true, data: { totalOutstanding: 1000 } });
      if (url.pathname === '/api/payments/balance/total') return json({ success: true, data: 1000 });
      if (url.pathname === '/api/payments/credits/member-1') return json({ success: true, data: { balance: 200 } });
      if (url.pathname === '/api/payments/preview') return json({ success: true, data: {
        balanceVersion: 'balance-v1', memberId: 'member-1', primaryChitId: 'chit-1',
        requestedAmount: 1200, creditAvailable: 200, creditConsumed: 200,
        totalOutstanding: 1000, selectedChitOutstanding: 1000, projectedNewCredit: 400,
        allocations: [{ chitId: 'chit-1', monthNumber: 1, catchUpLine: false, creditApplied: 200, newPaymentApplied: 800 }],
      } });
      if (url.pathname === '/api/payments' && request.method() === 'POST') {
        posted.push(await request.postDataJSON());
        return json({ success: true, data: { id: 'payment-1' } });
      }
      return null;
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/payments/record');
  await page.locator('select').filter({ has: page.locator('option[value="member-1"]') }).selectOption('member-1');
  await page.getByRole('button', { name: 'Auto-apply extra' }).click();
  await page.locator('select').filter({ has: page.locator('option[value="chit-1"]') }).selectOption('chit-1');
  await page.getByRole('button', { name: 'UPI', exact: true }).click();
  await page.getByPlaceholder('UPI UTR, bank reference or cheque number').fill('UTR-12345');
  await page.locator('input[type="number"]').last().fill('1200');
  await page.getByRole('button', { name: 'Record UPI Payment' }).click();

  await expect(page.getByText('Review payment allocation')).toBeVisible();
  await expect(page.getByText('New member credit')).toBeVisible();
  await expect(page.getByText('New member credit').locator('..').getByText('₹400', { exact: true })).toBeVisible();
  expect(posted).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  expect(posted).toHaveLength(0);

  await page.getByRole('button', { name: 'Record UPI Payment' }).click();
  await page.getByRole('button', { name: 'Proceed with payment' }).click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0]).toMatchObject({ chitId: 'chit-1', memberId: 'member-1', amount: 1200, paymentMode: 'UPI' });
  expect(posted[0].balanceVersion).toBe('balance-v1');
  expect(posted[0].allocations).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
