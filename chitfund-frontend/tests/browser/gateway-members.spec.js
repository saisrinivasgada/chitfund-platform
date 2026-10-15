import { createHmac, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { test, expect } from '@playwright/test';
import { TEST_TENANT } from './fixtures';

const GATEWAY_URL = process.env.CHITWISE_GATEWAY_URL ?? 'http://127.0.0.1:9080';
const USER_SERVICE_URL = process.env.CHITWISE_TEST_USER_URL ?? 'http://127.0.0.1:9081';
const JWT_SECRET = 'test-only-jwt-secret-not-for-production-min-32-chars';

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function disposableAdminToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: '00000000-0000-0000-0000-0000000000aa',
    username: 'gateway-browser-admin',
    role: 'ADMIN',
    tenantId: TEST_TENANT,
    tenantSlug: 'test-org',
    tenantPlan: 'ENTERPRISE',
    tenantStatus: 'ACTIVE',
    iat: now,
    exp: now + 2 * 60 * 60,
  });
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function installGatewaySession(page, token) {
  await page.addInitScript(({ jwt, tenantId }) => {
    localStorage.setItem('user', JSON.stringify({
      id: '00000000-0000-0000-0000-0000000000aa',
      username: 'gateway-browser-admin',
      name: 'Gateway Browser Admin',
      fullName: 'Gateway Browser Admin',
      role: 'ADMIN',
    }));
    localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('tenantSlug', 'test-org');
    localStorage.setItem('tenantName', 'Disposable Gateway Organization');
    localStorage.setItem('tenantPlan', 'ENTERPRISE');
    localStorage.setItem('tenantStatus', 'ACTIVE');
    localStorage.setItem('planExpiresAt', '2099-12-31T23:59:59Z');
    localStorage.setItem('analyticsEnabled', 'true');
    localStorage.setItem('chatEnabled', 'false');
    localStorage.setItem('settlementEnabled', 'true');
    sessionStorage.setItem('token', jwt);
    sessionStorage.setItem('notes_shown', '1');
  }, { jwt: token, tenantId: TEST_TENANT });
}

test.describe('disposable gateway browser journey', () => {
  test.skip(process.env.CHITWISE_GATEWAY_E2E !== '1', 'requires docker-compose.test.yml on loopback');

  test('creates a member through the gateway and renders that server value', async ({ page, request }) => {
    const token = disposableAdminToken();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const marker = randomUUID().slice(0, 8);
    const fullName = `Gateway Member ${marker}`;
    const email = `gateway-${marker}@example.test`;
    let memberId;

    try {
      // A container health endpoint can turn green just before its first
      // cross-service connection is warm. Probe both sides of the member-plan
      // check before performing a non-idempotent create operation.
      await expect.poll(async () => (await request.get(
        `${USER_SERVICE_URL}/internal/tenants/${TEST_TENANT}/effective-limits`,
        { headers: { 'X-Internal-Key': 'test-internal-service-key' } },
      )).status(), {
        message: 'user-service internal entitlement lookup should be ready',
        timeout: 60_000,
      }).toBe(200);
      await expect.poll(async () => (await request.get(`${GATEWAY_URL}/api/members?size=1`, { headers })).status(), {
        message: 'member-service should be ready through the gateway',
        timeout: 60_000,
      }).toBe(200);

      const created = await request.post(`${GATEWAY_URL}/api/members`, {
        headers,
        data: {
          fullName,
          email,
          phoneCountryCode: '+91',
          phone: String(9100000000 + Math.floor(Math.random() * 80000000)),
          sendAppAccess: false,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      memberId = (await created.json()).data.id;

      await installGatewaySession(page, token);
      // A fresh disposable schema has no persisted organization admin: V99's
      // legacy admin becomes SUPER_ADMIN in V107 and is removed by V145. Mock
      // only these identity-bound session reads; member create/list/delete
      // remain real browser -> Vite -> gateway -> member-service -> MySQL calls.
      await page.route('**/api/users/me/effective-limits', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {
          plan: 'GROWTH', tenantStatus: 'ACTIVE', planExpiresAt: '2099-12-31T23:59:59Z',
          analyticsEnabled: false, chatEnabled: false, settlementEnabled: true,
        } }),
      }));
      await page.route('**/api/users/me/billing-info', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { planExpiresAt: '2099-12-31T23:59:59Z' } }),
      }));
      await page.route('**/api/users/me/tenant-limits', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {
          maxMembers: -1,
          maxActiveChits: -1,
          maxStaff: -1,
        } }),
      }));
      await page.goto('/members');
      await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
      await expect(page.getByText(fullName, { exact: true })).toBeVisible();
      await expect(page.getByText(email, { exact: true })).toBeVisible();
    } finally {
      if (memberId) {
        const removed = await request.delete(`${GATEWAY_URL}/api/members/${memberId}`, {
          headers,
        });
        expect([200, 204]).toContain(removed.status());
      }
    }
  });
});
