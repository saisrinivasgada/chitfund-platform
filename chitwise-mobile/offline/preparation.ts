import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { prepareCoreData, type PreparationAdapter, type PreparationManifest, type PreparationJob } from '../../shared/offline/preparation';
import { getOfflineDatabase, hasOfflineDatabase, withOfflineTransaction } from './database';
import { accountForScope, requestAsAccount } from './accountClient';
import { offlineAccessForScope } from './access';
import { canRecordOffline } from './accessPolicy';
import { saveHttpResponse } from './httpCache';
import { useAuthStore } from '../store/authStore';
import { getAccountScope, getStoredAccountScope } from './accountScope';
import { refreshOfflineAccess, restoreOfflineAccess } from './access';

export const usePreparationStore = create<{
  byScope: Record<string, PreparationManifest>;
  put(scope: string, manifest: PreparationManifest): void;
}>((set) => ({ byScope: {}, put: (scope, manifest) => set((state) => ({ byScope: { ...state.byScope, [scope]: { ...manifest, rootsDone: [...manifest.rootsDone] } } })) }));

async function loadManifest(scope: string): Promise<PreparationManifest | null> {
  const db = await getOfflineDatabase(scope);
  const row = await db.getFirstAsync<{ manifest_json: string | null }>(
    'SELECT manifest_json FROM offline_preparation WHERE account_scope=?', scope);
  const manifest = row?.manifest_json ? JSON.parse(row.manifest_json) : null;
  const dirty = await db.getFirstAsync<{ data_json: string }>("SELECT data_json FROM offline_datasets WHERE dataset_key='financial-dirty'");
  return manifest?.status === 'ready' && manifest.startedAt < Number(dirty?.data_json ?? 0) ? { ...manifest, lastCompleteAt: 0 } : manifest;
}

export async function restorePreparationState(scope: string) {
  if (!await hasOfflineDatabase(scope)) return;
  const manifest = await loadManifest(scope);
  if (manifest) usePreparationStore.getState().put(scope, manifest);
}

function adapterFor(scope: string, role: string): PreparationAdapter {
  const rootKey = (cycle: string, kind: string) => `work:${cycle}:${kind}`;
  const jobKey = (cycle: string, key: string) => `${cycle}:${key}`;
  return {
    role, requiresRootSnapshots: true, newId: () => Crypto.randomUUID(), loadManifest: () => loadManifest(scope),
    async claimLease() {
      const db = await getOfflineDatabase(scope);
      const token = Crypto.randomUUID(); const now = Date.now();
      const result = await db.runAsync(`INSERT INTO offline_preparation(account_scope, lease_token, lease_until)
        VALUES (?, ?, ?) ON CONFLICT(account_scope) DO UPDATE SET lease_token=excluded.lease_token,
        lease_until=excluded.lease_until WHERE offline_preparation.lease_until <= ?`, scope, token, now + 120_000, now);
      return result.changes ? token : null;
    },
    async saveManifest(manifest, lease) {
      const db = await getOfflineDatabase(scope);
      const result = await db.runAsync('UPDATE offline_preparation SET manifest_json=?, lease_until=? WHERE account_scope=? AND lease_token=?',
        JSON.stringify(manifest), Date.now() + 120_000, scope, lease);
      if (!result.changes) throw new Error('Offline preparation moved to another worker');
      usePreparationStore.getState().put(scope, manifest);
      return manifest;
    },
    async releaseLease(lease) {
      const db = await getOfflineDatabase(scope);
      await db.runAsync('UPDATE offline_preparation SET lease_until=0, lease_token=NULL WHERE account_scope=? AND lease_token=?', scope, lease);
    },
    async cleanOldWork(cycle) {
      const db = await getOfflineDatabase(scope);
      await db.runAsync('DELETE FROM offline_preparation_jobs WHERE cycle_id<>?', cycle);
      const published = await db.getAllAsync<{ data_json: string }>("SELECT data_json FROM offline_datasets WHERE dataset_key LIKE 'published:%'");
      const retained = new Set([cycle]);
      for (const row of published) {
        const data = JSON.parse(row.data_json);
        if (data?.format === 'chunks-v1') retained.add(data.cycle);
      }
      const old = await db.getAllAsync<{ dataset_key: string }>("SELECT dataset_key FROM offline_datasets WHERE dataset_key LIKE 'work:%'");
      for (const row of old) if (![...retained].some((id) => row.dataset_key.startsWith(`work:${id}:`))) {
        await db.runAsync('DELETE FROM offline_datasets WHERE dataset_key=?', row.dataset_key);
      }
      await db.runAsync('DELETE FROM offline_root_ids WHERE cycle_id<>?', cycle);
      // Keep previous published pages until their replacements are complete.
    },
    async canContinue() {
      const owner = accountForScope(scope);
      if (!owner?.sessionValid || owner.role !== role
          || !canRecordOffline(offlineAccessForScope(scope), 'READ')) return false;
      const network = await NetInfo.fetch();
      return network.isConnected === true && network.isInternetReachable !== false;
    },
    async loadRoot(cycle, kind) {
      const db = await getOfflineDatabase(scope);
      const row = await db.getFirstAsync<{ data_json: string }>('SELECT data_json FROM offline_datasets WHERE dataset_key=?', rootKey(cycle, kind));
      return row ? JSON.parse(row.data_json) : null;
    },
    async saveRoot(cycle, kind, state) {
      const db = await getOfflineDatabase(scope);
      if (state.page === 0) {
        await db.runAsync('DELETE FROM offline_datasets WHERE dataset_key LIKE ?', rootKey(cycle, kind) + ':%');
        await db.runAsync('DELETE FROM offline_root_ids WHERE cycle_id=? AND kind=?', cycle, kind);
      }
      await db.runAsync(`INSERT INTO offline_datasets(dataset_key, data_json, saved_at) VALUES (?, ?, ?)
        ON CONFLICT(dataset_key) DO UPDATE SET data_json=excluded.data_json, saved_at=excluded.saved_at`, rootKey(cycle, kind), JSON.stringify(state), Date.now());
    },
    async loadRootChunk(cycle, kind, chunk) {
      const db = await getOfflineDatabase(scope);
      const row = await db.getFirstAsync<{ data_json: string }>('SELECT data_json FROM offline_datasets WHERE dataset_key=?', `${rootKey(cycle, kind)}:page:${chunk}`);
      if (!row) throw new Error('A saved download chunk is unavailable; reconnect to prepare data again');
      return JSON.parse(row.data_json);
    },
    async commitRootChunk(cycle, kind, chunk, records, state) {
      const db = await getOfflineDatabase(scope);
      try {
        await withOfflineTransaction(scope, async (tx) => {
          for (const record of records) await tx.runAsync('INSERT INTO offline_root_ids(cycle_id, kind, record_id) VALUES (?, ?, ?)', cycle, kind, record.id);
          for (const [key, value] of [[`${rootKey(cycle, kind)}:page:${chunk}`, records], [rootKey(cycle, kind), state]]) {
            await tx.runAsync(`INSERT INTO offline_datasets(dataset_key, data_json, saved_at) VALUES (?, ?, ?)
              ON CONFLICT(dataset_key) DO UPDATE SET data_json=excluded.data_json, saved_at=excluded.saved_at`, String(key), JSON.stringify(value), Date.now());
          }
        });
      } catch (error: any) {
        if (String(error.message).includes('UNIQUE constraint')) {
          await this.saveRoot(cycle, kind, { page: 0, count: 0, chunks: 0, complete: false });
          throw new Error('This list changed between download pages. Preparation will retry.');
        }
        throw error;
      }
    },
    async publish(kind, records) {
      const db = await getOfflineDatabase(scope);
      await db.runAsync(`INSERT INTO offline_datasets(dataset_key, data_json, saved_at) VALUES (?, ?, ?)
        ON CONFLICT(dataset_key) DO UPDATE SET data_json=excluded.data_json, saved_at=excluded.saved_at`, `published:${kind}`, JSON.stringify(records), Date.now());
      if (kind === 'batches' && !Array.isArray(records) && records.snapshotStartedAt) await db.runAsync("DELETE FROM offline_datasets WHERE dataset_key LIKE 'receipt-overlay:%' AND saved_at < ?", records.snapshotStartedAt);
    },
    async request(path, params, snapshotVersion) {
      const guarded = ({ "/members": "/members/offline-pages", "/chits": "/chits/offline-pages", "/chits/mine": "/chits/offline-pages", "/payments/batches/member": "/payments/batches/offline-pages", "/payments/batches/mine": "/payments/batches/offline-pages", "/payments/batches/all": "/payments/batches/offline-pages" } as Record<string, string>)[path];
      if (guarded) { path = guarded; params = { ...params, ...(snapshotVersion ? { snapshotVersion } : {}) }; }
      const token=guarded?offlineAccessForScope(scope)?.grant?.token:null;
      if(guarded&&!token)throw new Error('Connect to verify offline download access');
      return (await requestAsAccount(scope, { method: 'GET', url: path, params,
        ...(token?{ headers:{ 'X-Offline-Authorization':token } }:{}), })).data;
    },
    saveResponse: (path, params, response) => saveHttpResponse(scope, { method: 'GET', url: path, params }, response),
    async addJobs(cycle, jobs) {
      const db = await getOfflineDatabase(scope);
      // Small atomic statements let payment inserts run between preparation
      // batches, without accidentally joining an unrelated SQLite transaction.
      for (let offset = 0; offset < jobs.length; offset += 50) {
        const batch = jobs.slice(offset, offset + 50);
        const placeholders = batch.map(() => "(?, ?, ?, 'PENDING')").join(',');
        const values = batch.flatMap((job) => [jobKey(cycle, job.key), cycle, JSON.stringify(job)]);
        await db.runAsync(`INSERT OR IGNORE INTO offline_preparation_jobs(job_key, cycle_id, request_json, status) VALUES ${placeholders}`, ...values);
      }
    },
    async nextJobs(cycle, limit) {
      const db = await getOfflineDatabase(scope);
      const rows = await db.getAllAsync<{ request_json: string }>(
        "SELECT request_json FROM offline_preparation_jobs WHERE cycle_id=? AND status='PENDING' AND next_attempt_at<=? ORDER BY job_key LIMIT ?",
        cycle, Date.now(), limit);
      return rows.map((row) => JSON.parse(row.request_json) as PreparationJob);
    },
    async finishJob(cycle, key) {
      const db = await getOfflineDatabase(scope);
      await db.runAsync("UPDATE offline_preparation_jobs SET status='DONE', error_message=NULL WHERE job_key=?", jobKey(cycle, key));
    },
    async failJob(cycle, key, message) {
      const db = await getOfflineDatabase(scope);
      await db.runAsync('UPDATE offline_preparation_jobs SET next_attempt_at=?, error_message=? WHERE job_key=?', Date.now() + 30_000, message, jobKey(cycle, key));
    },
    async jobCounts(cycle) {
      const db = await getOfflineDatabase(scope);
      const row = await db.getFirstAsync<{ total: number; done: number; pending: number }>(
        "SELECT COUNT(*) AS total, SUM(status='DONE') AS done, SUM(status<>'DONE') AS pending FROM offline_preparation_jobs WHERE cycle_id=?", cycle);
      return { total: Number(row?.total ?? 0), done: Number(row?.done ?? 0), pending: Number(row?.pending ?? 0) };
    },
  };
}

const preparing = new Map<string, Promise<PreparationManifest | null>>();
export function prepareOfflineData(scope: string, options: { force?: boolean; maxRequests?: number; deadline?: number } = {}) {
  const existing = preparing.get(scope); if (existing) return existing;
  const owner = accountForScope(scope);
  if (!owner?.sessionValid || !canRecordOffline(offlineAccessForScope(scope), 'READ')) return Promise.resolve(null);
  const task = prepareCoreData(adapterFor(scope, owner.role), options).finally(() => preparing.delete(scope));
  preparing.set(scope, task);
  return task;
}

let savedPreparation: Promise<void> | null = null;
export function prepareSavedAccountData(deadline = Date.now() + 60_000): Promise<void> {
  if (savedPreparation) return savedPreparation;
  savedPreparation = (async () => {
    const activeScope = getAccountScope(useAuthStore.getState().user);
    const accounts = [...useAuthStore.getState().accounts]
      .filter((account) => account.sessionValid && account.authSource !== 'HUB')
      .sort((a, b) => Number(getStoredAccountScope(b) === activeScope) - Number(getStoredAccountScope(a) === activeScope));
    for (const account of accounts) {
      if (Date.now() >= deadline) break;
      const scope = getStoredAccountScope(account);
      try {
        await restoreOfflineAccess(scope);
        const access = offlineAccessForScope(scope);
        if (!access || Date.now() - access.checkedAt >= 60_000) await refreshOfflineAccess(scope);
        await prepareOfflineData(scope, { deadline });
      } catch { /* This account's saved checkpoint resumes independently. */ }
    }
  })().finally(() => { savedPreparation = null; });
  return savedPreparation;
}
