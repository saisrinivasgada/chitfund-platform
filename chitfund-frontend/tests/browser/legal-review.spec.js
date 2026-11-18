import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

test('updated terms require an explicit choice and send document versions', async ({ page }) => {
  let accepted = null;
  await installAuthenticatedApp(page, {
    resolveApi: async ({ request, url, json }) => {
      if (url.pathname === '/api/legal/status') return json({ success: true, data: {
        required: true,
        terms: { version: '2.0', documentUrl: '/api/legal/documents/terms/2.0', effectiveDate: '2026-12-01', summary: 'Billing terms changed.', requiresAcceptance: true },
        privacy: { version: '1.1', documentUrl: '/api/legal/documents/privacy/1.1', summary: 'Support access was clarified.', requiresAcknowledgment: true },
      } });
      if (url.pathname === '/api/legal/accept' && request.method() === 'POST') {
        accepted = request.postDataJSON();
        return json({ success: true, data: { required: false } });
      }
      return null;
    },
  });

  await page.goto('/legal-review');
  await expect(page.getByRole('heading', { name: 'Review updated documents' })).toBeVisible();
  await expect(page.getByText('Billing terms changed.')).toBeVisible();
  await expect(page.getByText('Support access was clarified.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read the full Terms of Service' })).toHaveAttribute('href', '/api/legal/documents/terms/2.0');
  const agree = page.getByRole('button', { name: 'Agree & continue' });
  await expect(agree).toBeDisabled();
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 820 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('checkbox').check();
  await agree.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(accepted).toEqual({
    termsVersion: '2.0', privacyVersion: '1.1', termsAccepted: true, privacyAcknowledged: true,
  });
});

test('privacy-only update asks for acknowledgement rather than consent', async ({ page }) => {
  await installAuthenticatedApp(page, {
    resolveApi: async ({ url, json }) => url.pathname === '/api/legal/status' ? json({ success: true, data: {
      required: true,
      terms: { requiresAcceptance: false },
      privacy: { version: '1.2', documentUrl: '/api/legal/documents/privacy/1.2', summary: 'Our retention details changed.', requiresAcknowledgment: true },
    } }) : null,
  });
  await page.goto('/legal-review');
  await expect(page.getByRole('button', { name: 'Acknowledge & continue' })).toBeDisabled();
  await expect(page.getByText('A Privacy Policy acknowledgement does not give consent for a new use of your data.', { exact: false })).toBeVisible();
});

test('Hub invite requires legal acknowledgement before activation', async ({ page }) => {
  await page.goto('/hub/accept-invite?token=invite-test');
  const activate = page.getByRole('button', { name: 'Activate account' });
  await expect(activate).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  await page.getByRole('checkbox').check();
  await expect(activate).toBeEnabled();
});

test('an incomplete server review response cannot be treated as acceptance', async ({ page }) => {
  await installAuthenticatedApp(page, {
    resolveApi: async ({ url, json }) => url.pathname === '/api/legal/status'
      ? json({ success: true, data: { required: true } }) : null,
  });
  await page.goto('/legal-review');
  await expect(page.getByText('The latest document details are unavailable. Please retry.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to ChitWise' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Agree & continue' })).toHaveCount(0);
});

test('a version without its full document cannot be accepted', async ({ page }) => {
  await installAuthenticatedApp(page, {
    resolveApi: async ({ url, json }) => url.pathname === '/api/legal/status'
      ? json({ success: true, data: { required: true, terms: {
        version: '2.0', requiresAcceptance: true, documentUrl: '/terms',
      } } }) : null,
  });
  await page.goto('/legal-review');
  await expect(page.getByText('The full version of the updated document is unavailable. Please retry.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agree & continue' })).toHaveCount(0);
});

test('a document link for a different version cannot authorize the current terms', async ({ page }) => {
  await installAuthenticatedApp(page, {
    resolveApi: async ({ url, json }) => url.pathname === '/api/legal/status'
      ? json({ success: true, data: { required: true, terms: {
        version: '2.0', requiresAcceptance: true, documentUrl: '/api/legal/documents/terms/1.0',
      } } }) : null,
  });
  await page.goto('/legal-review');
  await expect(page.getByText('The full version of the updated document is unavailable. Please retry.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agree & continue' })).toHaveCount(0);
});
