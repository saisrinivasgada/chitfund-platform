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
  await expect(page.getByText('r***@example.com').first()).toBeVisible();
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

  // Enter 6-digit OTP into digit boxes (OtpCodeInput renders maxLength={length} = 6)
  const otpBoxes = page.locator('input[maxlength="6"]');
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

// ── Password rules UI ──────────────────────────────────────────────────────

async function setupPageWithDetails(page) {
  await page.route('**/api/auth/org-user-setup**', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill(json({ status: 'success', data: mockDetails }));
    } else {
      route.fulfill(json({ status: 'success', data: null }));
    }
  });
  await page.goto(`/org-user-setup?token=${MOCK_TOKEN}`);
  await expect(page.getByText('Sunrise Chit Fund')).toBeVisible();
}

test('password rules checklist shows all 6 rules when user starts typing', async ({ page }) => {
  await setupPageWithDetails(page);
  await page.getByPlaceholder(/at least 8 characters/i).fill('a');
  const rules = page.getByTestId('password-rules');
  await expect(rules.getByText(/at least 8 characters/i)).toBeVisible();
  await expect(rules.getByText(/uppercase/i)).toBeVisible();
  await expect(rules.getByText(/lowercase/i)).toBeVisible();
  await expect(rules.getByText(/number/i)).toBeVisible();
  await expect(rules.getByText(/special/i)).toBeVisible();
  await expect(rules.getByText(/passwords match/i)).toBeVisible();
});

test('uppercase rule unmet for all-lowercase password', async ({ page }) => {
  await setupPageWithDetails(page);
  await page.getByPlaceholder(/at least 8 characters/i).fill('alllower1!');
  const rules = page.getByTestId('password-rules');
  // Uppercase rule — dot should be gray (unmet)
  const upperRow = rules.locator('div').filter({ hasText: /uppercase/i }).first();
  await expect(upperRow.locator('.bg-gray-300')).toBeVisible();
  await expect(upperRow.locator('.bg-green-500')).not.toBeVisible();
});

test('number rule unmet for password with no digit', async ({ page }) => {
  await setupPageWithDetails(page);
  await page.getByPlaceholder(/at least 8 characters/i).fill('NoNumber!');
  const rules = page.getByTestId('password-rules');
  const numRow = rules.locator('div').filter({ hasText: /number/i }).first();
  await expect(numRow.locator('.bg-gray-300')).toBeVisible();
});

test('special character rule unmet for alphanumeric password', async ({ page }) => {
  await setupPageWithDetails(page);
  await page.getByPlaceholder(/at least 8 characters/i).fill('NoSpecial1A');
  const rules = page.getByTestId('password-rules');
  const specialRow = rules.locator('div').filter({ hasText: /special/i }).first();
  await expect(specialRow.locator('.bg-gray-300')).toBeVisible();
});

test('submit button disabled until all password rules satisfied', async ({ page }) => {
  await setupPageWithDetails(page);

  // Send OTP first
  await page.route('**/api/auth/org-user-setup**/email-otp', (route) => {
    route.fulfill(json({ status: 'success', data: null }));
  });
  await page.getByRole('button', { name: /send verification code/i }).click();

  // Weak password — button must remain disabled
  await page.getByPlaceholder(/at least 8 characters/i).fill('weak');
  await page.getByPlaceholder(/repeat your password/i).fill('weak');
  await page.locator('input[type="checkbox"]').check();
  await expect(page.getByRole('button', { name: /activate account/i })).toBeDisabled();

  // Strong password satisfying all rules — button must become enabled
  await page.getByPlaceholder(/at least 8 characters/i).fill('Str0ng!Pass');
  await page.getByPlaceholder(/repeat your password/i).fill('Str0ng!Pass');
  await expect(page.getByRole('button', { name: /activate account/i })).toBeEnabled();
});

test('shows backend error message verbatim including breached-password rejection', async ({ page }) => {
  await page.route('**/api/auth/org-user-setup**', (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    if (method === 'GET') {
      route.fulfill(json({ status: 'success', data: mockDetails }));
    } else if (method === 'POST' && url.pathname.endsWith('/email-otp')) {
      route.fulfill(json({ status: 'success', data: null }));
    } else if (method === 'POST' && url.pathname.endsWith('/complete')) {
      route.fulfill(json({ status: 'error', message: 'This password has appeared in a data breach. Please choose a different password.' }, 422));
    } else {
      route.fulfill(json({ status: 'error', message: 'unexpected' }, 400));
    }
  });

  await page.goto(`/org-user-setup?token=${MOCK_TOKEN}`);
  await expect(page.getByText('Sunrise Chit Fund')).toBeVisible();

  await page.getByRole('button', { name: /send verification code/i }).click();
  await expect(page.locator('input[maxlength="6"]').first()).toBeVisible({ timeout: 3000 });

  for (let i = 0; i < 6; i++) {
    await page.locator('input[maxlength="6"]').nth(i).fill(String(i + 1));
  }

  await page.getByPlaceholder(/at least 8 characters/i).fill('Str0ng!Pass');
  await page.getByPlaceholder(/repeat your password/i).fill('Str0ng!Pass');
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /activate account/i }).click();

  await expect(page.getByText(/appeared in a data breach/i)).toBeVisible({ timeout: 5000 });
});
