import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const device=process.env.CHITWISE_QA_DEVICE;
if(!device)throw new Error('Select the isolated QA simulator');
const endpoint=new URL(process.env.CHITWISE_QA_URL??'http://127.0.0.1:3112');
if(!['localhost','127.0.0.1'].includes(endpoint.hostname))throw new Error('Local QA only');
const state=async(body)=>{const response=await fetch(new URL('/__qa/state',endpoint),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.equal(response.ok,true);return(await response.json()).data;};
try{
  const initial=await state({online:true,org:'a',due:1000,secondDue:500,enabled:true});
  await new Promise((resolve,reject)=>{const child=spawn(process.env.MAESTRO_BIN??'maestro',['--device',device,'test','-e',`QA_URL=${endpoint.origin}`,'tests/offline/multi-chit-cancellation-suite.yaml'],{stdio:'inherit'});child.on('error',reject);child.on('exit',(code)=>code===0?resolve():reject(new Error(`Maestro failed (${code})`)));});
  const final=(await state()).organisations[0];
  assert.equal(final.receipts.length,initial.organisations[0].receipts.length);
  assert.equal(final.due,1000);assert.equal(final.secondDue,500);
  assert.equal(final.reviews.length,initial.organisations[0].reviews.length+1);
  const decision=final.reviews.find((r)=>!initial.organisations[0].reviews.some((old)=>old.id===r.id)&&r.amount===1500&&r.resolutionReason==='Mistaken multi-chit entry: no money was collected');
  assert.equal(decision?.status,'CANCELLED');
  assert.deepEqual(decision.allocations,[{chitId:'40000000-0000-0000-0000-000000000001',amount:1000},{chitId:'50000000-0000-0000-0000-000000000001',amount:500}]);
  console.log('PASS: two selected chits retain exact allocations through offline save/cancellation; no receipt or dues change; offline list clears; original decision remains in History');
}finally{await state({online:true});}
