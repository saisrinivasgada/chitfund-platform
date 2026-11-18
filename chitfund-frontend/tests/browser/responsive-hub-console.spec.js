import { test, expect } from '@playwright/test';

test('Hub and platform console shells fit phone, iPad, and desktop browser widths', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hub_user', JSON.stringify({
      id: 'hub-admin-qa', username: 'hub-admin-qa', role: 'SUPER_ADMIN', mustChangePassword: false,
    }));
    sessionStorage.setItem('hub_token', 'hub-qa-token');
    sessionStorage.setItem('hub_saas_token', 'saas-qa-token');
  });
  await page.route('**/ws/**', (route) => route.abort());
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }),
  }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/hub/tickets', '/hub/chat', '/hub/employees', '/superadmin',
      '/superadmin/tenants', '/superadmin/plans', '/superadmin/billing']) {
      await page.goto(route);
      await expect(page.locator('main').first(), `${route} at ${width}px`).toBeVisible();
      expect(errors.splice(0), `${route} at ${width}px must render without a runtime error`).toEqual([]);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} at ${width}px must not scroll sideways`).toBeLessThanOrEqual(1);
    }
  }
});

test('populated Hub and platform tables stay usable at phone, iPad, and desktop widths', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hub_user', JSON.stringify({
      id: 'hub-admin-qa', username: 'hub-admin-qa', role: 'SUPER_ADMIN', mustChangePassword: false,
    }));
    sessionStorage.setItem('hub_token', 'hub-qa-token');
    sessionStorage.setItem('hub_saas_token', 'saas-qa-token');
  });
  await page.route('**/ws/**', (route) => route.abort());
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/hub/employees'
      ? [{ id: 'employee-1', fullName: 'Support Employee', username: 'support-1', email: 'support@example.test',
        role: 'SUPPORT_AGENT', status: 'ACTIVE', active: true, employeeId: 'CW-102' }]
      : path === '/api/super-admin/tenants'
        ? [{ id: 'tenant-1', name: 'Pilot Chit Fund', slug: 'pilot-chit', plan: 'BASIC', status: 'ACTIVE',
          memberCount: 20, contactEmail: 'pilot@example.test', contactPhone: '9000000000' }]
        : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, rowText] of [['/hub/employees', 'Support Employee'], ['/superadmin/tenants', 'Pilot Chit Fund']]) {
      await page.goto(route);
      await expect(page.locator('table tbody tr').filter({ hasText: rowText })).toBeVisible();
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} at ${width}px must keep horizontal table scrolling inside its card`).toBeLessThanOrEqual(1);
    }
  }
});
