import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const source=ts.transpileModule(await readFile(new URL('./staffQueue.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const expected='2026-01-01T10:00:00';
async function phone({saved=true,storageFails=false,enabled=false,reachable=true}={}) {
  let row=saved?{operationId:`PARTIAL_COLLECT-request-${expected}`,accountScope:'scope',actorId:'staff',tenantId:'org',action:'PARTIAL_COLLECT',status:'RETRYABLE_FAILURE',attempts:1,payload:{requestId:'request',collectedAmount:100,expectedUpdatedAt:expected,recordedAt:'2026-01-01T12:00:00Z',offlineAuthorization:'original-proof'}}:null;
  let loseAck=true;const requests=[];let refreshes=0;
  const access={serverTime:Date.now(),checkedAt:Date.now()};const store=(value)=>({getState:()=>value});
  const deps={
    axios:{default:{isAxiosError:(e)=>!!e?.isAxiosError}},
    'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_,s)=>createHash('sha256').update(s).digest('hex')},
    '@react-native-community/netinfo':{default:{fetch:async()=>({isConnected:reachable,isInternetReachable:reachable})}},
    '../store/authStore':{useAuthStore:store({user:{id:'staff',role:'STAFF'}})},
    './accountScope':{requireOrganizationScope:()=>({scope:'scope',actorId:'staff',tenantId:'org'})},
    './database':{offlineRecordingEpoch:async()=>'',hasOfflineDatabase:async()=>true,getOperation:async()=>row,
      insertOperation:async(op)=>{if(storageFails)throw new Error('Storage full');row=op;},
      claimOperation:async()=>true,updateOperation:async(_,scope,status,values)=>{assert.equal(scope,'scope');row={...row,...values,status};},
      getSyncCounts:async()=>({pending:row?.status==='SUCCEEDED'?0:1,conflicts:0,failed:0,paused:0}),setLastSyncedAt:async()=>{}},
    '../store/syncStore':{useSyncStore:store({setStateForScope(){}})},
    './accountClient':{accountForScope:()=>({sessionValid:true,userId:'staff',tenantId:'org'}),requestAsAccount:async(scope,request)=>{
      assert.equal(scope,'scope');requests.push(structuredClone(request));
      if(loseAck){loseAck=false;throw Object.assign(new Error('Lost acknowledgement'),{isAxiosError:true});}
      return{data:{data:{id:'original-pickup',status:'PARTIALLY_COLLECTED'}}};
    }},
    './access':{offlineAccessForScope:()=>access,useOfflineAccessStore:store({accounts:{scope:access}}),refreshOfflineAccess:async()=>{refreshes++;return access;}},
    './accessPolicy':{canRecordOffline:()=>enabled,requireOfflineRecording:()=>({token:'new-proof'})},
  };
  const context=vm.createContext({});const module=new vm.SourceTextModule(source,{context});
  await module.link(async(name)=>{const values=deps[name];if(!values)throw new Error(name);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
  await module.evaluate();return{queue:()=>module.namespace.partialCollectOfflineCapable('request',100,expected),changed:()=>module.namespace.partialCollectOfflineCapable('request',99,expected),full:amount=>module.namespace.markPickupOfflineCapable('request',expected,{memberId:'member',chitId:'chit',requestedAmount:amount}),requests,row:()=>row,refreshes:()=>refreshes};
}
test('staff lost acknowledgement preserves original proof and time after expiry and returns the confirmed pickup on later taps',async()=>{
  const device=await phone();assert.equal((await device.queue()).offlineQueued,true);
  assert.equal((await device.queue()).result.id,'original-pickup');assert.equal((await device.queue()).result.id,'original-pickup');
  assert.equal(device.requests.length,2);assert.deepEqual(device.requests[0],device.requests[1]);
  assert.equal(device.requests[0].data.offlineAuthorization,'original-proof');assert.equal(device.requests[0].data.recordedAt,'2026-01-01T12:00:00Z');
  assert.equal(device.refreshes(),0);await assert.rejects(device.changed(),/different saved collection amount/);
});
test('staff signed collections are never sent when durable local storage fails',async()=>{
  const device=await phone({saved:false,storageFails:true,enabled:true});await assert.rejects(device.queue(),/Storage full/);assert.equal(device.requests.length,0);assert.equal(device.row(),null);
});

test('changed staff pickups keep the server review identity and never become a successful receipt', async () => {
  // Exercise the real queue error handler with an isolated signed command.
  let operation = { operationId: 'held', accountScope: 'scope', actorId: 'staff', tenantId: 'org', action: 'MARK_PICKUP',
    status: 'QUEUED', attempts: 0, payload: { requestId: 'request', offlineAuthorization: 'original-proof' } };
  const context=vm.createContext({});const module=new vm.SourceTextModule(source,{context});
  const deps={
    axios:{default:{isAxiosError:e=>!!e?.isAxiosError}},'expo-crypto':{},'@react-native-community/netinfo':{default:{}},
    '../store/authStore':{useAuthStore:{}},'./accountScope':{requireOrganizationScope(){}},
    './database':{claimOperation:async()=>true,getOperation(){},getSyncCounts(){},hasOfflineDatabase(){},insertOperation(){},setLastSyncedAt(){},offlineRecordingEpoch(){},
      updateOperation:async(_,scope,status,values)=>{assert.equal(scope,'scope');operation={...operation,status,...values};}},
    '../store/syncStore':{useSyncStore:{}},
    './accountClient':{accountForScope:()=>({sessionValid:true,userId:'staff',tenantId:'org'}),requestAsAccount:async()=>{
      throw Object.assign(new Error('Pickup changed'),{isAxiosError:true,response:{status:409,data:{message:'Pickup held for review',data:{reviewId:'server-review'}}}});
    }},'./access':{refreshOfflineAccess(){},offlineAccessForScope(){}},'./accessPolicy':{canRecordOffline(){},requireOfflineRecording(){}},
  };
  await module.link(async name=>{const values=deps[name];if(!values)throw new Error(name);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
  await module.evaluate();assert.equal((await module.namespace.processStaffOperation(operation)).kind,'conflict');
  assert.equal(operation.status,'CONFLICT');assert.equal(operation.serverReviewId,'server-review');assert.equal(operation.payload.offlineAuthorization,'original-proof');
  assert.equal(operation.serverReceiptId,undefined);
});

test('an unknown full pickup amount cannot become a zero-rupee offline collection',async()=>{
  for(const amount of [undefined,null,0,NaN]) {
    const device=await phone({saved:false,enabled:true,reachable:false});
    await assert.rejects(device.full(amount),/actual collected amount/);assert.equal(device.row(),null);assert.equal(device.requests.length,0);
  }
  const known=await phone({saved:false,enabled:true,reachable:false});assert.equal((await known.full(100)).offlineQueued,true);
  assert.equal(known.row().payload.collectionSnapshot.requestedAmount,100);assert.equal(known.requests.length,0);
});
