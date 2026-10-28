import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const device = process.env.CHITWISE_QA_DEVICE;
if (!device) throw new Error('Choose the isolated QA simulator');
const endpoint = new URL(process.env.CHITWISE_QA_URL ?? 'http://127.0.0.1:3112');
if (!['localhost','127.0.0.1'].includes(endpoint.hostname)) throw new Error('Local QA only');
const run = (command,args,allowed=[0]) => new Promise((resolve,reject) => {
  const child=spawn(command,args,{ stdio:'inherit' }); child.on('error',reject);
  child.on('exit',(code)=>allowed.includes(code)?resolve():reject(new Error(`${command} failed (${code})`)));
});
const flow = async (name) => {
  await run('xcrun',['simctl','terminate',device,'com.chitwise.mobile'],[0,3]);
  await run(process.env.MAESTRO_BIN ?? 'maestro',['--device',device,'test','-e',`QA_URL=${endpoint.origin}`,`tests/offline/${name}.yaml`]);
};
const state=async(body)=>{
  const response=await fetch(new URL('/__qa/state',endpoint),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  assert.equal(response.ok,true);return(await response.json()).data;
};
try {
  const initial=await state({online:true,org:'a',due:1000});
  await flow('signout-suite');
  const final=await state();
  assert.equal(final.organisations[0].receipts.length,initial.organisations[0].receipts.length,'Discard must not post or reverse money');
  assert.equal(final.organisations[0].reviews.length,initial.organisations[0].reviews.length,'Discard must not create or cancel a server review');
  console.log('PASS: tools hidden on add-account/login; Cancel preserves saved money; explicit sign-out discards it; same-device sign-in does not resurrect it');
} finally {await state({online:true});}
