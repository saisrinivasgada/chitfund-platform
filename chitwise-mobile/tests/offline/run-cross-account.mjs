import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const device=process.env.CHITWISE_QA_DEVICE;
if(!device)throw new Error('Select the isolated QA simulator');
const endpoint=new URL(process.env.CHITWISE_QA_URL??'http://127.0.0.1:3112');
if(!['localhost','127.0.0.1'].includes(endpoint.hostname))throw new Error('Local QA only');
const state=async(body)=>{const response=await fetch(new URL('/__qa/state',endpoint),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert.equal(response.ok,true);return(await response.json()).data;};
try{
  const initial=await state({online:true,org:'a',due:1000,enabled:true});
  await new Promise((resolve,reject)=>{const child=spawn(process.env.MAESTRO_BIN??'maestro',['--device',device,'test','-e',`QA_URL=${endpoint.origin}`,'tests/offline/cross-account-suite.yaml'],{stdio:'inherit'});child.on('error',reject);child.on('exit',(code)=>code===0?resolve():reject(new Error(`Maestro failed (${code})`)));});
  const final=await state();
  assert.equal(final.organisations[0].receipts.length,initial.organisations[0].receipts.length+1);
  assert.equal(final.organisations[1].receipts.length,initial.organisations[1].receipts.length);
  assert.equal(final.organisations[0].due,0);
  assert.equal(final.organisations[0].reviews.length,initial.organisations[0].reviews.length);
  console.log('PASS: organisation A saved offline; organisation B signed in; A synced under its own identity; selected chit dues became zero; the offline list cleared');
}finally{await state({online:true});}
