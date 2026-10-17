import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const device=process.env.CHITWISE_QA_DEVICE;
if(!device)throw new Error('Select the isolated QA device');
const endpoint=new URL(process.env.CHITWISE_QA_URL??'http://127.0.0.1:3112');
if(!['localhost','127.0.0.1'].includes(endpoint.hostname))throw new Error('Local QA only');
const state=async(body)=>{const response=await fetch(new URL('/__qa/state',endpoint),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.equal(response.ok,true);return(await response.json()).data;};
try{
  const initial=await state({online:true,org:'a',due:1000,secondDue:500,enabled:true,pausePaymentDelivery:false});
  assert.equal(initial.organisations[0].reviews.filter((r)=>r.status==='PENDING').length,0,'Finish existing QA reviews before this suite');
  await new Promise((resolve,reject)=>{const child=spawn(process.env.MAESTRO_BIN??'maestro',['--device',device,'test','-e',`QA_URL=${endpoint.origin}`,'tests/offline/regression-suite.yaml'],{stdio:'inherit'});child.on('error',reject);child.on('exit',(code)=>code===0?resolve():reject(new Error(`Maestro failed (${code})`)));});
  const final=await state(), a=final.organisations[0], before=initial.organisations[0];
  assert.equal(a.receipts.length,before.receipts.length+1,'Only the final cross-account collection posts');
  assert.equal(final.organisations[1].receipts.length,initial.organisations[1].receipts.length,'A cannot post into B');
  assert.equal(a.due,0);assert.equal(a.secondDue,500);
  const added=a.reviews.filter((r)=>!before.reviews.some((old)=>old.id===r.id));
  assert.equal(added.length,2);assert.ok(added.every((r)=>r.status==='CANCELLED'));
  const multi=added.find((r)=>r.amount===1500);
  assert.deepEqual(multi?.allocations,[{chitId:'40000000-0000-0000-0000-000000000001',amount:1000},{chitId:'50000000-0000-0000-0000-000000000001',amount:500}]);
  console.log('PASS: native offline save/reopen, empty and counted reviews, non-subscriber gate, exact multi-chit cancellation, sign-out discard/relogin, cross-account delivery and cleared offline list');
}finally{await state({online:true,org:'a',enabled:true,pausePaymentDelivery:false});}
