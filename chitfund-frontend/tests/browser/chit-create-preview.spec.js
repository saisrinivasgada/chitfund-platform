import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

test('creation review keeps paying and organization slots distinct on phone and tablet', async ({ page }) => {
  let submitted;
  await installAuthenticatedApp(page, {
    resolveApi: async ({ request, url, json }) => {
      if (url.pathname === '/api/chits' && request.method() === 'POST') {
        submitted = await request.postDataJSON();
        return json({ success: true, data: { id: 'created-chit' } });
      }
      return null;
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chits');
  await page.getByRole('button', { name: 'New Chit Fund' }).click();
  await page.getByRole('button', { name: /Lottery Chit/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByPlaceholder('e.g. Family Gold Chit 2027').fill('Three position chit');
  await page.getByPlaceholder('200000').fill('1000');
  await page.getByPlaceholder('20', { exact: true }).fill('2');
  await page.getByPlaceholder('10000').fill('100');
  await page.getByPlaceholder('0', { exact: true }).fill('1');
  await expect(page.getByText('2 paying slots + 1 organization slot = 3 draw positions and months.')).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('table tbody tr').nth(1).getByRole('checkbox').check();
  await page.getByRole('button', { name: /Review/ }).click();

  await expect(page.getByText('2 paying slots + 1 organization slot · 3 months')).toBeVisible();
  await expect(page.getByText('₹600', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 820, height: 1180 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Create Chit Fund' }).last().click();

  await expect.poll(() => submitted).toMatchObject({
    numberOfMembers: 3,
    numberOfMonths: 3,
    payingMemberSlots: 2,
    organizationPayoutSlots: 1,
    orgHeldSpotsCount: 1,
  });
  expect(submitted.reservationSchedule.filter((row) => row.orgHeld)).toHaveLength(1);
});
