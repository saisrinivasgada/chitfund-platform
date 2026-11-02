import { test, expect } from '@playwright/test';

function json(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

const MOCK_TOKEN = 'testtoken123abc';

const mockDetails = {
  username: 'rahulk',
  maskedEmail: 'r***@example.com',
  orgName: 'Sunrise Chit Fund',
  role: 'ADMIN',
  expired: false,
  used: false,
};

test('shows org name, role, username and masked email from token details', async ({ page }) => {
  await page.route('**/api/auth/org-user-setup**', (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.get('token') === MOCK_TOKEN) {
      route.fulfill(json({ status: 'success', data: mockDetails }));
    } else {
      route.fulfill(json({ status: 'error', message: 'unexpected request' }, 400));
    }
  });

  await page.goto(`/org-user-setup?token=${MOCK_TOKEN}`);

  await expect(page.getByText('Sunrise Chit Fund')).toBeVisible();
  await expect(page.getByText('ADMIN')).toBeVisible();
  await expect(page.getByText('rahulk')).toBeVisible();
  await expect(page.getByText('r***@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: /send verification code/i })).toBeVisible();
});

test('shows error state for expired token', async ({ page }) => {
  await page.route('**/api/auth/org-user-setup**', (route) => {
    route.fulfill(json({ status: 'success', data: { ...mockDetails, expired: true } }));
  });

  await page.goto(`/org-user-setup?token=${MOCK_TOKEN}`);

  await expect(page.getByText(/expired/i)).toBeVisible();
});

test('shows error state for used token', async ({ page }) => {
  await page.route('**/api/auth/org-user-setup**', (route) => {
    route.fulfill(json({ status: 'success', data: { ...mockDetails, used: true } }));
  });

  await page.goto(`/org-user-setup?token=${MOCK_TOKEN}`);

  await expect(page.getByText(/already been used/i)).toBeVisible();
});

test('shows invalid link message for missing token', async ({ page }) => {
  await page.goto('/org-user-setup');
  await expect(page.getByText(/invalid setup link/i)).toBeVisible();
});

test('golden path: OTP send, OTP entry, password, submit, success screen', async ({ page }) => {
  let emailOtpPostCalled = false;
  let completePostCalled = false;

  await page.route('**/api/auth/org-user-setup**', (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (method === 'GET') {
      route.fulfill(json({ status: 'success', data: mockDetails }));
    } else if (method === 'POST' && path.endsWith('/email-otp')) {
      emailOtpPostCalled = true;
      route.fulfill(json({ status: 'success', data: null, message: 'Verification code sent' }));
    } else if (method === 'POST' && path.endsWith('/complete')) {
      completePostCalled = true;
      route.fulfill(json({ status: 'success', data: null, message: 'Account setup complete' }));
    } else {
      route.fulfill(json({ status: 'error', message: 'unexpected request' }, 400));
    }
  });

  await page.goto(`/org-user-setup?token=${MOCK_TOKEN}`);

  // Page loaded with org details
  await expect(page.getByText('Sunrise Chit Fund')).toBeVisible();

  // Send OTP
  await page.getByRole('button', { name: /send verification code/i }).click();
  await expect(page.locator('input[aria-label]').first()).toBeVisible({ timeout: 3000 });

  // Enter 6-digit OTP into digit boxes
  const otpBoxes = page.locator('input[maxlength="1"]');
  for (let i = 0; i < 6; i++) {
    await otpBoxes.nth(i).fill(String(i + 1));
  }

  // Enter password
  await page.getByPlaceholder(/at least 8 characters/i).fill('SecurePass!1');
  await page.getByPlaceholder(/repeat your password/i).fill('SecurePass!1');

  // Accept terms
  await page.locator('input[type="checkbox"]').check();

  // Submit
  await page.getByRole('button', { name: /activate account/i }).click();

  // Success screen
  await expect(page.getByText(/account activated/i)).toBeVisible({ timeout: 5000 });

  expect(emailOtpPostCalled).toBe(true);
  expect(completePostCalled).toBe(true);
});
