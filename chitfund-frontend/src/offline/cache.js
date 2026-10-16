import { deleteRow, readRow, seal, unseal, writeRow } from './storage';
import { cacheableRead, requestKey, listSnapshot, batchSnapshot } from '../../../shared/offline/readSnapshots';
const freshness = new Map();
export const cachedDataState = (scope, path) => freshness.get(`${scope}:${path}`);

function publishFreshness(scope, path, cachedAt, servedFromCache) {
  freshness.set(`${scope}:${path}`, { cachedAt, servedFromCache });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chitwise:cached-read', {
    detail: { scope, path, cachedAt, servedFromCache },
  }));
}

export function cacheableRequest(config) {
  return cacheableRead(String(config.url ?? ''), config.method ?? 'GET');
}

export async function forgetCachedResponse(scope, config) {
  if (!scope || !cacheableRequest(config)) return;
  await deleteRow('cache', await cacheKey(scope, config));
  if (['/members', '/chits', '/payments/batches/all'].includes(config.url)) await deleteRow('datasets', `${scope}:published:${config.url === '/payments/batches/all' ? 'batches' : config.url.slice(1)}`);
  freshness.delete(`${scope}:${config.url}`);
}

async function cacheKey(scope, config) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(requestKey(config.url, config.params)));
  return `${scope}:${Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export async function saveCachedResponse(scope, config, data) {
  if (!scope || !cacheableRequest(config)) return;
  const account = await readRow('accounts', scope);
  if (!account?.sessionValid || !account.offlineAccess?.enabled) return;
  const key = await cacheKey(scope, config);
  const encrypted = await seal(scope, data);
  const current = await readRow('accounts', scope);
  if (!current?.sessionValid || current.generation !== account.generation || !current.offlineAccess?.enabled) return;
  const cachedAt = Date.now();
  await writeRow('cache', { key, scope, encrypted, cachedAt });
  publishFreshness(scope, config.url, cachedAt, false);
}

export async function cachedResponse(scope, config) {
  if (!scope || !cacheableRequest(config)) return null;
  const account = await readRow('accounts', scope);
  if (!account?.sessionValid || !account.offlineAccess?.enabled) return null;
  if (['/members', '/chits', '/payments/batches/all'].includes(config.url)) {
    const kind = config.url === '/payments/batches/all' ? 'batches' : config.url.slice(1);
    const dataset = await readRow('datasets', `${scope}:published:${kind}`);
    if (dataset) {
      const records = await unseal(scope, dataset.encrypted);
      const data = kind === 'batches' ? batchSnapshot(records, config.params) : listSnapshot(kind, records, config.params);
      if (data) {
        publishFreshness(scope, config.url, dataset.savedAt, true);
        return { config, data, status: 200, statusText: 'Saved on device', headers: { 'x-chitwise-cached-at': String(dataset.savedAt) } };
      }
    }
  }
  const cached = await readRow('cache', await cacheKey(scope, config));
  if (!cached) return null;
  const data = await unseal(scope, cached.encrypted);
  publishFreshness(scope, config.url, cached.cachedAt, true);
  return { config, data, status: 200, statusText: 'Saved on device',
    headers: { 'x-chitwise-cached-at': String(cached.cachedAt) } };
}
