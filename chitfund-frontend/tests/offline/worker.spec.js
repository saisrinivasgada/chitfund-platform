import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function preparedBrowser(page, context) {
  await page.goto('/__offline-harness');
  await page.waitForFunction(() => !!window.harness);
  const account = await page.evaluate(async () => {
    const user = { id: 'actor-a', username: 'user-a', fullName: 'User a', role: 'ADMIN' };
    const tenant = { tenantId: 'org-a', tenantName: 'Organisation a', tenantSlug: 'org-a', tenantStatus: 'ACTIVE', tenantPlan: 'GROWTH' };
    const account = await window.harness.rememberAccount(user, tenant, 'access-a');
    localStorage.setItem('user', JSON.stringify(user));
    for (const [key, value] of Object.entries(tenant)) localStorage.setItem(key, value);
    localStorage.setItem('planExpiresAt', '2030-01-01T00:00:00');
    return { scope: account.scope, browserAccountId: account.browserAccountId };
  });
  await context.addCookies([{ name: `chitwise_account_${account.browserAccountId}`, value: 'refresh-a',
    domain: '127.0.0.1', path: `/api/auth/accounts/${account.browserAccountId}`, httpOnly: true, sameSite: 'Strict' }]);
  await page.evaluate(async (scope) => {
    await window.harness.refreshOfflineAccess(scope);
    await navigator.serviceWorker.register('/offline-worker.js', { type: 'module' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  }, account.scope);
  return account;
}

test('production app shell can reopen a signed-in organisation while fully offline', async ({ page, context }) => {
  const account = await preparedBrowser(page, context);
  await page.evaluate(async (scope) => {
    // Seed the dashboard's actual read as well as the activity feed's read.
    // Previously the missing size=50 read silently appeared as zero members.
    for (const size of [50, 200]) await window.harness.saveCachedResponse(scope, { method: 'get', url: '/members', params: { size } },
      { success: true, data: [{ id: 'member-a', fullName: 'Saved Member', status: 'ACTIVE' }] });
    await window.harness.saveCachedResponse(scope, { method: 'get', url: '/chits', params: {} }, { success: true, data: [] });
  }, account.scope);
  await context.setOffline(true);
  await page.goto('/dashboard');
  await expect(page.getByText('Offline · showing saved data', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
  await expect(page.getByText('Saved Member', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accounts', exact: true })).toBeVisible();
  await expect.poll(() => page.getByAltText('ChitWise Admin').first().evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
});

test('production offline shell distinguishes an unfinished download from an empty dashboard', async ({ page, context }) => {
  await preparedBrowser(page, context);
  await context.setOffline(true);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Accounts', exact: true })).toBeVisible();
});

test('service worker delivers a saved payment after its tab closes without a persisted bearer token', async ({ page, context, request }) => {
  const account = await preparedBrowser(page, context);
  const operationId = `closed-tab-${Date.now()}`;
  await page.evaluate(async ({ scope, operationId }) => {
    await window.harness.queuePayment(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 300,
      paymentMode: 'CASH', idempotencyKey: operationId });
  }, { scope: account.scope, operationId });
  await page.evaluate(() => navigator.serviceWorker.controller.postMessage({ type: 'SYNC_SAVED_PAYMENTS' }));
  await page.close();
  await expect.poll(async () => {
    const response = await request.get('/__test/receipts');
    return (await response.json()).filter((receipt) => receipt.operationId === operationId).length;
  }).toBe(1);
  const reopened = await context.newPage();
  await reopened.goto('/__offline-harness');
  await reopened.waitForFunction(() => !!window.harness);
  const state = await reopened.evaluate(async (operationId) => {
    const row = (await window.harness.readRows('outbox')).find((entry) => entry.operationId === operationId);
    const accounts = await window.harness.readRows('accounts');
    return { status: row.status, persistedBearer: JSON.stringify({ row, accounts }).includes('access-a') };
  }, operationId);
  expect(state).toEqual({ status: 'SUCCEEDED', persistedBearer: false });
});

test('production app reopens offline without the add-on with a connection notice and no business or sync controls', async ({ page, context }) => {
  const account = await preparedBrowser(page, context);
  await page.evaluate(async (scope) => {
    await window.harness.mutateRow('accounts', scope, (row) => ({ ...row, tenant: { ...row.tenant, offlineEnabled: false }, offlineAccess: { ...row.offlineAccess, enabled: false, reason: 'ADD_ON_REQUIRED', grant: null } }));
  }, account.scope);
  await context.setOffline(true); await page.goto('/payments/record');
  await expect(page.getByRole('heading', { name: 'No internet connection' })).toBeVisible();
  await expect(page.getByText(/hasn’t subscribed to Offline access & sync/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Sync now|saved payment|Record Cash Payment/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Welcome back|Record Payment/ })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/chitwise-pwa-no-addon.png' });
});

test('background sync rejects transport backoff and registers another event for a ready remainder', async () => {
  const source=(await readFile(new URL('../../src/offline/worker.js',import.meta.url),'utf8')).replace(/^import .*\n/, '');
  for(const [outcome, rejection, registrations] of [
    [{retryNeeded:true,nextAttemptAt:Date.now()+60000},true,0],
    [{retryNeeded:true,nextAttemptAt:0},false,1],
    [{retryNeeded:false,nextAttemptAt:null},false,0],
  ]) {
    const handlers=new Map();const tags=[];
    const worker={addEventListener:(name,handler)=>handlers.set(name,handler),registration:{sync:{register:async tag=>tags.push(tag)}}};
    new Function('self','syncSavedPayments','__CHITWISE_OFFLINE_BUILD__',source)(worker,async()=>outcome,'test-build');
    let completion;handlers.get('sync')({tag:'chitwise-payments',waitUntil:value=>{completion=value;}});
    if(rejection) await expect(completion).rejects.toThrow('another background sync attempt'); else await completion;
    expect(tags).toEqual(Array(registrations).fill('chitwise-payments'));
  }
});

async function queueWithoutAutomaticWake(page,scope,prefix,count) {
  return page.evaluate(async({scope,prefix,count})=>{
    // Control wake-up timing, not authentication or transport. The production
    // worker still handles every delivery through the real fixture HTTP API.
    const worker=navigator.serviceWorker;const original=worker.getRegistration;
    worker.getRegistration=async()=>undefined;
    try { for(let i=0;i<count;i++) await window.harness.queuePayment(scope,{memberId:'member-a',chitId:'chit-a',amount:300,paymentMode:'CASH',idempotencyKey:`${prefix}-${i}`}); }
    finally { worker.getRegistration=original; }
  },{scope,prefix,count});
}

test('a closed tab continues a queue larger than one worker batch',async({page,context,request})=>{
  const account=await preparedBrowser(page,context);const prefix=`closed-backlog-${Date.now()}`;
  await queueWithoutAutomaticWake(page,account.scope,prefix,26);
  await page.evaluate(()=>navigator.serviceWorker.controller.postMessage({type:'SYNC_SAVED_PAYMENTS'}));
  await page.close();
  await expect.poll(async()=>{
    const response=await request.get('/__test/receipts');return (await response.json()).filter(r=>r.operationId.startsWith(prefix)).length;
  },{timeout:20000}).toBe(26);
});

test('transport failure and exhausted time budget report remaining delivery rather than success',async({page,context,request})=>{
  const account=await preparedBrowser(page,context);const prefix=`retry-503-${Date.now()}`;
  await queueWithoutAutomaticWake(page,account.scope,prefix,1);
  const outcome=await page.evaluate(async()=>{
    const budget=await window.harness.syncSavedPayments({deadline:Date.now()});
    const transport=await window.harness.syncSavedPayments();
    return {budget,transport};
  });
  expect(outcome.budget).toMatchObject({retryNeeded:true,remaining:1});
  expect(outcome.transport).toMatchObject({retryNeeded:true,remaining:1});
  expect(outcome.transport.nextAttemptAt).toBeGreaterThan(Date.now()-1000);
  await page.evaluate(async()=>{
    // Advance the persisted backoff without making this test sleep. A later
    // native worker event must retry the unchanged operation identity.
    const row=(await window.harness.readRows('outbox'))[0];
    await window.harness.mutateRow('outbox',row.key,current=>({...current,nextAttemptAt:0}));
    navigator.serviceWorker.controller.postMessage({type:'SYNC_SAVED_PAYMENTS'});
  });
  await page.close();
  await expect.poll(async()=>{
    const response=await request.get('/__test/receipts');return (await response.json()).filter(r=>r.operationId===`${prefix}-0`).length;
  }).toBe(1);
});
