import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures.js';
for (const outcome of ['COMPLETED', 'REJECTED']) test(`skip draw shows pending until server reports ${outcome}`, async ({ page }) => {
  const id = 'skip-sync-chit'; let phase = 'NOT_SCHEDULED'; const writes = [];
  await installAuthenticatedApp(page, { offlineEnabled: true, resolveApi: ({ url, request, json }) => {
    if (request.method() !== 'GET' && (url.pathname.startsWith('/api/chits/') || url.pathname.startsWith('/api/admin/draws/'))) writes.push(url.pathname);
    if (url.pathname === `/api/chits/${id}`) return json({ success: true, data: {
      id, name: 'Skip Sync QA', chitType: 'RESERVATION', winnerSelectionMode: 'RESERVATION', status: 'ACTIVE', capacity: 1,
      durationMonths: 1, chitValue: 1000, totalAmount: 1000, installmentAmount: 1000, startDate: '2026-10-01', attributes: {},
      orgHeldSpotsCount: 0, scheduleSyncCommandId: phase === 'PENDING' ? 'skip-command' : null,
    } });
    if (url.pathname === `/api/chits/${id}/enrollments`) return json({ success: true, data: [{ id: 'enrol', memberId: 'member', active: true }] });
    if (url.pathname === `/api/chits/${id}/skip-draw`) { phase = 'PENDING'; return json({ success: true, data: { commandId: 'skip-command', status: phase } }, 202); }
    if (url.pathname === `/api/chits/${id}/lifecycle-sync`) return json({ success: true, data: { status: phase, totalOperations: 1 } });
    return null;
  } });
  await page.goto(`/chits/${id}?tab=Draws`); await expectAuthenticatedShell(page);
  await page.getByRole('button', { name: 'Skip Draw', exact: true }).click();
  await page.getByPlaceholder('e.g. Festival holiday, COVID, Admin decision').fill('Festival holiday');
  await page.getByRole('button', { name: 'Skip Draw', exact: true }).last().click();
  const pending = page.getByText('Syncing chit changes and schedule. Related changes will be available when this finishes.', { exact: true });
  await expect(pending).toBeVisible();
  expect(writes).toEqual([`/api/chits/${id}/skip-draw`]); phase = outcome;
  if (outcome === 'REJECTED') await expect(page.getByText('Schedule change was not applied', { exact: true })).toBeVisible();
  await expect(pending).toHaveCount(0);
  expect(writes.filter(path => path.includes('/reservations/shift') || path === '/api/admin/draws/skip')).toHaveLength(0);
});
