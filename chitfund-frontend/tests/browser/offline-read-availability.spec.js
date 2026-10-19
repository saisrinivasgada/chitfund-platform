import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures';
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  // External font availability must not hold up a weak-connection data check.
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
});

for (const kind of ['members', 'chits']) test(`an interrupted first ${kind} read is unavailable, then retry restores a real empty list`, async ({ page }) => {
  let available = false;
  const listParameters = [];
  await installAuthenticatedApp(page, { offlineEnabled: true, resolveApi: ({ url, json }) => {
    if (url.pathname === `/api/${kind}`) { listParameters.push([...url.searchParams.keys()]); return available
      ? json({ success: true, data: kind === 'members' ? { content: [], totalElements: 0, totalPages: 0 } : [] })
      : json({ success: false, message: 'Connection interrupted' }, 503); }
  } });
  await page.goto(`/${kind}`, { waitUntil: 'domcontentloaded' }); await expectAuthenticatedShell(page);
  const notice = page.getByTestId('read-unavailable');
  await expect(notice).toBeVisible({ timeout: 20000 });
  await expect(notice).toContainText('We could not load this information');
  await expect(page.getByText(kind === 'members' ? 'No active members' : 'No chit funds yet', { exact: true })).toHaveCount(0);
  if (kind === 'chits') expect(listParameters.every(keys => keys.length === 0)).toBe(true);
  available = true;
  await notice.getByRole('button', { name: 'Try again' }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByText(kind === 'members' ? 'No active members' : 'No chit funds yet', { exact: true })).toBeVisible();
});

test('a denied refresh hides a previously visible member instead of presenting stale access', async ({ page }) => {
  let denied = false;
  await installAuthenticatedApp(page, { resolveApi: ({ url, json }) => {
    if (url.pathname === '/api/members') return denied
      ? json({ success: false, message: 'Access changed' }, 403)
      : json({ success: true, data: { content: [{ id: 'member-availability', fullName: 'Saved member', status: 'ACTIVE' }], totalElements: 1, totalPages: 1 } });
  } });
  await page.goto('/members', { waitUntil: 'domcontentloaded' }); await expectAuthenticatedShell(page);
  await expect(page.getByText('Saved member', { exact: true })).toBeVisible();
  denied = true;
  // Reopen the SAME cached query; a changed search would create a fresh query
  // and fail to prove that previously displayed data is hidden after denial.
  await page.getByRole('link', { name: 'Chits', exact: true }).click();
  await expect(page).toHaveURL(/\/chits$/);
  await page.getByRole('link', { name: 'Members', exact: true }).click();
  await expect(page.getByTestId('read-unavailable')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Saved member', { exact: true })).toHaveCount(0);
});

test('a missing balance never labels an existing member clear', async ({ page }) => {
  await installAuthenticatedApp(page, { resolveApi: ({ url, json }) => {
    if (url.pathname === '/api/members') return json({ success: true, data: { content: [
      { id: 'balance-missing', fullName: 'Balance not downloaded', status: 'ACTIVE' },
      { id: 'balance-zero', fullName: 'Verified zero balance', status: 'ACTIVE' },
    ], totalElements: 2, totalPages: 1 } });
    if (url.pathname === '/api/payments/balance/bulk') return json({ success: true, data: { 'balance-zero': 0 } });
  } });
  await page.goto('/members', { waitUntil: 'domcontentloaded' }); await expectAuthenticatedShell(page);
  const missing = page.getByRole('row').filter({ hasText: 'Balance not downloaded' });
  await expect(missing.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(missing.getByText('Clear', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Verified zero balance' }).getByText('Clear', { exact: true })).toBeVisible();
});

test('an interrupted first chit detail read does not say the chit was deleted', async ({ page }) => {
  await installAuthenticatedApp(page, { resolveApi: ({ url, json }) => {
    if (url.pathname === '/api/chits/chit-missing') return json({ success: false, message: 'Connection interrupted' }, 503);
  } });
  await page.goto('/chits/chit-missing', { waitUntil: 'domcontentloaded' }); await expectAuthenticatedShell(page);
  await expect(page.getByTestId('read-unavailable')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Chit fund not found.', { exact: true })).toHaveCount(0);
});
