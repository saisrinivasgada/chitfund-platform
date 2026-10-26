import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('./cancelSavedPayment.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const original = () => ({ operationId: 'payment', accountScope: 'org-a', actorId: 'admin-a', tenantId: 'tenant-a',
  action: 'RECORD_PAYMENT', status: 'RETRYABLE_FAILURE', attempts: 1, payloadHash: 'original-hash',
  payload: { amount: 1500, allocations: [{ chitId: 'one', amount: 1000 }, { chitId: 'two', amount: 500 }] } });
async function harness(options = {}) {
  let row = { ...original(), ...options.row }, now = 0, active = true, waits = 0, reads = 0, cancellations = 0;
  const evidence = structuredClone(row.payload);
  const context = vm.createContext({
    Date: class extends Date { static now() { return now; } },
    setTimeout(resolve, delay) { now += delay; waits++; options.onWait?.({ row, waits, switchAccount: () => { active = false; } }); resolve(); },
  });
  const deps = {
    getOperation: async (id, scope) => {
      assert.equal(id, 'payment'); assert.equal(scope, 'org-a'); reads++;
      options.onRead?.({ row, reads, switchAccount: () => { active = false; } });
      return row ? structuredClone(row) : null;
    },
    requestPaymentCancellation: async (scope, id, reason, actor) => {
      assert.equal(scope, 'org-a'); assert.equal(id, 'payment'); assert.equal(actor, 'admin-a'); cancellations++;
      await options.beforeCancel?.({ row, cancellations });
      if (options.failure) throw new Error(options.failure);
      if (row.status === 'SYNCING' || row.serverReceiptId || row.serverReviewId) throw new Error('Payment started syncing');
      row.status = row.attempts === 0 ? 'CANCELLED' : 'QUEUED';
      row.serverReceipt = { cancellationRequest: { reason, noMoneyCollected: true } };
    },
  };
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(name => { assert.equal(name, './database'); return new vm.SyntheticModule(Object.keys(deps), function () {
    for (const [key, value] of Object.entries(deps)) this.setExport(key, value);
  }, { context }); });
  await mod.evaluate();
  return { cancel: (reason = 'Mistaken entry; no money collected') => mod.namespace.cancelSavedPayment('org-a', 'payment', reason, 'admin-a', () => active),
    row: () => row, remove: () => { row = null; }, counts: () => ({ waits, reads, cancellations }),
    unchanged: () => assert.deepEqual(row.payload, evidence), switchAccount: () => { active = false; } };
}

test('cancel waits for a claimed send to fail, then preserves both original allocations for server verification', async () => {
  const app = await harness({ row: { status: 'SYNCING' }, onWait: ({ row, waits }) => {
    if (waits === 3) row.status = 'RETRYABLE_FAILURE';
  } });
  const result = await app.cancel();
  assert.equal(result.status, 'QUEUED'); assert.equal(result.serverReceipt.cancellationRequest.noMoneyCollected, true);
  assert.equal(app.counts().waits, 3); assert.equal(app.counts().cancellations, 1); app.unchanged();
});

test('sender claiming between the UI read and atomic cancel is awaited and retried', async () => {
  const app = await harness({ beforeCancel: ({ row, cancellations }) => {
    if (cancellations === 1) { row.status = 'SYNCING'; row.attempts++; }
  }, onWait: ({ row }) => { row.status = 'RETRYABLE_FAILURE'; } });
  const result = await app.cancel();
  assert.ok(result.serverReceipt.cancellationRequest); assert.equal(app.counts().cancellations, 2); app.unchanged();
});

test('a send that claims and fails before the cancel reread also retries safely', async () => {
  const app = await harness({ beforeCancel: ({ row, cancellations }) => {
    if (cancellations === 1) { row.attempts++; throw new Error('Claim lost, then network failed'); }
  } });
  assert.ok((await app.cancel()).serverReceipt.cancellationRequest);
  assert.equal(app.counts().cancellations, 2); app.unchanged();
});

for (const outcome of [
  { status: 'SUCCEEDED', serverReceiptId: 'server-receipt' },
  { status: 'CONFLICT', serverReviewId: 'server-review' },
]) test(`in-flight ${outcome.status} is refreshed without cancelling a receipt or recovered review`, async () => {
  const app = await harness({ row: { status: 'SYNCING' }, onWait: ({ row }) => Object.assign(row, outcome) });
  const result = await app.cancel(); assert.equal(result.status, outcome.status);
  assert.equal(app.counts().cancellations, 0); assert.equal(result.serverReceipt?.cancellationRequest, undefined); app.unchanged();
});

test('a hung sender times out honestly without changing or deleting the saved payment', async () => {
  const app = await harness({ row: { status: 'SYNCING' } });
  await assert.rejects(app.cancel(), /Cancellation has not been saved/);
  assert.equal(app.row().status, 'SYNCING'); assert.equal(app.counts().cancellations, 0); app.unchanged();
});

test('switching accounts during the wait or database read stops before cancellation', async () => {
  for (const options of [
    { row: { status: 'SYNCING' }, onWait: ({ switchAccount }) => switchAccount() },
    { onRead: ({ switchAccount }) => switchAccount() },
  ]) {
    const app = await harness(options); await assert.rejects(app.cancel(), /Account changed/);
    assert.equal(app.counts().cancellations, 0); app.unchanged();
  }
});

test('validation, unavailable entries, owner mismatches and session errors do not retry as sync races', async () => {
  const invalid = await harness(); await assert.rejects(invalid.cancel('no'), /5–500/); assert.equal(invalid.counts().reads, 0);
  const missing = await harness(); missing.remove(); await assert.rejects(missing.cancel(), /no longer available/);
  for (const row of [{ actorId: 'admin-b' }, { accountScope: 'org-b' }, { action: 'PARTIAL_COLLECT' }]) {
    const app = await harness({ row }); await assert.rejects(app.cancel(), /no longer available/); assert.equal(app.counts().cancellations, 0);
  }
  const signedOut = await harness({ failure: 'Sign in again' }); await assert.rejects(signedOut.cancel(), /Sign in again/);
  assert.equal(signedOut.counts().waits, 0); assert.equal(signedOut.row().status, 'RETRYABLE_FAILURE'); signedOut.unchanged();
});

test('never-sent cancellation remains local and duplicate clicks preserve the first cancellation reason', async () => {
  const app = await harness({ row: { attempts: 0, status: 'QUEUED' } });
  assert.equal((await app.cancel()).status, 'CANCELLED');
  assert.equal((await app.cancel('A different cancellation reason')).serverReceipt.cancellationRequest.reason, 'Mistaken entry; no money collected');
  assert.equal(app.counts().cancellations, 1); app.unchanged();
});
