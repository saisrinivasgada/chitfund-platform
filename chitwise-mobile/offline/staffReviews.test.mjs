import { legacyStaffEvidence } from '../../shared/offline/legacyStaffEvidence.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(await readFile(new URL('./paymentReviews.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
async function recovery({status='PENDING',otherTenant=false,networkFails=false}={}){
  const operation={operationId:'saved',action:'PARTIAL_COLLECT',accountScope:'staff-scope',tenantId:'org-a',entityId:'original-request',serverReviewId:'review-id',payload:{offlineAuthorization:'immutable-proof'}};
  const requests=[],updates=[];let ledgerRefreshes=0,deferred=0;
  const deps={
    '../../shared/offline/legacyStaffEvidence':{legacyStaffEvidence},
    './financialRefresh':{refreshPostedCollection:async()=>{ledgerRefreshes++;}},
    '../store/authStore':{useAuthStore:{getState:()=>({accounts:[]})}},
    './accountScope':{getStoredAccountScope:a=>a.scope},
    './accountClient':{accountForScope:()=>({role:'ADMIN',tenantId:otherTenant?'org-b':'org-a'}),requestAsAccount:async(scope,request)=>{
      requests.push({scope,request});if(networkFails)throw new Error('Connection lost');return{data:{data:{id:'review-id',status,result:{outcome:{id:'original-request'}},resolutionReason:'Verified outcome'}}};}},
    './database':{getOperationsAwaitingReview:async()=>[operation],deferReviewPoll:async()=>{deferred++;},updateOperation:async(...args)=>updates.push(args),
      getRecoverablePayments:async()=>[],getRecoverableStaffCollections:async()=>[],hasOfflineDatabase:async()=>false},
  };
  const context=vm.createContext({});const m=new vm.SourceTextModule(source,{context});
  await m.link(async name=>{const values=deps[name];if(!values)throw new Error(name);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
  await m.evaluate();const count=await m.namespace.refreshReviewedPayments('staff-scope',true,Infinity,'admin-scope');
  return{count,requests,updates,ledgerRefreshes,deferred};
}
test('a pending staff review stays held and is polled through the current same-tenant admin',async()=>{
  const r=await recovery();assert.equal(r.count,0);assert.equal(r.updates.length,0);assert.equal(r.requests[0].scope,'admin-scope');
  assert.equal(r.requests[0].request.url,'/payments/offline/staff-actions/reviews/review-id');assert.equal(r.deferred,1);
});
test('all completed staff decisions clear the original queue without posting a member payment',async()=>{
  for(const status of ['RECORDED','LINKED','CANCELLED','REFUNDED']){
    const r=await recovery({status});assert.equal(r.count,1);assert.equal(r.updates[0][0],'saved');assert.equal(r.updates[0][1],'staff-scope');
    assert.equal(r.updates[0][2],'SUCCEEDED');assert.equal(r.updates[0][3].serverReceipt.offlineReviewResolution,status);
    assert.equal(r.ledgerRefreshes,0);assert.equal(r.requests.length,1);
    assert.equal(r.updates[0][3].serverReceiptId,['RECORDED','LINKED'].includes(status)?'original-request':undefined);
  }
});
test('an admin from another tenant cannot read or acknowledge retained staff work',async()=>{
  const r=await recovery({status:'RECORDED',otherTenant:true});assert.equal(r.count,0);assert.equal(r.requests.length,0);assert.equal(r.updates.length,0);assert.equal(r.deferred,1);
});
test('a lost review response preserves the device record for later polling',async()=>{
  const r=await recovery({status:'CANCELLED',networkFails:true});assert.equal(r.count,0);assert.equal(r.updates.length,0);assert.equal(r.deferred,1);
});

for(const oldRole of ['STAFF','ADMIN']) test(`current admin quarantines unchanged unsigned ${oldRole} collections retained after a role change, excluding other tenants`,async()=>{
 const payload={requestId:'original-request',collectedAmount:100};const {createHash}=await import('node:crypto');
 const originalScope=`old-scope:${oldRole}`;
 const operation={operationId:'PARTIAL_COLLECT-original-request',action:oldRole==='STAFF'?'PARTIAL_COLLECT':'RECORD_PAYMENT',accountScope:originalScope,actorId:'original-staff',tenantId:'org-a',createdAt:Date.parse('2026-01-01T12:00:00Z'),payload,payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
 const requests=[],updates=[],opened=[];
 const deps={
  '../../shared/offline/legacyStaffEvidence':{legacyStaffEvidence},
  './financialRefresh':{refreshPostedCollection:async()=>assert.fail('Quarantine cannot credit a member')},
  '../store/authStore':{useAuthStore:{getState:()=>({accounts:[{scope:'admin-scope:ADMIN',tenantId:'org-a',retainedOfflineScopes:[originalScope]},{scope:'other-scope:STAFF',tenantId:'org-b'}]})}},
  './accountScope':{getStoredAccountScope:a=>a.scope},
  './accountClient':{accountForScope:()=>({sessionValid:true,role:'ADMIN',tenantId:'org-a'}),requestAsAccount:async(scope,request)=>{requests.push({scope,request});return{data:{data:{reviewId:'preserved-review'}}};}},
  './database':{hasOfflineDatabase:async scope=>{opened.push(scope);return true;},getRecoverablePayments:async scope=>oldRole==='ADMIN'&&scope===originalScope?[operation]:[],getRecoverableStaffCollections:async scope=>oldRole==='STAFF'&&scope===originalScope?[operation]:[],getOperationsAwaitingReview:async()=>[],deferReviewPoll(){},updateOperation:async(...args)=>updates.push(args)},
 };
 const context=vm.createContext({});const m=new vm.SourceTextModule(source,{context});await m.link(async name=>{const values=deps[name];if(!values)throw new Error(name);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
 assert.equal(await m.namespace.recoverSavedCollections('admin-scope:ADMIN'),1);assert.equal(requests.length,1);assert.ok(!opened.includes('other-scope:STAFF'));
 assert.equal(requests[0].scope,'admin-scope:ADMIN');assert.equal(requests[0].request.url,oldRole==='STAFF'?'/payments/offline/staff-actions/reviews/recover-legacy':'/payments/offline/reviews/recover-legacy');assert.equal(requests[0].request.data.originalActorId,'original-staff');if(oldRole==='STAFF'){assert.equal(requests[0].request.data.originalRole,'STAFF');assert.equal(requests[0].request.data.original.originalPayloadJson,JSON.stringify(payload));assert.equal(requests[0].request.data.original.originalPayloadHash,operation.payloadHash);}else{assert.equal(JSON.stringify(requests[0].request.data.original),JSON.stringify(payload));assert.equal(requests[0].request.headers['X-Idempotency-Key'],operation.operationId);}assert.equal(updates[0][1],originalScope);assert.equal(updates[0][2],'CONFLICT');assert.equal(updates[0][3].serverReviewId,'preserved-review');
});
