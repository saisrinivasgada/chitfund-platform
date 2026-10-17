import { prepareCoreData } from '../../../shared/offline/preparation';
import { canRecordOffline } from '../../../shared/offline/accessPolicy';
import { requestForAccount } from './accountClient';
import { saveCachedResponse } from './cache';
import {
  deletePrefixBefore, deletePrefixExcept, commitDatasetChunk, addRowsIfAbsent, countIndexRows, mutateRow, readRow, readRowsWithPrefix,
  readIndexRows, seal, unseal, writeRow,
} from './storage';

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
}

export async function loadPreparationState(scope) {
  const row = await readRow('preparation', scope);
  const manifest = row?.encrypted ? await unseal(scope, row.encrypted) : null;
  return manifest?.status === 'ready' && manifest.startedAt < (row.financialDirtyAt ?? 0) ? { ...manifest, lastCompleteAt: 0 } : manifest;
}

function notify(scope, manifest) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('chitwise-offline-preparation');
  channel.postMessage({ scope, manifest }); channel.close();
}

function adapterFor(scope, role) {
  const jobKey = async (cycle, key) => `${scope}:${cycle}:${await digest(key)}`;
  const rootKey = (cycle, kind) => `${scope}:work:${cycle}:${kind}`;
  return {
    role, requiresRootSnapshots: true, newId: () => crypto.randomUUID(), loadManifest: () => loadPreparationState(scope),
    async claimLease() {
      const token = crypto.randomUUID(); let claimed = false;
      await mutateRow('preparation', scope, (prior) => {
        if (prior?.leaseUntil > Date.now()) return undefined;
        claimed = true; return { ...prior, scope, leaseToken: token, leaseUntil: Date.now() + 120_000 };
      });
      return claimed ? token : null;
    },
    async saveManifest(manifest, lease) {
      const encrypted = await seal(scope, manifest);
      await mutateRow('preparation', scope, (prior) => {
        if (prior?.leaseToken !== lease) throw new Error('Offline preparation moved to another worker');
        return { ...prior, encrypted, leaseUntil: Date.now() + 120_000 };
      });
      notify(scope, manifest); return manifest;
    },
    async releaseLease(lease) {
      await mutateRow('preparation', scope, (prior) => prior?.leaseToken === lease ? { ...prior, leaseUntil: 0, leaseToken: null } : undefined);
    },
    async cleanOldWork(cycle) {
      await deletePrefixExcept('preparationJobs', `${scope}:`, [`${scope}:${cycle}:`]);
      const published = await readRowsWithPrefix('datasets', `${scope}:published:`);
      const retained = new Set([cycle]);
      for (const row of published) {
        const data = await unseal(scope, row.encrypted);
        if (data?.format === 'chunks-v1') retained.add(data.cycle);
      }
      await deletePrefixExcept('datasets', `${scope}:work:`, [...retained].map((id) => `${scope}:work:${id}:`));
    },
    async canContinue() {
      const owner = await readRow('accounts', scope);
      return navigator.onLine && owner?.sessionValid && owner.user.role === role
        && canRecordOffline(owner.offlineAccess, 'READ');
    },
    async loadRoot(cycle, kind) {
      const row = await readRow('datasets', rootKey(cycle, kind));
      return row ? unseal(scope, row.encrypted) : null;
    },
    async saveRoot(cycle, kind, state) {
      if (state.page === 0) {
        await deletePrefixExcept('datasets', rootKey(cycle, kind) + ':', []);
      }
      await writeRow('datasets', { key: rootKey(cycle, kind), scope, encrypted: await seal(scope, state), savedAt: Date.now() });
    },
    async loadRootChunk(cycle, kind, chunk) {
      const row = await readRow('datasets', `${rootKey(cycle, kind)}:page:${chunk}`);
      if (!row) throw new Error('A saved download chunk is unavailable; reconnect to prepare data again');
      return unseal(scope, row.encrypted);
    },
    async commitRootChunk(cycle, kind, chunk, records, state) {
      const base = rootKey(cycle, kind);
      const ids = await Promise.all(records.map(async (record) => `${base}:seen:${await digest(String(record.id))}`));
      const savedAt = Date.now();
      try {
        await commitDatasetChunk([
          { key: `${base}:page:${chunk}`, scope, encrypted: await seal(scope, records), savedAt },
          { key: base, scope, encrypted: await seal(scope, state), savedAt },
          ...ids.map((key) => ({ key, scope, savedAt })),
        ], ids);
      } catch (error) {
        if (error.message.includes('list changed')) {
          await this.saveRoot(cycle, kind, { page: 0, count: 0, chunks: 0, complete: false });
        }
        throw error;
      }
    },
    async publish(kind, records) {
      await writeRow('datasets', { key: `${scope}:published:${kind}`, scope, encrypted: await seal(scope, records), savedAt: Date.now() });
      if (kind === 'batches' && records?.snapshotStartedAt) await deletePrefixBefore('datasets',`${scope}:receipt-overlay:`,records.snapshotStartedAt);
    },
    async request(path, params, snapshotVersion) {
      const guarded = { "/members": "/members/offline-pages", "/chits": "/chits/offline-pages", "/chits/mine": "/chits/offline-pages", "/payments/batches/member": "/payments/batches/offline-pages", "/payments/batches/mine": "/payments/batches/offline-pages", "/payments/batches/all": "/payments/batches/offline-pages" }[path];
      if (guarded) { path = guarded; params = { ...params, ...(snapshotVersion ? { snapshotVersion } : {}) }; }
      const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
      const token=guarded?(await readRow('accounts',scope))?.offlineAccess?.grant?.token:null;
      if(guarded&&!token)throw new Error('Connect to verify offline download access');
      const data = await requestForAccount(scope, path + (query ? '?' + query : ''),token?{headers:{'X-Offline-Authorization':token}}:{});
      return { success: true, data };
    },
    saveResponse: (path, params, data) => saveCachedResponse(scope, { method: 'GET', url: path, params }, data),
    async addJobs(cycle, jobs) {
      const rows = await Promise.all(jobs.map(async (job) => ({ key: await jobKey(cycle, job.key), scope, cycle,
        status: 'PENDING', nextAttemptAt: 0, encrypted: await seal(scope, job) })));
      if (rows.length) await addRowsIfAbsent('preparationJobs', rows);
    },
    async nextJobs(cycle, limit) {
      const range = IDBKeyRange.bound([scope, cycle, 'PENDING', 0], [scope, cycle, 'PENDING', Date.now()]);
      const rows = await readIndexRows('preparationJobs', 'ready', range, limit);
      return Promise.all(rows.map((row) => unseal(scope, row.encrypted)));
    },
    async finishJob(cycle, key) {
      await mutateRow('preparationJobs', await jobKey(cycle, key), (prior) => prior && ({ ...prior, status: 'DONE', errorMessage: null }));
    },
    async failJob(cycle, key, message) {
      await mutateRow('preparationJobs', await jobKey(cycle, key), (prior) => prior && ({ ...prior, nextAttemptAt: Date.now() + 30_000, errorMessage: message }));
    },
    async jobCounts(cycle) {
      const [done, pending] = await Promise.all(['DONE', 'PENDING'].map((status) =>
        countIndexRows('preparationJobs', 'status', IDBKeyRange.only([scope, cycle, status]))));
      return { total: done + pending, done, pending };
    },
  };
}

const preparing = new Map();
export function prepareOfflineData(scope, options = {}) {
  if (preparing.has(scope)) return preparing.get(scope);
  const task = (async () => {
    const owner = await readRow('accounts', scope);
    if (!owner?.sessionValid || !canRecordOffline(owner.offlineAccess, 'READ')) return null;
    return prepareCoreData(adapterFor(scope, owner.user.role), options);
  })().finally(() => preparing.delete(scope));
  preparing.set(scope, task); return task;
}
