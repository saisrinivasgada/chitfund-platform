import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('older unsigned records upload for review rather than automatic payment posting', async ({ page }) => {
  const [account] = await prepare(page);
  await queue(page, account.scope);
  const original = await page.evaluate(async (scope) => {
    const { readRows, mutateRow, seal, unseal } = await import('/src/offline/storage.js');
    const entry = (await readRows('outbox'))[0]; const payload = await unseal(scope, entry.encrypted);
    delete payload.offlineAuthorization;
    const encrypted = await seal(scope, payload);
    await mutateRow('outbox', entry.key, (row) => ({ ...row, encrypted })); return payload;
  }, account.scope);
  const uploaded = [];
  await page.route('**/api/payments/offline/reviews/legacy', (route) => {
    uploaded.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { success: false, errorCode: 'OFFLINE_PAYMENT_REVIEW_REQUIRED',
      data: { reviewId: 'older-review' }, message: 'Original collection needs admin verification' } });
  });
  let ordinaryPosts = 0;
  await page.route('**/api/payments/offline/record', (route) => { ordinaryPosts++; return route.abort(); });
  const result = await page.evaluate(async () => {
    const { syncSavedPayments } = await import('/src/offline/outbox.js');
    const { readRows } = await import('/src/offline/storage.js');
    await syncSavedPayments(); return (await readRows('outbox'))[0];
  });
  expect(uploaded).toEqual([original]); expect(ordinaryPosts).toBe(0);
  expect(result.status).toBe('CONFLICT'); expect(result.reviewId).toBe('older-review');
});

test('a reviewed collection stays preserved and acknowledges a remote decision without posting twice', async ({ page }) => {
  const [account] = await prepare(page);
  await queue(page, account.scope);
  let submissions = 0; let approved = false;
  await page.route('**/api/payments/offline/record', (route) => {
    submissions++;
    return route.fulfill({ status: 409, json: { success: false, errorCode: 'OFFLINE_PAYMENT_REVIEW_REQUIRED',
      message: 'Saved collection needs admin review', data: { reviewId: 'review-a' } } });
  });
  await page.route('**/api/payments/offline/reviews/review-a', (route) => route.fulfill({ json: {
    success: true, data: { status: approved ? 'DUPLICATE' : 'PENDING', receiptId: approved ? 'receipt-a' : null },
  } }));
  await page.route('**/api/payments/batches/receipt-a', (route) => route.fulfill({ json: { success: true, data: { id: 'receipt-a', totalAmount: 125 } } }));
  const run = () => page.evaluate(async (scope) => {
    const { syncSavedPayments } = await import('/src/offline/outbox.js');
    const { readRows, unseal } = await import('/src/offline/storage.js');
    await syncSavedPayments(); const entry = (await readRows('outbox'))[0];
    return { ...entry, payload: await unseal(scope, entry.encrypted) };
  }, account.scope);
  const held = await run();
  expect(held.status).toBe('CONFLICT'); expect(held.reviewId).toBe('review-a');
  expect((await run()).status).toBe('CONFLICT');
  approved = true;
  const completed = await run();
  expect(completed.status).toBe('SUCCEEDED'); expect(completed.reviewResolution).toBe('DUPLICATE');
  expect(completed.payload).toEqual(held.payload);
  expect(submissions).toBe(1);
});

test('missing local encryption keys never replace the key or erase saved payments', async ({ page }) => {
  const [account] = await prepare(page);
  await queue(page, account.scope);
  const result = await page.evaluate(async (scope) => {
    const { deleteRow, readRow, readRows } = await import('/src/offline/storage.js');
    const { queuePayment } = await import('/src/offline/outbox.js');
    await deleteRow('keys', scope);
    let message;
    try { await queuePayment(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 100, paymentMode: 'CASH', idempotencyKey: 'new-payment' }); }
    catch (error) { message = error.message; }
    return { message, key: await readRow('keys', scope), count: (await readRows('outbox')).length };
  }, account.scope);
  expect(result.message).toContain('locked'); expect(result.key).toBeUndefined(); expect(result.count).toBe(1);
});

test('encrypted download checkpoints survive reload and skip completed pages', async ({ page }) => {
  const [account] = await prepare(page);
  await page.evaluate(async (scope) => {
    const { mutateRow } = await import('/src/offline/storage.js');
    await mutateRow('accounts', scope, (saved) => ({ ...saved, offlineAccess: {
      ...saved.offlineAccess, grant: { ...saved.offlineAccess.grant, actions: ['READ', 'RECORD_PAYMENT'] },
    } }));
  }, account.scope);
  const pages = [];
  await page.route('**/api/members/offline-pages?*', (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer (access|refreshed)-a$/);
    const number = Number(new URL(route.request().url()).searchParams.get('page'));
    pages.push(number);
    return route.fulfill({ json: { success: true, data: {
      content: Array.from({ length: number === 4 ? 50 : 200 }, (_, index) => ({ id: `member-${number * 200 + index}` })),
      number, snapshotVersion: 'fixture-members-v1', totalElements: 850, totalPages: 5, last: number === 4,
    } } });
  });
  await page.route(`**/api/auth/accounts/${account.browserAccountId}/refresh`, (route) => route.fulfill({ json: {
    success: true, data: { accessToken: 'refreshed-a', browserAccountId: account.browserAccountId,
      user: { id: 'actor-a' }, tenant: { tenantId: 'org-a', role: 'ADMIN' } },
  } }));
  const paused = await page.evaluate(async (scope) => {
    const { prepareOfflineData } = await import('/src/offline/preparation.js');
    return prepareOfflineData(scope, { maxRequests: 2 });
  }, account.scope);
  expect(paused.status).toBe('paused');
  expect(pages).toEqual([0, 1]);
  await page.reload();
  const saved = await page.evaluate(async (scope) => {
    const { prepareOfflineData } = await import('/src/offline/preparation.js');
    const { readRow, unseal } = await import('/src/offline/storage.js');
    await prepareOfflineData(scope, { force: true, maxRequests: 3 });
    const row = await readRow('datasets', `${scope}:published:members`);
    return (await unseal(scope, row.encrypted)).count;
  }, account.scope);
  expect(saved).toBe(850);
  expect(pages).toEqual([0, 1, 2, 3, 4]);
});

async function prepare(page, organisations = ['a']) {
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true, data: [] } }));
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  return page.evaluate(async (orgs) => {
    const { rememberAccount } = await import('/src/offline/accountClient.js');
    const { writeRow } = await import('/src/offline/storage.js');
    const saved = [];
    for (const org of orgs) {
      const user = { id: `actor-${org}`, fullName: `User ${org}`, role: 'ADMIN' };
      const tenant = { tenantId: `org-${org}`, tenantName: `Organisation ${org}` };
      const account = await rememberAccount(user, tenant, `access-${org}`);
      const now = Date.now();
      await writeRow('accounts', { ...account, offlineAccess: {
        enabled: true, actorId: user.id, tenantId: tenant.tenantId, role: 'ADMIN', checkedAt: now, serverTime: now,
        grant: { id: `grant-${org}`, actorId: user.id, tenantId: tenant.tenantId, role: 'ADMIN',
          issuedAt: now, recordUntil: now + 7 * 86400000, actions: ['RECORD_PAYMENT'], token: `proof-${org}` },
      } });
      saved.push({ scope: account.scope, browserAccountId: account.browserAccountId });
    }
    return saved;
  }, organisations);
}

async function queue(page, scope, id = 'payment-a') {
  return page.evaluate(async ({ scope, id }) => {
    const { queuePayment } = await import('/src/offline/outbox.js');
    return queuePayment(scope, { memberId: `member-${id}`, chitId: 'chit-a', amount: 125,
      paymentMode: 'CASH', idempotencyKey: id });
  }, { scope, id });
}

test('a confirmed receipt appears in older complete offline history before the next download',async({page})=>{
  const [a]=await prepare(page);await queue(page,a.scope,'new-payment');
  await page.evaluate(async(scope)=>{
    const {writeRow,seal}=await import('/src/offline/storage.js');
    const records=[{id:'old-receipt',memberId:'member-new-payment',chitId:'chit-a',createdAt:'2026-01-01',totalAmount:10}];
    await writeRow('datasets',{key:`${scope}:published:batches`,scope,encrypted:await seal(scope,records),savedAt:1000});
  },a.scope);
  await page.route('**/api/payments/offline/record',(route)=>route.fulfill({json:{success:true,data:{id:'new-receipt',memberId:'member-new-payment',chitId:'chit-a',createdAt:'2026-10-16',totalAmount:125}}}));
  const result=await page.evaluate(async(scope)=>{
    const {syncSavedPayments}=await import('/src/offline/outbox.js');const {cachedResponse}=await import('/src/offline/cache.js');
    await syncSavedPayments();const response=await cachedResponse(scope,{url:'/payments/batches/all',params:{page:0,size:50}});
    return{ids:response.data.data.content.map(r=>r.id),count:response.data.data.totalElements,savedAt:response.headers['x-chitwise-cached-at']};
  },a.scope);
  expect(result).toEqual({ids:['new-receipt','old-receipt'],count:2,savedAt:'1000'});
});

test('saved payment survives reload and syncs under A while B stays visible after expiry/downgrade', async ({ page }) => {
  const [a, b] = await prepare(page, ['a', 'b']);
  await queue(page, a.scope);
  await page.evaluate(async (scope) => {
    const { mutateRow } = await import('/src/offline/storage.js');
    await mutateRow('accounts', scope, (account) => ({ ...account, offlineAccess: {
      ...account.offlineAccess, enabled: false, reason: 'OFFLINE_ACCESS_EXPIRED', grant: null,
    } }));
  }, a.scope);
  await page.route(`**/api/auth/accounts/${a.browserAccountId}/refresh`, (route) => route.fulfill({ json: {
    success: true, data: { accessToken: 'refreshed-a', browserAccountId: a.browserAccountId,
      user: { id: 'actor-a' }, tenant: { tenantId: 'org-a', role: 'ADMIN' } },
  } }));
  const submissions = [];
  await page.route('**/api/payments/offline/record', (route) => {
    submissions.push({ token: route.request().headers().authorization, payload: route.request().postDataJSON() });
    return route.fulfill({ json: { success: true, data: { id: 'receipt-a' } } });
  });
  // Install the simulated server before startup can automatically deliver A.
  await page.reload();
  const result = await page.evaluate(async (scope) => {
    const { syncSavedPayments } = await import('/src/offline/outbox.js');
    const { readRows } = await import('/src/offline/storage.js');
    await syncSavedPayments();
    return { status: (await readRows('outbox'))[0].status, active: localStorage.getItem('chitwise_active_account'), scope };
  }, b.scope);
  expect(result.status).toBe('SUCCEEDED');
  expect(result.active).toBe(b.scope);
  expect(submissions).toHaveLength(1);
  expect(submissions[0].token).toBe('Bearer refreshed-a');
  expect(submissions[0].payload.offlineAuthorization).toBe('proof-a');
});

test('lost acknowledgement retries the exact saved payment identity and payload', async ({ page }) => {
  const [a] = await prepare(page);
  await queue(page, a.scope, 'stable-payment');
  const attempts = [];
  await page.route('**/api/payments/offline/record', (route) => {
    attempts.push({ key: route.request().headers()['x-idempotency-key'], payload: route.request().postDataJSON() });
    return attempts.length === 1 ? route.abort('failed') : route.fulfill({ json: { success: true, data: { id: 'same-receipt' } } });
  });
  const result = await page.evaluate(async () => {
    const { syncSavedPayments } = await import('/src/offline/outbox.js');
    const { mutateRow, readRows } = await import('/src/offline/storage.js');
    await syncSavedPayments();
    const first = (await readRows('outbox'))[0];
    await mutateRow('outbox', first.key, (entry) => ({ ...entry, nextAttemptAt: 0 }));
    await syncSavedPayments();
    return { first: first.status, last: (await readRows('outbox'))[0].status };
  });
  expect(result).toEqual({ first: 'RETRYABLE_FAILURE', last: 'SUCCEEDED' });
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
});

test('access denial preserves a paused entry and a success without a receipt is never acknowledged', async ({ page }) => {
  const [a] = await prepare(page);
  await queue(page, a.scope);
  await page.route('**/api/payments/offline/record', (route) => route.fulfill({ status: 403,
    json: { errorCode: 'FORBIDDEN', message: 'Account needs review' } }));
  const paused = await page.evaluate(async () => {
    const { syncSavedPayments } = await import('/src/offline/outbox.js');
    const { readRows } = await import('/src/offline/storage.js');
    await syncSavedPayments(); return (await readRows('outbox'))[0].status;
  });
  expect(paused).toBe('PAUSED_ACCESS');
  await page.unroute('**/api/payments/offline/record');
  await page.route('**/api/payments/offline/record', (route) => route.fulfill({ json: { success: true, data: {} } }));
  const unconfirmed = await page.evaluate(async () => {
    const { syncSavedPayments } = await import('/src/offline/outbox.js');
    const { readRows, mutateRow } = await import('/src/offline/storage.js');
    const row = (await readRows('outbox'))[0];
    await mutateRow('outbox', row.key, (entry) => ({ ...entry, nextAttemptAt: 0 }));
    await syncSavedPayments(); return (await readRows('outbox'))[0].status;
  });
  expect(unconfirmed).toBe('RETRYABLE_FAILURE');
});

test('saved reads are encrypted and cannot cross organisations or enable a disabled add-on', async ({ page }) => {
  const [a, b] = await prepare(page, ['a', 'b']);
  const result = await page.evaluate(async ({ a, b }) => {
    const { saveCachedResponse, cachedResponse } = await import('/src/offline/cache.js');
    const { mutateRow, readRows } = await import('/src/offline/storage.js');
    const config = { method: 'get', url: '/members', params: { size: 200 } };
    const secret = { success: true, data: [{ id: 'member-a', fullName: 'Private member A' }] };
    await saveCachedResponse(a.scope, config, secret);
    const own = await cachedResponse(a.scope, config);
    const other = await cachedResponse(b.scope, config);
    await mutateRow('accounts', b.scope, (account) => ({ ...account, offlineAccess: { enabled: false } }));
    await saveCachedResponse(b.scope, config, secret);
    return { own: own.data, other, rows: (await readRows('cache')).length,
      atRest: JSON.stringify(await readRows('cache')).includes('Private member A') };
  }, { a, b });
  expect(result.own.data[0].fullName).toBe('Private member A');
  expect(result.other).toBeNull();
  expect(result.rows).toBe(1);
  expect(result.atRest).toBe(false);
});

test('two tabs can claim only one delivery lease for the same saved payment', async ({ page, context }) => {
  const second = await context.newPage();
  await prepare(second);
  const [a] = await prepare(page);
  await context.setOffline(true);
  await queue(page, a.scope);
  const key = `${a.scope}:payment-a`;
  const claim = (tab) => tab.evaluate(async (key) => {
    const { claimOutbox } = await import('/src/offline/storage.js');
    return !!await claimOutbox(key);
  }, key);
  expect((await Promise.all([claim(page), claim(second)])).filter(Boolean)).toHaveLength(1);
});

test('quota failure never reports a payment as saved', async ({ page }) => {
  const [a] = await prepare(page);
  const result = await page.evaluate(async (scope) => {
    const { queuePayment } = await import('/src/offline/outbox.js');
    const { readRows } = await import('/src/offline/storage.js');
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'outbox') throw new DOMException('Storage is full', 'QuotaExceededError');
      return original.apply(this, args);
    };
    let failed = false;
    try { await queuePayment(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 125, paymentMode: 'CASH' }); }
    catch { failed = true; }
    finally { IDBObjectStore.prototype.add = original; }
    return { failed, entries: (await readRows('outbox')).length };
  }, a.scope);
  expect(result).toEqual({ failed: true, entries: 0 });
});

test('unavailable account storage still allows ordinary online use without enabling offline recording', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.route('**/api/qa-online', (route) => {
    expect(route.request().headers().authorization).toBe('Bearer memory-only-token');
    return route.fulfill({ json: { success: true, data: { online: true } } });
  });
  const result = await page.evaluate(async () => {
    const { rememberAccount, requestForAccount, lockAccount } = await import('/src/offline/accountClient.js');
    const { queuePayment } = await import('/src/offline/outbox.js');
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'accounts') throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return original.apply(this, args);
    };
    let saved;
    try { saved = await rememberAccount({ id: 'actor-memory', role: 'ADMIN' }, { tenantId: 'org-memory' }, 'memory-only-token'); }
    finally { IDBObjectStore.prototype.put = original; }
    const response = await requestForAccount(saved.scope, '/qa-online');
    let blocked = false;
    try { await queuePayment(saved.scope, { memberId: 'member-memory', chitId: 'chit-memory', amount: 100, paymentMode: 'CASH' }); }
    catch { blocked = true; }
    await lockAccount(saved.scope);
    let locked = false;
    try { await requestForAccount(saved.scope, '/qa-online'); } catch { locked = true; }
    return { response, blocked, locked, offlineAccess: saved.offlineAccess };
  });
  expect(result).toEqual({ response: { online: true }, blocked: true, locked: true, offlineAccess: null });
});

test('a changed server role locks the old scope and preserves its queued collection', async ({ page }) => {
  const [account] = await prepare(page);
  await queue(page, account.scope);
  await page.route(`**/api/auth/accounts/${account.browserAccountId}/refresh`, (route) => route.fulfill({ json: {
    success: true, data: { accessToken: 'changed-role-token', browserAccountId: account.browserAccountId,
      user: { id: 'actor-a' }, tenant: { tenantId: 'org-a', role: 'STAFF' } },
  } }));
  const result = await page.evaluate(async (scope) => {
    const { refreshAccount } = await import('/src/offline/accountClient.js');
    const { readRow, readRows } = await import('/src/offline/storage.js');
    try { await refreshAccount(scope); } catch { /* Expected role change. */ }
    return { valid: (await readRow('accounts', scope)).sessionValid, payments: (await readRows('outbox')).length };
  }, account.scope);
  expect(result).toEqual({ valid: false, payments: 1 });
});

test('an old failed refresh cannot lock or overwrite a newer sign-in for the same account', async ({ page }) => {
  const [account] = await prepare(page);
  const result = await page.evaluate(async (scope) => {
    const { rememberAccount, refreshAccount, accessTokenForAccount } = await import('/src/offline/accountClient.js');
    const { readRow } = await import('/src/offline/storage.js');
    const original = window.fetch;
    let started, deliver;
    const ready = new Promise((resolve) => { started = resolve; });
    window.fetch = () => new Promise((resolve) => { deliver = resolve; started(); });
    try {
      const old = refreshAccount(scope).catch((error) => error.status);
      await ready;
      await rememberAccount({ id: 'actor-a', role: 'ADMIN' }, { tenantId: 'org-a' }, 'new-sign-in');
      deliver(new Response(JSON.stringify({ success: false }), { status: 401 }));
      await old;
      return { valid: (await readRow('accounts', scope)).sessionValid, token: await accessTokenForAccount(scope) };
    } finally { window.fetch = original; }
  }, account.scope);
  expect(result).toEqual({ valid: true, token: 'new-sign-in' });
});

test('a slow organisation does not block another organisation’s saved payment', async ({ page }) => {
  const [a, b] = await prepare(page, ['a', 'b']);
  await queue(page, a.scope, 'slow-a'); await queue(page, b.scope, 'ready-b');
  let releaseA;
  const paused = new Promise((resolve) => { releaseA = resolve; });
  let bSubmitted = false;
  await page.route('**/api/payments/offline/record', async (route) => {
    if (route.request().headers().authorization === 'Bearer access-a') await paused;
    else bSubmitted = true;
    await route.fulfill({ json: { success: true, data: { id: 'receipt-' + route.request().postDataJSON().memberId } } });
  });
  await page.evaluate(async () => {
    const { syncSavedPayments } = await import('/src/offline/outbox.js');
    window.qaSync = syncSavedPayments();
  });
  try { await expect.poll(() => bSubmitted, { timeout: 3000 }).toBe(true); }
  finally { releaseA(); }
  await page.evaluate(() => window.qaSync);
  const saved = await page.evaluate(async () => (await (await import('/src/offline/storage.js')).readRows('outbox')).map((row) => row.status));
  expect(saved).toEqual(['SUCCEEDED', 'SUCCEEDED']);
});

test('a recorded refund acknowledges the held collection without creating or fetching a payment receipt', async ({ page }) => {
  const [account] = await prepare(page); await queue(page, account.scope);
  let submissions = 0; let receiptReads = 0;
  await page.route('**/api/payments/offline/record', (route) => { submissions++; return route.fulfill({ status: 409, json: {
    success: false, data: { reviewId: 'refunded-review' }, errorCode: 'OFFLINE_PAYMENT_REVIEW_REQUIRED',
  } }); });
  await page.route('**/api/payments/offline/reviews/refunded-review', (route) => route.fulfill({ json: {
    success: true, data: { id: 'refunded-review', status: 'REFUNDED', refund: { amount: 125, reference: 'RETURN-125' } },
  } }));
  await page.route('**/api/payments/batches/**', (route) => { receiptReads++; return route.abort(); });
  const result = await page.evaluate(async (scope) => {
    const { syncSavedPayments, queuePayment } = await import('/src/offline/outbox.js');
    const { readRows, unseal } = await import('/src/offline/storage.js');
    await syncSavedPayments(); const held = (await readRows('outbox'))[0];
    const original = await unseal(scope, held.encrypted);
    await syncSavedPayments(); const done = (await readRows('outbox'))[0];
    let retryMessage;
    try { await queuePayment(scope, { memberId: 'member-payment-a', chitId: 'chit-a', amount: 125, paymentMode: 'CASH', idempotencyKey: 'payment-a' }); }
    catch (error) { retryMessage = error.message; }
    return { status: done.status, resolution: done.reviewResolution, unchanged: JSON.stringify(original) === JSON.stringify(await unseal(scope, done.encrypted)), retryMessage };
  }, account.scope);
  expect(result).toMatchObject({ status: 'SUCCEEDED', resolution: 'REFUNDED', unchanged: true });
  expect(result.retryMessage).toContain('refunded'); expect(submissions).toBe(1); expect(receiptReads).toBe(0);
});

test('same-tenant admin recovery preserves the original ciphertext and never quarantines another organisation’s queue', async ({ page }) => {
  const [a, b] = await prepare(page, ['a', 'b']);
  await queue(page, a.scope, 'recover-a'); await queue(page, b.scope, 'leave-b');
  const uploaded = [];
  await page.route('**/api/payments/offline/reviews/recover', (route) => {
    uploaded.push({ actor: route.request().postDataJSON().originalActorId, token: route.request().headers().authorization });
    return route.fulfill({ json: { success: true, data: { reviewId: 'recovered-a' } } });
  });
  const result = await page.evaluate(async ({ scope }) => {
    const { mutateRow, readRow, unseal, readRows } = await import('/src/offline/storage.js');
    const { rememberAccount } = await import('/src/offline/accountClient.js');
    const { recoverSavedCollections } = await import('/src/offline/outbox.js');
    const before = await readRow('outbox', `${scope}:recover-a`); const original = await unseal(scope, before.encrypted);
    await mutateRow('accounts', scope, (row) => ({ ...row, sessionValid: false }));
    const admin = await rememberAccount({ id: 'replacement-admin', role: 'ADMIN', fullName: 'Replacement admin' }, { tenantId: 'org-a' }, 'replacement-access');
    await recoverSavedCollections(admin.scope);
    const recovered = await readRow('outbox', before.key);
    return { scope: admin.scope, original: await unseal(scope, recovered.encrypted), unchanged: JSON.stringify(original) === JSON.stringify(await unseal(scope, recovered.encrypted)),
      status: recovered.status, review: recovered.reviewId, delivery: recovered.recoveryScope,
      other: (await readRows('outbox')).find((row) => row.operationId === 'leave-b').reviewId };
  }, { scope: a.scope });
  expect(uploaded).toEqual([{ actor: 'actor-a', token: 'Bearer replacement-access' }]);
  expect(result).toMatchObject({ unchanged: true, status: 'CONFLICT', review: 'recovered-a', delivery: result.scope });
  expect(result.other).toBeUndefined();
});

test('cancelling a never-sent multi-chit payment is atomic and preserves its original allocations', async ({ page }) => {
  const [account] = await prepare(page);
  const result = await page.evaluate(async (scope) => {
    const { queuePayment, cancelSavedPayment, savedPaymentActivity } = await import('/src/offline/outbox.js');
    const { readRows, unseal, claimOutbox } = await import('/src/offline/storage.js');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await queuePayment(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 1000, paymentMode: 'CASH', idempotencyKey: 'multi-cancel', allocations: [{ chitId: 'chit-b', amount: 400 }, { chitId: 'chit-a', amount: 600 }] });
    const before = (await readRows('outbox'))[0]; const payload = await unseal(scope, before.encrypted);
    await cancelSavedPayment(scope, before.key, 'Mistaken entry; no money received', true);
    const after = (await readRows('outbox'))[0];
    return { status: after.status, payload, original: await unseal(scope, after.encrypted), outstanding: (await savedPaymentActivity(scope)).length, claim: !!await claimOutbox(before.key) };
  }, account.scope);
  expect(result.status).toBe('CANCELLED'); expect(result.original).toEqual(result.payload);
  expect(result.original.allocations).toEqual([{ chitId: 'chit-a', amount: 600 }, { chitId: 'chit-b', amount: 400 }]);
  expect(result.outstanding).toBe(0); expect(result.claim).toBe(false);
});

test('an in-flight browser payment cannot be cancelled locally and a lost acknowledgement checks the server before using Void', async ({ page }) => {
  const [account] = await prepare(page); await queue(page, account.scope);
  let cancelled = 0; let posted = 0;
  await page.route('**/api/payments/offline/record', (route) => { posted++; return route.abort(); });
  await page.route('**/api/payments/offline/reviews/cancel-unsynced', (route) => { cancelled++;
    expect(route.request().postDataJSON().original.offlineAuthorization).toBe('proof-a');
    return route.fulfill({ json: { success: true, data: { status: 'RECEIPT_EXISTS', receipt: { id: 'lost-ack-receipt', totalAmount: 125 } } } });
  });
  const result = await page.evaluate(async (scope) => {
    const { readRows, claimOutbox, mutateRow } = await import('/src/offline/storage.js');
    const { cancelSavedPayment, savedPaymentActivity } = await import('/src/offline/outbox.js');
    const entry = (await readRows('outbox'))[0]; await claimOutbox(entry.key);
    let error; try { await cancelSavedPayment(scope, entry.key, 'No money collected', true); } catch (failure) { error = failure.message; }
    await mutateRow('outbox', entry.key, (row) => ({ ...row, status: 'RETRYABLE_FAILURE', nextAttemptAt: 0 }));
    const final = await cancelSavedPayment(scope, entry.key, 'No money collected', true);
    return { error, status: final.status, remaining: (await savedPaymentActivity(scope)).length };
  }, account.scope);
  expect(result.error).toContain('started syncing'); expect(result.status).toBe('SUCCEEDED'); expect(result.remaining).toBe(0);
  expect(cancelled).toBe(1); expect(posted).toBe(0);
});

test('a fresh sign-in without the add-on disables stale grants but still delivers older saved payments', async ({ page }) => {
  const [account] = await prepare(page); await queue(page, account.scope);
  const posted = [];
  await page.route('**/api/payments/offline/record', (route) => { posted.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, data: { id: 'old-saved-receipt', totalAmount: 125 } } }); });
  const result = await page.evaluate(async (scope) => {
    const { rememberAccount } = await import('/src/offline/accountClient.js');
    const { readRow, readRows, unseal } = await import('/src/offline/storage.js');
    const { queuePayment, syncSavedPayments } = await import('/src/offline/outbox.js');
    const owner = await readRow('accounts', scope); const original = await unseal(scope, (await readRows('outbox'))[0].encrypted);
    await rememberAccount(owner.user, { ...owner.tenant, offlineEnabled: false }, 'access-a');
    let denied; try { await queuePayment(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 200, paymentMode: 'CASH', idempotencyKey: 'forbidden-new' }); } catch (failure) { denied = failure.message; }
    await syncSavedPayments(); return { denied, original, status: (await readRows('outbox'))[0].status, enabled: (await readRow('accounts', scope)).offlineAccess.enabled };
  }, account.scope);
  expect(result.enabled).toBe(false); expect(result.denied).toContain('not enabled');
  expect(result.status).toBe('SUCCEEDED'); expect(posted).toEqual([result.original]);
});

test('recovery never uploads a never-sent cancelled collection or replaces its cancellation evidence', async ({ page }) => {
  const [account] = await prepare(page); await queue(page, account.scope);
  let uploads = 0;
  await page.route('**/api/payments/offline/**', (route) => { uploads++; return route.abort(); });
  const result = await page.evaluate(async (scope) => {
    const { cancelSavedPayment, recoverSavedCollections } = await import('/src/offline/outbox.js');
    const { readRows, unseal } = await import('/src/offline/storage.js');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const before = (await readRows('outbox'))[0];
    await cancelSavedPayment(scope, before.key, 'No money collected; mistaken entry', true);
    const count = await recoverSavedCollections(scope);
    const after = (await readRows('outbox'))[0];
    return { count, status: after.status, reviewId: after.reviewId,
      reason: (await unseal(scope, after.cancellation)).reason,
      unchanged: JSON.stringify(await unseal(scope, before.encrypted)) === JSON.stringify(await unseal(scope, after.encrypted)) };
  }, account.scope);
  expect(result).toMatchObject({ count: 0, status: 'CANCELLED', unchanged: true, reason: 'No money collected; mistaken entry' });
  expect(result.reviewId).toBeUndefined(); expect(uploads).toBe(0);
});

test('recovery preserves an uncertain cancellation and uses cancellation reconciliation rather than ordinary review upload', async ({ page }) => {
  const [account] = await prepare(page); await queue(page, account.scope);
  let recoveries = 0; let payments = 0; let cancellations = 0;
  await page.route('**/api/payments/offline/reviews/recover', (route) => { recoveries++; return route.abort(); });
  await page.route('**/api/payments/offline/record', (route) => { payments++; return route.abort(); });
  await page.route('**/api/payments/offline/reviews/cancel-unsynced', (route) => { cancellations++;
    expect(route.request().postDataJSON().cancellation.noMoneyCollected).toBe(true);
    return route.fulfill({ json: { success: true, data: { id: 'cancel-review', status: 'CANCELLED' } } });
  });
  const result = await page.evaluate(async (scope) => {
    const { cancelSavedPayment, recoverSavedCollections } = await import('/src/offline/outbox.js');
    const { readRows, mutateRow } = await import('/src/offline/storage.js');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    const before = (await readRows('outbox'))[0];
    await mutateRow('outbox', before.key, (row) => ({ ...row, attempts: 1, status: 'RETRYABLE_FAILURE' }));
    await cancelSavedPayment(scope, before.key, 'No money collected; uncertain earlier attempt', true);
    const count = await recoverSavedCollections(scope);
    return { count, status: (await readRows('outbox'))[0].status };
  }, account.scope);
  expect(result).toEqual({ count: 0, status: 'CANCELLED' });
  expect(recoveries).toBe(0); expect(payments).toBe(0); expect(cancellations).toBe(1);
});

test('cancellation and recovery claims serialize before either can upload evidence', async ({ page }) => {
  const [account] = await prepare(page); await queue(page, account.scope);
  const result = await page.evaluate(async (scope) => {
    const { requestOutboxCancellation, claimOutboxRecovery, readRows, seal } = await import('/src/offline/storage.js');
    const row = (await readRows('outbox'))[0];
    const cancellation = await seal(scope, { reason: 'No money collected', noMoneyCollected: true });
    const [cancel, recover] = await Promise.all([
      requestOutboxCancellation(scope, row.key, cancellation), claimOutboxRecovery(row.key, scope),
    ]);
    return { cancelled: cancel.status, claimed: !!recover, final: (await readRows('outbox'))[0].status };
  }, account.scope);
  expect(result).toEqual({ cancelled: 'CANCELLED', claimed: false, final: 'CANCELLED' });
});

test('an in-flight recovery cannot be cancelled locally or overwritten by another recovery', async ({ page }) => {
  const [account] = await prepare(page); await queue(page, account.scope);
  let uploads = 0; let release;
  const pause = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/payments/offline/reviews/recover', async (route) => { uploads++; await pause;
    await route.fulfill({ json: { success: true, data: { reviewId: 'recovery-race' } } });
  });
  await page.evaluate(async (scope) => {
    const { recoverSavedCollections } = await import('/src/offline/outbox.js'); window.qaRecovery = recoverSavedCollections(scope);
  }, account.scope);
  try {
    await expect.poll(() => uploads).toBe(1);
    const during = await page.evaluate(async (scope) => {
      const { cancelSavedPayment } = await import('/src/offline/outbox.js');
      const { readRows, claimOutboxRecovery } = await import('/src/offline/storage.js');
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      const row = (await readRows('outbox'))[0];
      let message; try { await cancelSavedPayment(scope, row.key, 'No money collected', true); } catch (error) { message = error.message; }
      return { message, claimedAgain: !!await claimOutboxRecovery(row.key, scope), status: (await readRows('outbox'))[0].status };
    }, account.scope);
    expect(during.message).toContain('started syncing'); expect(during.claimedAgain).toBe(false); expect(during.status).toBe('SYNCING');
  } finally { release(); }
  const after = await page.evaluate(async () => {
    await window.qaRecovery; return (await (await import('/src/offline/storage.js')).readRows('outbox'))[0];
  });
  expect(uploads).toBe(1); expect(after.status).toBe('CONFLICT'); expect(after.reviewId).toBe('recovery-race'); expect(after.cancellation).toBeUndefined();
});

test('a failed recovery releases only its lease and preserves the original collection', async ({ page }) => {
  const [account] = await prepare(page); await queue(page, account.scope);
  await page.route('**/api/payments/offline/reviews/recover', (route) => route.fulfill({ status: 503, json: { success: false, message: 'Unavailable' } }));
  const result = await page.evaluate(async (scope) => {
    const { recoverSavedCollections } = await import('/src/offline/outbox.js');
    const { readRows, unseal } = await import('/src/offline/storage.js');
    const before = (await readRows('outbox'))[0]; let failed = false;
    try { await recoverSavedCollections(scope); } catch { failed = true; }
    const after = (await readRows('outbox'))[0];
    return { failed, status: after.status, leaseUntil: after.leaseUntil, attempts: after.attempts,
      unchanged: JSON.stringify(await unseal(scope, before.encrypted)) === JSON.stringify(await unseal(scope, after.encrypted)) };
  }, account.scope);
  expect(result).toEqual({ failed: true, status: 'QUEUED', leaseUntil: 0, attempts: 1, unchanged: true });
});
