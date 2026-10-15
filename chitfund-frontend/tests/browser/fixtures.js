import { expect } from '@playwright/test';

export const TEST_TENANT = '10000000-0000-0000-0000-000000000001';

const defaultUser = {
  id: '00000000-0000-0000-0000-0000000000aa',
  username: 'acceptance-admin',
  name: 'Acceptance Admin',
  fullName: 'Acceptance Admin',
  role: 'ADMIN',
};

function json(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

/**
 * Starts a real rendered React session while keeping the data deterministic.
 * These tests deliberately mock API responses: they prove UI values, filters,
 * navigation and capability states, and are not labelled gateway E2E.
 */
export async function installAuthenticatedApp(page, {
  analyticsEnabled = false,
  settlementEnabled = false,
  user = defaultUser,
  resolveApi,
} = {}) {
  const tenant = {
    tenantId: TEST_TENANT,
    slug: 'acceptance-org',
    name: 'Acceptance Chit Fund',
    plan: 'BASIC',
    status: 'ACTIVE',
    planExpiresAt: '2099-12-31T23:59:59Z',
    analyticsEnabled,
    chatEnabled: false,
    settlementEnabled,
    adminPhone: '9000000000',
    adminEmail: 'admin@example.test',
  };

  await page.addInitScript(({ storedUser, storedTenant }) => {
    localStorage.setItem('user', JSON.stringify(storedUser));
    localStorage.setItem('tenantId', storedTenant.tenantId);
    localStorage.setItem('tenantSlug', storedTenant.slug);
    localStorage.setItem('tenantName', storedTenant.name);
    localStorage.setItem('tenantPlan', storedTenant.plan);
    localStorage.setItem('tenantStatus', storedTenant.status);
    localStorage.setItem('planExpiresAt', storedTenant.planExpiresAt);
    localStorage.setItem('analyticsEnabled', String(storedTenant.analyticsEnabled));
    localStorage.setItem('chatEnabled', String(storedTenant.chatEnabled));
    localStorage.setItem('settlementEnabled', String(storedTenant.settlementEnabled));
    sessionStorage.setItem('notes_shown', '1');
  }, { storedUser: user, storedTenant: tenant });

  await page.route('**/ws/**', (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const custom = await resolveApi?.({ request, url, json });
    if (custom) {
      await route.fulfill(custom);
      return;
    }

    if (url.pathname === '/api/auth/refresh') {
      await route.fulfill(json({
        success: true,
        data: { accessToken: 'browser-acceptance-token', user, tenant },
      }));
      return;
    }
    if (url.pathname === '/api/users/me/effective-limits') {
      await route.fulfill(json({
        success: true,
        data: {
          plan: tenant.plan,
          tenantStatus: tenant.status,
          planExpiresAt: tenant.planExpiresAt,
          analyticsEnabled,
          chatEnabled: false,
          settlementEnabled,
        },
      }));
      return;
    }
    if (url.pathname === '/api/users/me/billing-info') {
      await route.fulfill(json({ success: true, data: { planExpiresAt: tenant.planExpiresAt } }));
      return;
    }
    if (url.pathname === '/api/conversations/unread') {
      await route.fulfill(json({ unread: 0 }));
      return;
    }
    if (url.pathname === '/api/notifications/unread-count') {
      await route.fulfill(json({ success: true, data: { count: 0 } }));
      return;
    }
    await route.fulfill(json({ success: true, data: [] }));
  });
}

export async function expectAuthenticatedShell(page) {
  await expect(page.getByText('Acceptance Chit Fund', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('ADMIN', { exact: true }).first()).toBeVisible();
}
