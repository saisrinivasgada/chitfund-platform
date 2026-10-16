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
  await page.route('**/api/payments', (route) => { ordinaryPosts++; return route.abort(); });
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
  await page.route('**/api/payments', (route) => {
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
  await page.route('**/api/members?*', (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer (access|refreshed)-a$/);
    const number = Number(new URL(route.request().url()).searchParams.get('page'));
    pages.push(number);
    return route.fulfill({ json: { success: true, data: {
      content: Array.from({ length: number === 4 ? 50 : 200 }, (_, index) => ({ id: `member-${number * 200 + index}` })),
      number, totalElements: 850, totalPages: 5, last: number === 4,
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
    return (await unseal(scope, row.encrypted)).length;
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
  await page.route('**/api/payments', (route) => {
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
  await page.route('**/api/payments', (route) => {
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
  await page.route('**/api/payments', (route) => route.fulfill({ status: 403,
    json: { errorCode: 'FORBIDDEN', message: 'Account needs review' } }));
  const paused = await page.evaluate(async () => {
    const { syncSavedPayments } = await import('/src/offline/outbox.js');
    const { readRows } = await import('/src/offline/storage.js');
    await syncSavedPayments(); return (await readRows('outbox'))[0].status;
  });
  expect(paused).toBe('PAUSED_ACCESS');
  await page.unroute('**/api/payments');
  await page.route('**/api/payments', (route) => route.fulfill({ json: { success: true, data: {} } }));
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
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'outbox') throw new DOMException('Storage is full', 'QuotaExceededError');
      return original.apply(this, args);
    };
    let failed = false;
    try { await queuePayment(scope, { memberId: 'member-a', chitId: 'chit-a', amount: 125, paymentMode: 'CASH' }); }
    catch { failed = true; }
    finally { IDBObjectStore.prototype.put = original; }
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
  await page.route('**/api/payments', async (route) => {
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
