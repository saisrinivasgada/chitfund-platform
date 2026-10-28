import { refreshFinancialSnapshots } from '../../shared/offline/financialRefresh';
import { requestAsAccount } from './accountClient';
import { getOfflineDatabase } from './database';
import { saveHttpResponse } from './httpCache';

export async function refreshPostedCollection(scope: string, original: any, receipt: any) {
  const db = await getOfflineDatabase(scope);
  if (receipt?.id) await db.runAsync(`INSERT INTO offline_datasets(dataset_key,data_json,saved_at) VALUES (?,?,?)
    ON CONFLICT(dataset_key) DO UPDATE SET data_json=excluded.data_json,saved_at=excluded.saved_at`,
    `receipt-overlay:${receipt.id}`, JSON.stringify(receipt), Date.now());
  // A hidden account's persisted query state must not override refreshed HTTP
  // snapshots when it is reopened offline after background delivery.
  await db.runAsync('DELETE FROM persisted_query_clients WHERE account_scope=?', scope);
  await db.runAsync(`INSERT INTO offline_datasets(dataset_key, data_json, saved_at) VALUES ('financial-dirty', ?, ?)
    ON CONFLICT(dataset_key) DO UPDATE SET data_json=excluded.data_json, saved_at=excluded.saved_at`, String(Date.now()), Date.now());
  await refreshFinancialSnapshots({
    request: async (path, params) => (await requestAsAccount(scope, { method: 'GET', url: path, params })).data,
    saveResponse: (path, params, response) => saveHttpResponse(scope, { method: 'GET', url: path, params }, response),
  }, original, receipt);
}
