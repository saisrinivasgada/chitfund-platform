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

test('native upgrade preserves unknown outcomes for review and confirmed sign-out rejects stale workers', async (t) => {
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
    assert.equal(await db.claimOperation(operation('unsent')),null);
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
    assert.equal(await db.claimOperation(multi),null);
    assert.equal(JSON.stringify((await db.getOperation('cancel-local','a:ADMIN')).payload),JSON.stringify(multi.payload));
    assert.ok(!(await db.getVisibleOperations('a:ADMIN',100)).some((r)=>['SUCCEEDED','CANCELLED'].includes(r.status)));
    assert.ok((await db.getVisibleOperations('a:ADMIN',100,true)).some((r)=>r.operationId==='cancel-local'));
    await db.insertOperation(operation('cancel-in-flight')); const inFlightLease=await db.claimOperation(operation('cancel-in-flight'));
    await assert.rejects(db.requestPaymentCancellation('a:ADMIN','cancel-in-flight','No cash collected','actor'),/started syncing/);
    assert.equal((await db.getOperation('cancel-in-flight','a:ADMIN')).status,'SYNCING');
    assert.equal(await db.completeClaimedOperation('cancel-in-flight','a:ADMIN',inFlightLease,'RETRYABLE_FAILURE',{attempts:1}),true);
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

    // Exercise the UI orchestration against the actual SQLite claims, rather
    // than weakening the SQL exclusion when a sender wins a cancellation race.
    let releaseClaim;
    context.setTimeout = (resolve) => { Promise.resolve().then(() => releaseClaim()).then(resolve); };
    const cancelSource=ts.transpileModule(await readFile(new URL('./cancelSavedPayment.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
    const cancelModule=new vm.SourceTextModule(cancelSource,{context});
    await cancelModule.link(async name=>{
      assert.equal(name,'./database');
      return new vm.SyntheticModule(['getOperation','requestPaymentCancellation'],function(){
        this.setExport('getOperation',db.getOperation);this.setExport('requestPaymentCancellation',db.requestPaymentCancellation);
      },{context});
    });
    await cancelModule.evaluate();
    for(const outcome of ['failed-send','receipt','review']){
      const entry={...operation(`wait-${outcome}`),payload:multi.payload};await db.insertOperation(entry);
      const recoveryLease=outcome==='review'?await db.claimRecoveryOperation(entry):null;
      const deliveryLease=!recoveryLease?await db.claimOperation(entry):null;if(!recoveryLease)assert.ok(deliveryLease);
      releaseClaim=async()=>{
        if(outcome==='review')assert.equal(await db.completeRecoveryOperation(entry,recoveryLease,'review-after-wait'),true);
        else assert.equal(await db.completeClaimedOperation(entry.operationId,'a:ADMIN',deliveryLease,outcome==='receipt'?'SUCCEEDED':'RETRYABLE_FAILURE',outcome==='receipt'?{serverReceiptId:'receipt-after-wait'}:{}),true);
      };
      const result=await cancelModule.namespace.cancelSavedPayment('a:ADMIN',entry.operationId,'Mistaken entry; no money collected','actor',()=>true);
      assert.equal(JSON.stringify(result.payload),JSON.stringify(multi.payload));
      if(outcome==='failed-send'){
        assert.equal(result.status,'QUEUED');assert.equal(result.serverReceipt.cancellationRequest.noMoneyCollected,true);
        assert.equal(await db.claimRecoveryOperation(entry),null);
      }else{
        assert.equal(result.serverReceipt?.cancellationRequest,undefined);
        assert.equal(outcome==='receipt'?result.serverReceiptId:result.serverReviewId,`${outcome}-after-wait`);
      }
    }
    await t.test('expired delivery outcomes cannot overwrite newer receipts, cancellations, recovery or relogin',async()=>{
      let response,started,published=0;
      const deps={
        axios:{default:{isAxiosError:e=>!!e?.isAxiosError}},'expo-crypto':dependencies['expo-crypto'],
        '@react-native-community/netinfo':{default:{}},'../services/api':{recordPayment(){}},
        '../store/authStore':{useAuthStore:{}},'./accountScope':{requireOrganizationScope(){}},'./database':db,
        '../store/syncStore':{useSyncStore:{}},
        './accountClient':{accountForScope:()=>({sessionValid:true,userId:'actor',tenantId:'tenant'}),requestAsAccount:async()=>{started();return response;}},
        './access':{refreshOfflineAccess(){},offlineAccessForScope(){},useOfflineAccessStore:{}},
        './accessPolicy':{canRecordOffline(){},requireOfflineRecording(){}},
        './financialRefresh':{refreshPostedCollection:async()=>{published++;}},
        '../../shared/offline/legacyStaffEvidence':{legacyStaffEvidence(){throw new Error('Unexpected unsigned request');}},
      };
      const workers=[];
      for(const[name,method,action]of [['paymentQueue.ts','processPaymentOperation','RECORD_PAYMENT'],['staffQueue.ts','processStaffOperation','PARTIAL_COLLECT']]){
        const source=ts.transpileModule(await readFile(new URL(`./${name}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
        const worker=new vm.SourceTextModule(source,{context});
        await worker.link(async name=>{const values=deps[name];assert.ok(values,name);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
        await worker.evaluate();workers.push([action,worker.namespace[method]]);
      }
      let sequence=0;
      for(const[action,worker]of workers){
        for(const newer of ['receipt','cancellation','recovery','relogin','renewed'])for(const late of ['success','network',401,403,409,422,429,500]){
          const scope=`leases:${action}`,id=`late-${sequence++}`;
          const entry={...operation(id,scope),action,entityType:action==='RECORD_PAYMENT'?'PAYMENT':'CASH_REQUEST',payload:{amount:1500,requestId:'request',collectedAmount:1500,offlineAuthorization:'proof',allocations:multi.payload.allocations}};
          await db.insertOperation(entry);
          let resolve,reject;response=new Promise((yes,no)=>{resolve=yes;reject=no;});
          const sending=new Promise(yes=>{started=yes;});const oldResult=worker(entry);await sending;
          const rawDb=await db.getOfflineDatabase(scope);
          await rawDb.runAsync('UPDATE sync_operations SET updated_at=0 WHERE operation_id=?',id);
          await db.recoverInterruptedOperations(scope);
          if(newer==='relogin'){
            await db.discardUnsentOperationsForSignOut(scope);await db.resumeOfflineSession(scope);
            assert.equal(await db.getOperation(id,scope),null);await db.insertOperation(entry);
          }
          const fresh=await db.getOperation(id,scope);
          if(newer==='recovery'||(newer==='cancellation'&&action!=='RECORD_PAYMENT')){
            const lease=await db.claimRecoveryOperation(fresh);assert.ok(lease);
            assert.equal(await db.completeRecoveryOperation(fresh,lease,'new-review'),true);
            if(newer==='cancellation')await db.updateOperation(id,scope,'SUCCEEDED',{serverReceipt:{offlineReviewResolution:'CANCELLED',reviewId:'new-review'}});
          }else{
            if(newer==='cancellation')await db.requestPaymentCancellation(scope,id,'No money collected; mistaken entry','actor');
            const lease=await db.claimOperation(await db.getOperation(id,scope));assert.ok(lease);
            if(newer!=='renewed')assert.equal(await db.completeClaimedOperation(id,scope,lease,newer==='cancellation'?'CANCELLED':'SUCCEEDED',newer==='cancellation'?{serverReviewId:'new-review',serverReceipt:{offlineReviewResolution:'CANCELLED'}}:{serverReceiptId:'new-receipt',serverReceipt:{id:'new-receipt'}}),true);
          }
          const expected=JSON.stringify(await db.getOperation(id,scope)),beforePublished=published;
          if(late==='success')resolve({data:{data:{id:'old-stale-receipt'}}});
          else reject(Object.assign(new Error('Delayed old outcome'),{isAxiosError:true,...(late==='network'?{}:{response:{status:late,data:{message:'Delayed response',data:{reviewId:'old-stale-review'}}}})}));
          assert.equal((await oldResult).kind,'retryable',`${action}/${newer}/${late}: no stale success`);
          assert.equal(JSON.stringify(await db.getOperation(id,scope)),expected,`${action}/${newer}/${late}: no authoritative row or attempts change`);
          assert.equal(published,beforePublished,'No cached money refresh from stale results');
          if(newer==='renewed'){
            const live=await db.getOperation(id,scope);
            assert.equal(await db.completeClaimedOperation(id,scope,live.deliveryLeaseId,'SUCCEEDED',{serverReceiptId:'current-live-receipt'}),true,'The new sender must retain its claim');
          }
        }
        const entry={...operation(`fresh-${sequence++}`,`leases:${action}`),action,payload:{requestId:'request',offlineAuthorization:'proof',amount:1500}};
        await db.insertOperation(entry);await db.updateOperation(entry.operationId,entry.accountScope,'QUEUED',{attempts:5});
        response=Promise.resolve({data:{data:{id:'current-receipt'}}});started=()=>{};
        assert.equal((await worker(entry)).kind,'succeeded');
        const current=await db.getOperation(entry.operationId,entry.accountScope);assert.equal(current.attempts,6);assert.equal(current.serverReceiptId,'current-receipt');
      }
      assert.equal(published,1,'Only current payment completion refreshes money');
      const guarded=operation('wrong-owner','leases:ADMIN');await db.insertOperation(guarded);
      for(const wrong of [{actorId:'other'},{tenantId:'other'},{payloadHash:'other'},{action:'PARTIAL_COLLECT'}])assert.equal(await db.claimOperation({...guarded,...wrong}),null);
      const lease=await db.claimOperation(guarded);assert.ok(lease);
      await db.updateOperation(guarded.operationId,guarded.accountScope,'SUCCEEDED',{serverReceiptId:'unfenced'});
      assert.equal((await db.getOperation(guarded.operationId,guarded.accountScope)).status,'SYNCING');
      assert.equal(await db.completeClaimedOperation(guarded.operationId,'wrong-scope',lease,'SUCCEEDED'),false);
      assert.equal(await db.completeClaimedOperation(guarded.operationId,guarded.accountScope,'wrong-lease','SUCCEEDED'),false);
      assert.equal(await db.completeClaimedOperation(guarded.operationId,guarded.accountScope,lease,'SUCCEEDED',{serverReceiptId:'verified'}),true);
      const v8Scope='version-eight:ADMIN',v8Entry=operation('v8-saved',v8Scope);
      await db.insertOperation(v8Entry);
      const v8Db=await db.getOfflineDatabase(v8Scope);
      const before=JSON.stringify(await db.getOperation(v8Entry.operationId,v8Scope));
      await v8Db.execAsync('ALTER TABLE sync_operations DROP COLUMN delivery_lease_id; PRAGMA user_version=8;');
      const migrated=await upgraded.getOfflineDatabase(v8Scope);
      assert.equal((await migrated.getFirstAsync('PRAGMA user_version')).user_version,9);
      assert.equal(JSON.stringify(await upgraded.getOperation(v8Entry.operationId,v8Scope)),before,'Version-eight upgrade preserves original saved evidence');
      assert.ok(await upgraded.claimOperation(v8Entry),'An upgraded queue can acquire a new delivery lease');
    });
    await t.test('a current admin reconciles retained signed-out reviews with exact-review CAS',async()=>{
      let response,receipt,accounts=[],requests=0,published=0,changeReview;
      const deps={
        '../../shared/offline/legacyStaffEvidence':{legacyStaffEvidence(){}},
        './financialRefresh':{refreshPostedCollection:async()=>{published++;}},
        '../store/authStore':{useAuthStore:{getState:()=>({accounts})}},
        './accountScope':{getStoredAccountScope:a=>a.scope},
        './accountClient':{accountForScope:scope=>({sessionValid:true,role:'ADMIN',tenantId:scope==='other-admin'?'other-tenant':'tenant'}),requestAsAccount:async(_,request)=>{
          requests++;if(changeReview){const change=changeReview;changeReview=null;await change();}
          return{data:{data:request.url.startsWith('/payments/batches/')?receipt:response}};
        }},'./database':db,
      };
      const code=ts.transpileModule(await readFile(new URL('./paymentReviews.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
      const reviews=new vm.SourceTextModule(code,{context});await reviews.link(async name=>{const values=deps[name];assert.ok(values,name);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await reviews.evaluate();
      let sequence=0;
      for(const[action,statuses]of [['RECORD_PAYMENT',['CANCELLED','REFUNDED','APPLIED','DUPLICATE']],['PARTIAL_COLLECT',['CANCELLED','REFUNDED','RECORDED','LINKED']]])for(const status of statuses){
        const scope=`retained-${sequence++}:${action==='RECORD_PAYMENT'?'ADMIN':'STAFF'}`;
        const entry={...operation(`review-${sequence}`,scope),action,entityId:'original-pickup'};
        await db.insertOperation(entry);await db.updateOperation(entry.operationId,scope,'CONFLICT',{serverReviewId:'confirmed-review'});
        await db.discardUnsentOperationsForSignOut(scope);
        const saved=await db.getOperation(entry.operationId,scope);assert.equal(saved.serverReviewId,'confirmed-review');
        assert.equal(await db.claimOperation(saved),null);
        response={id:'confirmed-review',status,receiptId:'confirmed-receipt',refund:status==='REFUNDED'?{amount:1000}:undefined,result:{outcome:{id:'original-pickup'}}};receipt={id:'confirmed-receipt'};
        const beforeRequests=requests;
        assert.equal(await reviews.namespace.refreshReviewedPayments(scope,true,Infinity,'other-admin'),0);assert.equal(requests,beforeRequests,'Another tenant cannot reconcile this retained review');
        const beforePublished=published;
        assert.equal(await reviews.namespace.refreshReviewedPayments(scope,true,Infinity,'current-admin'),1);
        const completed=await db.getOperation(entry.operationId,scope);assert.equal(completed.status,'SUCCEEDED');assert.equal(completed.serverReceipt.offlineReviewResolution,status);
        assert.equal(published-beforePublished,['APPLIED','DUPLICATE'].includes(status)?1:0);
        assert.equal(await db.completeReviewedOperation(saved,{serverReceipt:{id:'stale-overwrite'}}),false,'A second stale review callback cannot replace the terminal decision');
        assert.equal(await db.getUnsentOperationCount(scope),0);
        if(['CANCELLED','REFUNDED'].includes(status))assert.ok((await db.getVisibleOperations(scope,25,true)).some(r=>r.operationId===entry.operationId));
      }
      // Prove the retained-scope iterator uses the signed-in admin, without
      // reactivating the original staff account's delivery permissions.
      const scope='iterator:STAFF',entry={...operation('iterator-review',scope),action:'PARTIAL_COLLECT'};
      await db.insertOperation(entry);await db.updateOperation(entry.operationId,scope,'CONFLICT',{serverReviewId:'confirmed-review'});await db.discardUnsentOperationsForSignOut(scope);
      accounts=[{scope,tenantId:'tenant'}];response={id:'confirmed-review',status:'CANCELLED'};
      await reviews.namespace.refreshRecoveredReviews('current-admin',Infinity);
      assert.equal((await db.getOperation(entry.operationId,scope)).status,'SUCCEEDED');
      const staleScope='stale-review:ADMIN',stale=operation('stale-review',staleScope);
      await db.insertOperation(stale);await db.updateOperation(stale.operationId,staleScope,'CONFLICT',{serverReviewId:'old-review'});await db.discardUnsentOperationsForSignOut(staleScope);
      const raw=await db.getOfflineDatabase(staleScope);
      changeReview=async()=>{await raw.runAsync('UPDATE sync_operations SET server_review_id=? WHERE operation_id=?','new-review',stale.operationId);};
      response={id:'old-review',status:'APPLIED',receiptId:'old-receipt'};receipt={id:'old-receipt'};
      const beforePublished=published;
      assert.equal(await reviews.namespace.refreshReviewedPayments(staleScope,true,Infinity,'current-admin'),0);
      const unchanged=await db.getOperation(stale.operationId,staleScope);assert.equal(unchanged.status,'CONFLICT');assert.equal(unchanged.serverReviewId,'new-review');assert.equal(unchanged.nextAttemptAt,0);assert.equal(published,beforePublished);
      assert.equal(await db.completeReviewedOperation({...unchanged,actorId:'wrong'},{}),false);
      assert.equal(await db.completeReviewedOperation({...unchanged,tenantId:'wrong'},{}),false);
    });
  } finally { for (const db of connections) db.close(); await rm(directory,{ recursive:true,force:true }); }
});
