// Real SQLite exercises the native SQL and transactions. Encryption itself is verified on-device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

test('native confirmed sign-out deletes unconfirmed rows and rejects stale workers until sign-in', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chitwise-signout-')); const connections = []; const keys = new Map();
  const dependencies = {
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, randomUUID, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex') },
    'expo-secure-store': { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1, getItemAsync: async (key) => keys.get(key), setItemAsync: async (key,value) => keys.set(key,value),deleteItemAsync:async(key)=>keys.delete(key) },
    'expo-file-system': { File: class { constructor(dir, name) { this.exists = existsSync(join(dir,name)); } } },
    'expo-sqlite': { defaultDatabaseDirectory: directory, openDatabaseAsync: async (name) => {
      const db = new DatabaseSync(join(directory,name)); connections.push(db);
      return { execAsync: async (sql) => db.exec(sql), getFirstAsync: async (sql,...args) => sql === 'PRAGMA cipher_version' ? { cipher_version: 'SQL-test-only' } : db.prepare(sql).get(...args),
        getAllAsync: async (sql,...args) => db.prepare(sql).all(...args), runAsync: async (sql,...args) => db.prepare(sql).run(...args), closeAsync: async () => {} };
    } },
  };
  try {
    const context = vm.createContext({}); const source = ts.transpileModule(await readFile(new URL('./database.ts', import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = new vm.SourceTextModule(source,{ context });
    await module.link(async (name) => { const values = dependencies[name]; if (!values) throw new Error(name);
      return new vm.SyntheticModule(Object.keys(values),function () { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }, { context }); });
    await module.evaluate(); const db = module.namespace;
    const operation = (id, scope = 'a:ADMIN') => ({ operationId:id, accountScope:scope, tenantId:'tenant',actorId:'actor',action:'RECORD_PAYMENT',entityType:'PAYMENT',payload:{amount:1000},payloadHash:id,status:'QUEUED',attempts:0,nextAttemptAt:0,createdAt:1,updatedAt:1 });
    for (const id of ['unsent','review','receipt','failed']) await db.insertOperation(operation(id));
    await db.insertOperation(operation('other-org','b:ADMIN'));
    await db.updateOperation('review','a:ADMIN','CONFLICT',{ serverReviewId:'server-review' });
    await db.updateOperation('receipt','a:ADMIN','SUCCEEDED',{ serverReceiptId:'server-receipt' });
    await db.updateOperation('failed','a:ADMIN','PERMANENT_FAILURE');
    assert.equal(await db.getUnsentOperationCount('a:ADMIN'),2);
    const originalEpoch=await db.offlineRecordingEpoch('a:ADMIN');
    await db.discardUnsentOperationsForSignOut('a:ADMIN');
    assert.equal(await db.getOperation('unsent','a:ADMIN'),null); assert.equal(await db.getOperation('failed','a:ADMIN'),null);
    assert.equal((await db.getOperation('review','a:ADMIN')).serverReviewId,'server-review');
    assert.equal((await db.getOperation('receipt','a:ADMIN')).serverReceiptId,'server-receipt');
    assert.ok(await db.getOperation('other-org','b:ADMIN'));
    await assert.rejects(db.insertOperation(operation('late')), /Sign in again/);
    assert.equal(await db.claimOperation(operation('unsent')),false);
    await db.resumeOfflineSession('a:ADMIN');
    await assert.rejects(db.insertOperation(operation('stale-after-relogin'),originalEpoch),/Sign in again/);
    assert.equal(await db.getUnsentOperationCount('a:ADMIN'),0);
    await db.insertOperation(operation('new')); assert.ok(await db.claimOperation(operation('new')));
    const beforeFirstSave=await db.offlineRecordingEpoch('fresh:ADMIN');
    await db.discardUnsentOperationsForSignOut('fresh:ADMIN');await db.resumeOfflineSession('fresh:ADMIN');
    await assert.rejects(db.insertOperation(operation('old-save-before-first-database','fresh:ADMIN'),beforeFirstSave),/Sign in again/);
    assert.equal(await db.getUnsentOperationCount('fresh:ADMIN'),0);
    const multi = { ...operation('cancel-local'), payload: { amount: 1000, allocations: [{ chitId: 'one', amount: 600 }, { chitId: 'two', amount: 400 }] } };
    await db.insertOperation(multi); await db.requestPaymentCancellation('a:ADMIN','cancel-local','Mistaken entry; no cash collected','actor');
    assert.equal((await db.getOperation('cancel-local','a:ADMIN')).status,'CANCELLED');
    assert.equal(await db.claimOperation(multi),false);
    assert.equal(JSON.stringify((await db.getOperation('cancel-local','a:ADMIN')).payload),JSON.stringify(multi.payload));
    assert.ok(!(await db.getVisibleOperations('a:ADMIN',100)).some((r)=>['SUCCEEDED','CANCELLED'].includes(r.status)));
    assert.ok((await db.getVisibleOperations('a:ADMIN',100,true)).some((r)=>r.operationId==='cancel-local'));
    await db.insertOperation(operation('cancel-in-flight')); await db.claimOperation(operation('cancel-in-flight'));
    await assert.rejects(db.requestPaymentCancellation('a:ADMIN','cancel-in-flight','No cash collected','actor'),/started syncing/);
    assert.equal((await db.getOperation('cancel-in-flight','a:ADMIN')).status,'SYNCING');
    await db.updateOperation('cancel-in-flight','a:ADMIN','RETRYABLE_FAILURE',{attempts:1});
    await db.requestPaymentCancellation('a:ADMIN','cancel-in-flight','No cash collected','actor');
    assert.equal((await db.getOperation('cancel-in-flight','a:ADMIN')).status,'QUEUED');
    assert.equal((await db.getOperation('cancel-in-flight','a:ADMIN')).serverReceipt.cancellationRequest.noMoneyCollected,true);
    await assert.rejects(db.requestPaymentCancellation('a:ADMIN','cancel-in-flight','Different reason','actor'),/started syncing/);
  } finally { for (const db of connections) db.close(); await rm(directory,{ recursive:true,force:true }); }
});
