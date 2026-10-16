import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures';

test.use({ serviceWorkers: 'block' });

async function reviewApp(page, { stale = false } = {}) {
  const entry = { id: 'review-a', memberId: 'member-a', chitId: 'chit-a', amount: 1000, paymentMode: 'CASH',
    recordedAt: '2026-10-15T12:00:00Z', reviewReason: 'DUES_CHANGED', status: 'PENDING' };
  let pending = true; let version = 'balance-1'; const decisions = [];
  await installAuthenticatedApp(page, { resolveApi: ({ url, request, json }) => {
    if (url.pathname === '/api/payments/offline/reviews') return json({ success: true, data: { content: pending ? [entry] : [], last: true } });
    if (url.pathname === '/api/payments/offline/reviews/review-a') return json({ success: true, data: {
      ...entry, balance: { version, selectedOutstanding: 0, totalOutstanding: 0, creditBalance: 0 },
      recentPayments: [{ id: 'original-receipt', totalAmount: 1000, paymentMode: 'CASH', status: 'COMPLETED', recordedAt: '2026-10-15T13:00:00Z' }],
    } });
    if (url.pathname.endsWith('/review-a/resolve')) {
      decisions.push(request.postDataJSON());
      if (stale && decisions.length === 1) {
        version = 'balance-2';
        return { ...json({ success: false, errorCode: 'CONCURRENT_MODIFICATION', message: 'Member balances changed during review. Refresh the figures and review again.' }), status: 409 };
      }
      pending = false; return json({ success: true, data: { ...entry, status: 'APPLIED', receiptId: 'new-receipt' } });
    }
    if (url.pathname === '/api/members/member-a') return json({ success: true, data: { fullName: 'Meera Rao' } });
    if (url.pathname === '/api/chits/chit-a') return json({ success: true, data: { name: 'Monthly Chit' } });
    return null;
  } });
  await page.goto('/dashboard'); await expectAuthenticatedShell(page);
  await page.getByRole('button', { name: 'Collection reviews', exact: true }).click();
  await page.getByRole('button', { name: /₹1,000 · CASH/ }).click();
  await expect(page.getByText(/₹1,000 collected · ₹0 currently due/)).toBeVisible();
  return decisions;
}

test('reviewing cleared dues requires a deliberate decision and reason', async ({ page }, testInfo) => {
  const decisions = await reviewApp(page);
  const confirm = page.getByRole('button', { name: 'Confirm reviewed decision' });
  await expect(confirm).toBeDisabled();
  await page.getByRole('radio', { name: /I verified this is a separate collection/ }).check();
  await expect(confirm).toBeDisabled();
  await page.getByRole('textbox', { name: 'Review reason' }).fill('Verified this separate cash collection with Meera');
  await expect(page.getByText('Meera Rao · Monthly Chit')).toBeVisible();
  await expect(confirm).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('review-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(confirm).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('review-mobile.png') });
  await confirm.click();
  await expect(page.getByText('No collections waiting for review.')).toBeVisible();
  expect(decisions).toEqual([{ decision: 'APPLY_WITH_EXCESS', reason: 'Verified this separate cash collection with Meera', expectedBalanceVersion: 'balance-1' }]);
});

test('changed balances require refreshed figures and a new explicit decision', async ({ page }) => {
  const decisions = await reviewApp(page, { stale: true });
  await page.getByRole('radio', { name: /I verified this is a separate collection/ }).check();
  await page.getByRole('textbox', { name: 'Review reason' }).fill('Verified the separate cash collection');
  await page.getByRole('button', { name: 'Confirm reviewed decision' }).click();
  await expect(page.getByRole('alert')).toContainText('balances changed');
  await expect(page.getByRole('button', { name: 'Confirm reviewed decision' })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh figures' }).click();
  await page.getByRole('radio', { name: /This is the same collection/ }).check();
  await page.getByLabel('Original payment receipt').selectOption('original-receipt');
  await page.getByRole('textbox', { name: 'Review reason' }).fill('Verified it is the same cash collection as the original receipt');
  await page.getByRole('button', { name: 'Confirm reviewed decision' }).click();
  await expect(page.getByText('No collections waiting for review.')).toBeVisible();
  expect(decisions[1]).toMatchObject({ decision: 'LINK_DUPLICATE', expectedBalanceVersion: 'balance-2', existingReceiptId: 'original-receipt' });
});

test('another collection for a member with unresolved saved money requires an explicit separate-collection confirmation', async ({ page }) => {
  let posted = 0;
  await installAuthenticatedApp(page, { resolveApi: ({ request, url, json }) => {
    if (url.pathname === '/api/members') return json({ success: true, data: [{ id: 'member-a', fullName: 'Meera Rao', status: 'ACTIVE' }] });
    if (url.pathname === '/api/chits/member/member-a') return json({ success: true, data: [{ id: 'chit-a', name: 'Monthly Chit', status: 'ACTIVE', installmentAmount: 1000 }] });
    if (url.pathname === '/api/payments/balance') return json({ success: true, data: { totalOutstanding: 1000 } });
    if (url.pathname === '/api/payments/balance/total') return json({ success: true, data: 1000 });
    if (url.pathname.startsWith('/api/payments/credits/')) return json({ success: true, data: { balance: 0 } });
    if (url.pathname === '/api/payments' && request.method() === 'POST') { posted++; return json({ success: true, data: { id: 'unexpected' } }); }
    return null;
  } });
  await page.goto('/payments/record'); await expectAuthenticatedShell(page);
  await page.evaluate(async () => {
    const { activeAccountScope } = await import('/src/offline/accountClient.js');
    const { writeRow, seal } = await import('/src/offline/storage.js');
    const scope = activeAccountScope();
    await writeRow('outbox', { key: `${scope}:older-cash`, scope, operationId: 'older-cash', status: 'CONFLICT',
      createdAt: Date.now(), encrypted: await seal(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 1000, paymentMode: 'CASH' }) });
  });
  await page.getByRole('combobox').filter({ has: page.locator('option[value="member-a"]') }).selectOption('member-a');
  await page.getByRole('checkbox', { name: /Monthly Chit/ }).check();
  await page.getByRole('button', { name: 'Record Cash Payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payment already saved for this member' })).toBeVisible();
  await expect(page.getByText(/Continue only if you received separate money/)).toBeVisible();
  expect(posted).toBe(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(posted).toBe(0);
});
