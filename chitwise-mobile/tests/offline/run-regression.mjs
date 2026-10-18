import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const device=process.env.CHITWISE_QA_DEVICE;
if(!device)throw new Error('Select the isolated QA device');
const endpoint=new URL(process.env.CHITWISE_QA_URL??'http://127.0.0.1:3112');
if(!['localhost','127.0.0.1'].includes(endpoint.hostname))throw new Error('Local QA only');
const state=async(body)=>{const response=await fetch(new URL('/__qa/state',endpoint),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.equal(response.ok,true);return(await response.json()).data;};
const flow=process.env.CHITWISE_QA_SIGN_IN==='1'?'tests/offline/regression-entry.yaml':'tests/offline/regression-suite.yaml';
const evidence={flow,result:'RUNNING'};
try{
  const initial=await state({online:true,org:'a',due:1000,secondDue:500,enabled:true,pausePaymentDelivery:false});
  evidence.initial=initial;
  assert.equal(initial.organisations[0].reviews.filter((r)=>r.status==='PENDING').length,0,'Finish existing QA reviews before this suite');
  assert.equal(initial.organisations[0].staffReviews.filter((r)=>r.status==='PENDING').length,0,'Finish existing QA pickup reviews before this suite');
  await new Promise((resolve,reject)=>{const child=spawn(process.env.MAESTRO_BIN??'maestro',['--device',device,'test','-e',`QA_URL=${endpoint.origin}`,flow],{stdio:'inherit'});child.on('error',reject);child.on('exit',(code)=>code===0?resolve():reject(new Error(`Maestro failed (${code})`)));});
  const final=await state(), a=final.organisations[0], before=initial.organisations[0];
  evidence.final=final;
  assert.equal(a.receipts.length,before.receipts.length+1,'Only the final cross-account collection posts');
  assert.equal(final.organisations[1].receipts.length,initial.organisations[1].receipts.length,'A cannot post into B');
  assert.equal(a.due,0);assert.equal(a.secondDue,500);
  const added=a.reviews.filter((r)=>!before.reviews.some((old)=>old.id===r.id));
  assert.equal(added.length,2);assert.ok(added.every((r)=>r.status==='CANCELLED'));
  const multi=added.find((r)=>r.amount===1500);
  assert.deepEqual(multi?.allocations,[{chitId:'40000000-0000-0000-0000-000000000001',amount:1000},{chitId:'50000000-0000-0000-0000-000000000001',amount:500}]);
  const pickups=a.staffReviews.filter((r)=>!before.staffReviews.some((old)=>old.id===r.id));
  assert.equal(pickups.length,3);assert.equal(pickups.filter(r=>r.status==='CANCELLED').length,2);assert.equal(pickups.filter(r=>r.status==='REFUNDED').length,1);
  const refund=pickups.find(r=>r.status==='REFUNDED');
  assert.equal(refund.result.decision.actualAmount,150);assert.equal(refund.result.decision.reference,'RETURN-QA150');assert.equal(refund.result.decision.confirmed,true);
  const legacy=pickups.find(r=>r.authorizationVerified===false);
  assert.equal(legacy.status,'CANCELLED');assert.equal(legacy.result.decision.legacyDetailsVerified,true);assert.equal(legacy.result.decision.verifiedRecordedAt,undefined);
  assert.equal(final.organisations[1].staffReviews.length,initial.organisations[1].staffReviews.length,'Pickup decisions cannot cross organisations');
  const c=final.organisations.find(o=>o.name==='c'), initialC=initial.organisations.find(o=>o.name==='c');
  assert.ok(c && initialC,'First-download account must be present');
  assert.equal(c.pauseDownloads,false,'The interrupted download must recover');
  for(const key of ['due','secondDue','credit','receipts','reviews','staffReviews']) assert.deepEqual(c[key],initialC[key],`First-download testing cannot change C ${key}`);
  const d=final.organisations.find(o=>o.name==='d'), initialD=initial.organisations.find(o=>o.name==='d');
  assert.ok(d && initialD,'Manager recovery account must be present');
  for(const key of ['due','secondDue','credit','receipts','reviews','staffReviews']) assert.deepEqual(d[key],initialD[key],`Manager error recovery cannot change D ${key}`);
  const managerRequests=d.drawRequests.slice(initialD.drawRequests.length);
  assert.equal(managerRequests.length,1,'Only one manager draw is submitted; reopening and cancellation cannot resubmit it');
  assert.deepEqual(managerRequests[0],{chitId:'40000000-0000-0000-0000-000000000004',monthNumber:2,dueDate:'2026-11-01',installmentAmount:1000,maxCycles:20,members:[{memberId:'30000000-0000-0000-0000-000000000004',amountDue:1000}]});
  evidence.result='PASSED';
  console.log('PASS: native offline save/reopen, empty and counted reviews, non-subscriber gate, exact multi-chit cancellation, sign-out discard/relogin, cross-account delivery, cleared offline list, draw error/rapid-tap/cold-launch recovery, signed pickup decisions, explicit older-record review and first-download interruption/recovery');
}catch(error){evidence.result='FAILED';evidence.error=error.message;throw error;}
finally{
  try{evidence.final??=await state();}
  finally{
    if(process.env.CHITWISE_QA_REPORT)writeFileSync(process.env.CHITWISE_QA_REPORT,JSON.stringify(evidence,null,2));
    await state({online:true,org:'a',enabled:true,pausePaymentDelivery:false});
    await state({org:'c',pauseDownloads:false});
    await state({drawFailure:false});
  }
}
