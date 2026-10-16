import { mutateRow, readRow } from './storage';

export const ACTIVE_ACCOUNT_KEY = 'chitwise_active_account';
const tokens = new Map();
const refreshing = new Map();
const writes = new Map();
const locked = new Set();
const volatileAccounts = new Map();
const signIns = new Map();

function accountWrite(scope, work) {
  const task = (writes.get(scope) ?? Promise.resolve()).catch(() => {}).then(work);
  writes.set(scope, task);
  return task.finally(() => { if (writes.get(scope) === task) writes.delete(scope); });
}

async function timedFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export function accountScope(user, tenantId) {
  return user?.id && tenantId ? `WEB:${user.id}:${tenantId}:${user.role}` : null;
}

export function activeAccountScope() {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export function rememberAccount(user, tenant, token) {
  user = { ...user, role: tenant.role ?? user.role };
  const scope = accountScope(user, tenant.tenantId);
  if (!scope) return Promise.resolve(null);
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, scope);
  signIns.set(scope, (signIns.get(scope) ?? 0) + 1);
  locked.delete(scope);
  tokens.set(scope, token);
  return accountWrite(scope, async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
    const browserAccountId = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const draft = { scope, user, tenant, browserAccountId, sessionValid: true, generation: 0, offlineAccess: null };
    try {
      const saved = await mutateRow('accounts', scope, (prior) => ({
      scope, user, tenant, browserAccountId, sessionValid: true,
      generation: (prior?.generation ?? 0) + 1,
      offlineAccess: prior?.offlineAccess ?? null,
      }));
      volatileAccounts.delete(scope);
      return saved;
    } catch {
      // A storage failure must not prevent ordinary authenticated online use.
      // No offline grant/business data is enabled by this memory-only fallback.
      volatileAccounts.set(scope, draft);
      return draft;
    }
  });
}

export async function lockAccount(scope) {
  if (!scope) return;
  signIns.set(scope, (signIns.get(scope) ?? 0) + 1);
  locked.add(scope);
  tokens.delete(scope);
  volatileAccounts.delete(scope);
  await accountWrite(scope, () => mutateRow('accounts', scope, (prior) => prior && ({
    ...prior, sessionValid: false, generation: prior.generation + 1,
  })));
}

async function currentAccount(scope) {
  if (writes.has(scope)) await writes.get(scope);
  let account;
  try { account = await readRow('accounts', scope); }
  catch { account = volatileAccounts.get(scope); }
  account ??= volatileAccounts.get(scope);
  if (locked.has(scope) || !account?.sessionValid) throw Object.assign(new Error('Sign in to this account to sync its saved payments'), { status: 401 });
  return account;
}

async function responseBody(response) {
  let body;
  try { body = await response.json(); } catch { /* A failed proxy may return HTML. */ }
  if (!response.ok || body?.success === false) throw Object.assign(new Error(body?.message ?? 'Server request failed'),
    { status: response.ok ? 400 : response.status, errorCode: body?.errorCode, reviewId: body?.data?.reviewId });
  return body?.data ?? body;
}

async function invalidateSnapshot(scope, account, signIn) {
  await accountWrite(scope, async () => {
    if ((signIns.get(scope) ?? 0) !== signIn) return;
    let invalidated = false;
    try {
      await mutateRow('accounts', scope, (current) => {
        if (!current?.sessionValid || current.generation !== account.generation) return undefined;
        invalidated = true;
        return { ...current, sessionValid: false, generation: current.generation + 1 };
      });
    } catch { /* Memory-only sign-ins still need to lock on confirmed denial. */ }
    invalidated ||= volatileAccounts.get(scope) === account;
    if (!invalidated || (signIns.get(scope) ?? 0) !== signIn) return;
    locked.add(scope); tokens.delete(scope); volatileAccounts.delete(scope);
    // Workers and other tabs tell the visible session only which account expired.
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('chitwise-offline');
      channel.postMessage({ scope, sessionInvalid: true }); channel.close();
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:account-invalid', { detail: { scope } }));
  });
}

export function refreshAccount(scope) {
  const existing = refreshing.get(scope);
  if (existing) return existing;
  const execute = async () => {
    const account = await currentAccount(scope);
    const signIn = signIns.get(scope) ?? 0;
    try {
      const response = await timedFetch(`/api/auth/accounts/${account.browserAccountId}/refresh`, {
        method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'X-Client-Source': 'WEB' },
      });
      const auth = await responseBody(response);
      const current = await currentAccount(scope);
      if (current.generation !== account.generation || (signIns.get(scope) ?? 0) !== signIn) {
        throw Object.assign(new Error('A newer sign-in replaced this refresh'), { status: 401, superseded: true });
      }
      if (String(auth.user?.id) !== String(account.user.id) || auth.tenant?.tenantId !== account.tenant.tenantId
          || auth.tenant?.role !== account.user.role || auth.browserAccountId !== account.browserAccountId) {
        throw Object.assign(new Error('Account access changed; sign in again'), { status: 401 });
      }
      if (!auth.accessToken) throw new Error('Server did not confirm an account session');
      tokens.set(scope, auth.accessToken);
      return auth;
    } catch (error) {
      if (error.status === 401 && !error.superseded) await invalidateSnapshot(scope, account, signIn);
      throw error;
    }
  };
  // Web Locks serialize refresh-token rotation across pages and service workers.
  const task = (globalThis.navigator?.locks
    ? navigator.locks.request(`chitwise-refresh:${scope}`, execute) : execute())
    .finally(() => refreshing.delete(scope));
  refreshing.set(scope, task);
  return task;
}

export async function accessTokenForAccount(scope) {
  await currentAccount(scope);
  return tokens.get(scope) ?? (await refreshAccount(scope)).accessToken;
}

export async function requestForAccount(scope, path, { method = 'GET', body, headers = {} } = {}) {
  await currentAccount(scope);
  const send = async () => timedFetch(`/api${path}`, {
    method, cache: 'no-store', credentials: 'include',
    headers: { ...headers, 'X-Client-Source': 'WEB', 'Content-Type': 'application/json',
      Authorization: `Bearer ${await accessTokenForAccount(scope)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let response = await send();
  if (response.status === 401) { await refreshAccount(scope); response = await send(); }
  return responseBody(response);
}

export async function refreshOfflineAccess(scope) {
  const account = await currentAccount(scope);
  const access = await requestForAccount(scope, '/users/me/offline-access', { method: 'POST' });
  if (access.actorId !== String(account.user.id) || access.tenantId !== account.tenant.tenantId
      || access.role !== account.user.role) throw new Error('Offline access did not match this account');
  return mutateRow('accounts', scope, (prior) => {
    if (!prior?.sessionValid || prior.generation !== account.generation) throw new Error('Account session changed');
    return { ...prior, offlineAccess: { ...access, checkedAt: Date.now() } };
  });
}
