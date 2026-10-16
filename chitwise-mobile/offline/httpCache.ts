import { getOfflineDatabase, hasOfflineDatabase } from './database';
import { accountForScope } from './accountClient';
import { hasOfflineAccess } from './access';
import { requestKey, cacheableRead, listSnapshot, batchSnapshot } from '../../shared/offline/readSnapshots';

interface Request { url?: string; method?: string; params?: Record<string, unknown> }
const freshness = new Map<string, { savedAt: number; servedFromCache: boolean }>();
export const httpCacheFreshness = (scope: string, path: string) => freshness.get(`${scope}:${path}`);

function allowed(scope: string, config: Request) {
  return !!accountForScope(scope)?.sessionValid && hasOfflineAccess(scope)
    && cacheableRead(config.url ?? '', config.method ?? 'GET');
}

export async function saveHttpResponse(scope: string, config: Request, data: unknown): Promise<void> {
  if (!allowed(scope, config)) return;
  const db = await getOfflineDatabase(scope);
  if (!allowed(scope, config)) return;
  await db.runAsync(`INSERT INTO offline_http_cache(cache_key, account_scope, response_json, saved_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET response_json=excluded.response_json, saved_at=excluded.saved_at`,
  requestKey(config.url!, config.params), scope, JSON.stringify(data), Date.now());
  freshness.set(`${scope}:${config.url}`, { savedAt: Date.now(), servedFromCache: false });
}

export async function cachedHttpResponse(scope: string, config: Request): Promise<{ data: any; savedAt: number } | null> {
  if (!allowed(scope, config) || !await hasOfflineDatabase(scope)) return null;
  const db = await getOfflineDatabase(scope);
  if (config.url === '/members' || config.url === '/chits' || config.url === '/payments/batches/all') {
    const kind = config.url === '/payments/batches/all' ? 'batches' : config.url.slice(1);
    const dataset = await db.getFirstAsync<{ data_json: string; saved_at: number }>(
      'SELECT data_json, saved_at FROM offline_datasets WHERE dataset_key=?', `published:${kind}`);
    if (dataset) {
      const records = JSON.parse(dataset.data_json);
      const data = kind === 'batches' ? batchSnapshot(records, config.params) : listSnapshot(kind, records, config.params);
      if (data) {
        freshness.set(`${scope}:${config.url}`, { savedAt: dataset.saved_at, servedFromCache: true });
        return { data, savedAt: dataset.saved_at };
      }
    }
  }
  const row = await db.getFirstAsync<{ response_json: string; saved_at: number }>(
    'SELECT response_json, saved_at FROM offline_http_cache WHERE cache_key=? AND account_scope=?',
    requestKey(config.url!, config.params), scope);
  if (!row) return null;
  freshness.set(`${scope}:${config.url}`, { savedAt: row.saved_at, servedFromCache: true });
  return { data: JSON.parse(row.response_json), savedAt: row.saved_at };
}

export async function forgetHttpResponse(scope: string, config: Request): Promise<void> {
  if (!cacheableRead(config.url ?? '', config.method ?? 'GET') || !await hasOfflineDatabase(scope)) return;
  const db = await getOfflineDatabase(scope);
  await db.runAsync('DELETE FROM offline_http_cache WHERE cache_key=? AND account_scope=?', requestKey(config.url!, config.params), scope);
  if (config.url === '/members' || config.url === '/chits' || config.url === '/payments/batches/all') {
    await db.runAsync('DELETE FROM offline_datasets WHERE dataset_key=?', `published:${config.url === '/payments/batches/all' ? 'batches' : config.url.slice(1)}`);
  }
  freshness.delete(`${scope}:${config.url}`);
}
