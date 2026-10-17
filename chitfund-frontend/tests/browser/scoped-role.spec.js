import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { installAuthenticatedApp, expectAuthenticatedShell, TEST_TENANT } from './fixtures';

test('session restoration uses the selected organisation role instead of the primary user role', async ({ page }) => {
  const user = { id: '20000000-0000-0000-0000-000000000001', username: 'scoped-role-qa', fullName: 'Scoped Role QA', role: 'STAFF', mustChangePassword: false };
  await installAuthenticatedApp(page, { user, tenantRole: 'ADMIN' });
  await page.goto('/dashboard'); await expectAuthenticatedShell(page);
  await expect(page.locator('nav').getByRole('link', { name: 'Members', exact: true })).toBeVisible();
  const expectedScope = `WEB:${user.id}:${TEST_TENANT}:ADMIN`;
  await expect.poll(() => page.evaluate(async () => {
    const { readRows } = await import('/src/offline/storage.js');
    return (await readRows('accounts'))[0]?.scope;
  })).toBe(expectedScope);
  const identity = await page.evaluate(async () => {
    const { readRows } = await import('/src/offline/storage.js');
    const account = (await readRows('accounts'))[0];
    return { role: account.user.role, browserAccountId: account.browserAccountId };
  });
  expect(identity.role).toBe('ADMIN');
  expect(identity.browserAccountId).toBe(createHash('sha256').update(expectedScope).digest('hex').slice(0, 32));
});
