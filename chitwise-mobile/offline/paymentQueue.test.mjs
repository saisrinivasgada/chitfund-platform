import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(await readFile(new URL('./paymentQueue.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const original = { memberId: 'member-a', chitId: 'chit-a', amount: 1000, paymentMode: 'CASH', recordedAt: '2026-01-01T12:00:00Z', offlineAuthorization: 'original-expired-grant', allocations: [{ chitId: 'chit-a', amount: 600 }, { chitId: 'chit-b', amount: 400 }] };
async function device(status = 'RETRYABLE_FAILURE', receipt, options = {}) {
  const row = { operationId: 'saved-a', accountScope: 'scope-a', actorId: 'actor-a', tenantId: 'tenant-a', action: 'RECORD_PAYMENT', status, attempts: 1, payload: structuredClone(original), serverReceipt: receipt };
  const requests = []; let refreshes = 0; let loseAck = options.loseAck ?? true;
  const store = (value) => ({ getState: () => value });
  const dependencies = {
    axios: { default: { isAxiosError: (e) => !!e?.isAxiosError } },
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, text) => createHash('sha256').update(text).digest('hex'), randomUUID: () => 'new-operation' },
    '@react-native-community/netinfo': { default: { fetch: async () => ({ isConnected: true, isInternetReachable: true }) } },
    '../services/api': { recordPayment: async () => { throw new Error('Unexpected unscoped delivery'); } },
    '../store/authStore': { useAuthStore: store({ user: { id: 'actor-a', role: 'ADMIN' } }) },
    './accountScope': { requireOrganizationScope: () => ({ scope: 'scope-a', actorId: 'actor-a', tenantId: 'tenant-a' }) },
    './database': { offlineRecordingEpoch: async()=>'', hasOfflineDatabase: async () => true, getOperation: async () => row,
      getSyncCounts: async () => ({ pending: row.status === 'SUCCEEDED' ? 0 : 1, conflicts: 0, failed: 0 }),
      claimOperation: async () => { options.beforeClaim?.(row); return true; }, insertOperation: async () => { throw new Error('Original must not be replaced'); }, setLastSyncedAt: async () => {},
      updateOperation: async (_, scope, state, values) => { assert.equal(scope, 'scope-a'); row.status = state; Object.assign(row, values); } },
    '../store/syncStore': { useSyncStore: store({ setStateForScope() {} }) },
    './accountClient': { accountForScope: () => ({ userId: 'actor-a', tenantId: 'tenant-a', sessionValid: true }), requestAsAccount: async (scope, request) => {
      assert.equal(scope, 'scope-a'); requests.push(structuredClone(request));
      if (loseAck) { loseAck = false; throw Object.assign(new Error('Acknowledgement lost'), { isAxiosError: true }); }
      return { data: { data: options.response ?? { id: 'receipt-a', status: 'COMPLETED' } } };
    } },
    './access': { offlineAccessForScope: () => undefined, refreshOfflineAccess: async () => { refreshes++; throw new Error('Expired'); }, useOfflineAccessStore: store({ accounts: {} }) },
    './accessPolicy': { canRecordOffline: () => false, requireOfflineRecording: () => { throw new Error('New offline recording is expired'); } },
    './financialRefresh': { refreshPostedCollection: async () => {} },
  };
  const context = vm.createContext({ Date, Error, Math, Number, String, Object, Array, Set });
  const module = new vm.SourceTextModule(code, { context });
  await module.link(async (name) => {
    const values = dependencies[name]; if (!values) throw new Error(`Unmocked dependency: ${name}`);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  return { process: module.namespace.processPaymentOperation, queue: module.namespace.recordPaymentOfflineCapable, row, requests, refreshes: () => refreshes };
}
const input = () => { const { recordedAt, offlineAuthorization, ...fields } = original; return { ...fields, idempotencyKey: 'saved-a' }; };
test('native lost acknowledgement retries original time, grant and operation after expiry', async () => {
  const phone = await device();
  assert.equal((await phone.queue(input())).offlineQueued, true);
  assert.equal((await phone.queue(input())).id, 'receipt-a');
  assert.equal(phone.row.status, 'SUCCEEDED'); assert.equal(phone.refreshes(), 0);
  assert.deepEqual(phone.requests[0], phone.requests[1]); assert.deepEqual(phone.requests[0].data, original);
  assert.equal(phone.requests[0].headers['X-Idempotency-Key'], 'saved-a'); assert.deepEqual(phone.row.payload, original);
});
test('native retries cannot change saved money, reuse closed entries, or invent missing receipts', async () => {
  const changed = await device(); await assert.rejects(changed.queue({ ...input(), amount: 999 }), /different details/); assert.equal(changed.requests.length, 0);
  for (const status of ['REFUNDED', 'CANCELLED']) {
    const closed = await device('SUCCEEDED', { offlineReviewResolution: status });
    await assert.rejects(closed.queue(input()), /closed after review/); assert.equal(closed.requests.length, 0);
  }
  const missing = await device('SUCCEEDED'); await assert.rejects(missing.queue(input()), /confirmation needs verification/); assert.equal(missing.requests.length, 0);
});

test('a cancellation queued after a worker read replaces delivery and never resends the payment', async () => {
  const phone = await device('QUEUED', undefined, { loseAck: false, response: { id: 'cancel-review', status: 'CANCELLED', resolutionReason: 'No money collected' },
    beforeClaim: (row) => { row.serverReceipt = { cancellationRequest: { reason: 'No money collected', noMoneyCollected: true } }; } });
  const stale = structuredClone(phone.row);
  assert.equal((await phone.process(stale)).kind, 'succeeded');
  assert.equal(phone.row.status, 'CANCELLED'); assert.equal(phone.requests.length, 1);
  assert.equal(phone.requests[0].url, '/payments/offline/reviews/cancel-unsynced');
  assert.deepEqual(phone.requests[0].data.original, original);
});
test('a cancellation after a lost acknowledgement confirms the existing receipt for History and Void', async () => {
  const phone = await device('QUEUED', { cancellationRequest: { reason: 'Mistaken offline entry', noMoneyCollected: true } },
    { loseAck: false, response: { status: 'RECEIPT_EXISTS', receipt: { id: 'received-before-cancel', totalAmount: 1000 } } });
  await phone.process(phone.row); assert.equal(phone.row.status, 'SUCCEEDED');
  assert.equal(phone.row.serverReceiptId, 'received-before-cancel'); assert.equal(phone.requests.length, 1);
  assert.equal(phone.requests[0].url, '/payments/offline/reviews/cancel-unsynced');
});
