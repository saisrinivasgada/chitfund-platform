import { prepareCoreData } from '../../../shared/offline/preparation';
import { canRecordOffline } from '../../../shared/offline/accessPolicy';
import { requestForAccount } from './accountClient';
import { saveCachedResponse } from './cache';
import {
  addRowsIfAbsent, countIndexRows, deleteRows, mutateRow, readRow, readRowsWithPrefix,
  readIndexRows, seal, unseal, writeRow,
} from './storage';

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
}

export async function loadPreparationState(scope) {
  const row = await readRow('preparation', scope);
  return row?.encrypted ? unseal(scope, row.encrypted) : null;
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
    role, newId: () => crypto.randomUUID(), loadManifest: () => loadPreparationState(scope),
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
      const jobs = await readRowsWithPrefix('preparationJobs', `${scope}:`);
      await deleteRows('preparationJobs', jobs.filter((job) => job.cycle !== cycle).map((job) => job.key));
      const work = await readRowsWithPrefix('datasets', `${scope}:work:`);
      await deleteRows('datasets', work.filter((row) => !row.key.startsWith(`${scope}:work:${cycle}:`)).map((row) => row.key));
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
      await writeRow('datasets', { key: rootKey(cycle, kind), scope, encrypted: await seal(scope, state), savedAt: Date.now() });
    },
    async publish(kind, records) {
      await writeRow('datasets', { key: `${scope}:published:${kind}`, scope, encrypted: await seal(scope, records), savedAt: Date.now() });
    },
    async request(path, params) {
      const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
      const data = await requestForAccount(scope, path + (query ? '?' + query : ''));
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
