import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

test('deletion request is tied to the signed-in account and fits phone and tablet screens', async ({ page }) => {
  let submitted = null;
  let requestKey = null;
  await installAuthenticatedApp(page, {
    resolveApi: async ({ request, url, json }) => {
      if (url.pathname !== '/api/users/me/deletion-request') return null;
      if (request.method() === 'GET') return json({ success: true, data: { status: 'NONE' } });
      submitted = request.postDataJSON();
      requestKey = request.headers()['idempotency-key'];
      return json({ success: true, data: { requestId: 'delete-123', status: 'PENDING' } });
    },
  });

  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: 'Delete my ChitWise account' })).toBeVisible();
  await expect(page.getByText('Acceptance Admin', { exact: true })).toBeVisible();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 820 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const submitButton = page.getByRole('button', { name: 'Request account deletion' });
  await expect(submitButton).toBeDisabled();
  await page.getByRole('textbox', { name: 'Type DELETE to request account deletion' }).fill('DELETE');
  await submitButton.click();
  await expect(page.getByText('Reference: delete-123')).toBeVisible();
  expect(submitted).toEqual({ confirmation: 'DELETE' });
  expect(requestKey).toMatch(/^[0-9a-f-]{36}$/i);
});

test('an existing deletion request is shown automatically and cannot be submitted twice', async ({ page }) => {
  const writes = [];
  await installAuthenticatedApp(page, {
    resolveApi: async ({ request, url, json }) => {
      if (url.pathname !== '/api/users/me/deletion-request') return null;
      if (request.method() === 'GET') return json({ success: true, data: {
        requestId: 'delete-existing', status: 'PENDING', nextStep: 'Identity review is in progress.',
      } });
      writes.push(request.method());
      return json({ success: true, data: {} });
    },
  });
  await page.goto('/delete-account');
  await expect(page.getByText('Reference: delete-existing')).toBeVisible();
  await expect(page.getByText('Identity review is in progress.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request account deletion' })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('a failed status check does not create a duplicate deletion request', async ({ page }) => {
  const writes = [];
  await installAuthenticatedApp(page, {
    resolveApi: async ({ request, url, json }) => {
      if (url.pathname !== '/api/users/me/deletion-request') return null;
      if (request.method() === 'GET') return json({ success: false, message: 'Unavailable' }, 503);
      writes.push(request.method());
      return json({ success: true, data: {} });
    },
  });
  await page.goto('/delete-account');
  await expect(page.getByText('We could not load your request status. You can still contact our privacy team below.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request account deletion' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Email a deletion request' })).toBeVisible();
  expect(writes).toEqual([]);
});

test('public deletion page gives signed-out users a direct request path', async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: 'Delete my ChitWise account' })).toBeVisible();
  await expect(page.getByText('No longer have access to the app?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Email a deletion request' })).toHaveAttribute('href', /mailto:help@thechitwise\.com/);
  for (const path of ['/privacy', '/terms']) {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 768, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Request account deletion' })).toBeVisible();
  }
});

test('hub deletion path cannot submit an organisation account request', async ({ page }) => {
  await installAuthenticatedApp(page);
  await page.goto('/delete-account?source=hub');
  await expect(page.getByText('Request deletion of this account')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request account deletion' })).toHaveCount(0);
});

test('platform admin cannot submit an organisation deletion request', async ({ page }) => {
  await installAuthenticatedApp(page, {
    user: {
      id: '00000000-0000-0000-0000-0000000000bb',
      username: 'platform-admin',
      fullName: 'Platform Admin',
      role: 'SUPER_ADMIN',
    },
  });
  await page.goto('/delete-account');
  await expect(page.getByText('Request deletion of this account')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request account deletion' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Email a deletion request' })).toBeVisible();
});
