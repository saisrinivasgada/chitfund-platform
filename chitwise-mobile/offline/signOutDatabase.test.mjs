import { fileURLToPath } from 'node:url';
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

test('native upgrade preserves unknown outcomes for review and confirmed sign-out rejects stale workers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chitwise-signout-')); const connections = []; const keys = new Map();
  const dependencies = {
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, randomUUID, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex') },
    'expo-secure-store': { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1, getItemAsync: async (key) => keys.get(key), setItemAsync: async (key,value) => keys.set(key,value),deleteItemAsync:async(key)=>keys.delete(key) },
    'expo-file-system': { File: class { constructor(dir, name) { assert.match(dir, /^file:\/\//, 'Expo File needs an absolute file URI, including on Android'); this.exists = existsSync(join(fileURLToPath(dir),name)); } } },
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
    // Reopening a version-six database must preserve unknown old outcomes for review.
    const legacyScope='legacy:STAFF';
    const legacyDb=await db.getOfflineDatabase(legacyScope);
    const oldPayload={requestId:'old-task'};
    const oldOperation=(id,status,extra={})=>({operationId:id,accountScope:legacyScope,tenantId:'tenant',actorId:'actor',action:'MARK_PICKUP',entityType:'CASH_REQUEST',payload:oldPayload,payloadHash:createHash('sha256').update(JSON.stringify(oldPayload)).digest('hex'),status,attempts:1,nextAttemptAt:0,createdAt:1,updatedAt:1,...extra});
    for(const op of [oldOperation('old-unknown','SUCCEEDED'),oldOperation('old-conflict','CONFLICT'),oldOperation('old-failure','PERMANENT_FAILURE'),oldOperation('old-receipt','SUCCEEDED'),oldOperation('old-reviewed','SUCCEEDED'),oldOperation('old-held','CONFLICT'),oldOperation('old-cancel','CANCELLED')])await db.insertOperation(op);
    await db.updateOperation('old-receipt',legacyScope,'SUCCEEDED',{serverReceiptId:'confirmed-receipt'});
    await db.updateOperation('old-reviewed',legacyScope,'SUCCEEDED',{serverReceipt:{offlineReviewResolution:'CANCELLED'}});
    await db.updateOperation('old-held',legacyScope,'CONFLICT',{serverReviewId:'confirmed-review'});
    await legacyDb.execAsync('PRAGMA user_version=6');
    const reopen=new vm.SourceTextModule(source,{context});
    await reopen.link(async name=>{const values=dependencies[name];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
    await reopen.evaluate();const upgraded=reopen.namespace;
    for(const id of ['old-unknown','old-conflict','old-failure']){const row=await upgraded.getOperation(id,legacyScope);assert.equal(row.status,'QUEUED');assert.equal(row.lastErrorCode,'LEGACY_REVIEW_REQUIRED');assert.equal(JSON.stringify(row.payload),JSON.stringify(oldPayload));assert.equal(row.payloadHash,oldOperation(id).payloadHash);assert.equal(row.operationId,id);}
    for(const [id,status]of [['old-receipt','SUCCEEDED'],['old-reviewed','SUCCEEDED'],['old-held','CONFLICT'],['old-cancel','CANCELLED']])assert.equal((await upgraded.getOperation(id,legacyScope)).status,status);
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
    assert.equal(await db.claimRecoveryOperation(multi),null,'A cancelled entry can never become a recovered review');
    assert.ok(!(await db.getRecoverablePayments('a:ADMIN')).some(r=>r.operationId==='cancel-in-flight'),'Pending cancellation must keep its reconciliation path');
    const race=operation('cancel-recovery-race');await db.insertOperation(race);
    await Promise.all([db.requestPaymentCancellation('a:ADMIN',race.operationId,'No money collected','actor'),db.claimRecoveryOperation(race).then(lease=>assert.equal(lease,null))]);
    assert.equal((await db.getOperation(race.operationId,'a:ADMIN')).status,'CANCELLED');
    const recovering=operation('recovery-wins');await db.insertOperation(recovering);
    const lease=await db.claimRecoveryOperation(recovering);assert.ok(lease);
    await assert.rejects(db.requestPaymentCancellation('a:ADMIN',recovering.operationId,'No money collected','actor'),/started syncing/);
    assert.equal(await db.claimRecoveryOperation(recovering),null,'Two recovery runtimes cannot own the same collection');
    assert.equal(await db.completeRecoveryOperation(recovering,lease,'recovered-review'),true);
    await db.releaseRecoveryOperation(recovering,lease);
    assert.equal((await db.getOperation(recovering.operationId,'a:ADMIN')).serverReviewId,'recovered-review');
    const interrupted=operation('interrupted-recovery');await db.insertOperation(interrupted);
    const oldLease=await db.claimRecoveryOperation(interrupted);assert.ok(oldLease);
    const raw=await db.getOfflineDatabase('a:ADMIN');await raw.runAsync('UPDATE sync_operations SET updated_at=0 WHERE operation_id=?',interrupted.operationId);
    await db.recoverInterruptedOperations('a:ADMIN');
    const renewed=await db.getOperation(interrupted.operationId,'a:ADMIN');const newLease=await db.claimRecoveryOperation(renewed);assert.ok(newLease);
    assert.equal(await db.completeRecoveryOperation(interrupted,oldLease,'stale-review'),false,'An expired response cannot overwrite a newer recovery');
    await db.releaseRecoveryOperation(interrupted,oldLease);
    assert.equal((await db.getOperation(interrupted.operationId,'a:ADMIN')).status,'SYNCING');
    assert.equal(await db.completeRecoveryOperation(renewed,newLease,'current-review'),true);
    const failedRecovery=operation('release-recovery');await db.insertOperation(failedRecovery);
    assert.equal(await db.claimRecoveryOperation({...failedRecovery,tenantId:'other-tenant'}),null);
    const failedLease=await db.claimRecoveryOperation(failedRecovery);await db.releaseRecoveryOperation(failedRecovery,failedLease);
    const released=await db.getOperation(failedRecovery.operationId,'a:ADMIN');assert.equal(released.status,'QUEUED');assert.equal(released.attempts,1);
    assert.equal(JSON.stringify(released.payload),JSON.stringify(failedRecovery.payload));
  } finally { for (const db of connections) db.close(); await rm(directory,{ recursive:true,force:true }); }
});
