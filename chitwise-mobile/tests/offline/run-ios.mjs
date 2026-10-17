import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const device = process.env.CHITWISE_QA_DEVICE;
if (!device) throw new Error('Choose the isolated QA simulator using CHITWISE_QA_DEVICE');
const endpoint = new URL(process.env.CHITWISE_QA_URL ?? 'http://127.0.0.1:3112');
if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('Native tests only permit a localhost fixture');
const run = (command, args, allowedCodes = [0]) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', reject); child.on('exit', (code) => allowedCodes.includes(code) ? resolve() : reject(new Error(`${command} failed (${code})`)));
});
const flow = async (name) => {
  await run('xcrun', ['simctl', 'terminate', device, 'com.chitwise.mobile'], [0,3]);
  return run(process.env.MAESTRO_BIN ?? 'maestro', ['--device', device, 'test', '-e', `QA_URL=${endpoint.origin}`, `tests/offline/${name}.yaml`]);
};
const state = async (body) => {
  const response = await fetch(new URL('/__qa/state', endpoint), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  assert.equal(response.ok, true); return (await response.json()).data;
};
try {
  const initial = await state({ online: true, org: 'a', due: 1000 });
  assert.equal(initial.organisations[0].reviews.filter((r) => r.status === 'PENDING').length, 0, 'Use a fixture with no pending reviews');
  await flow('offline-suite');
  const final = await state();
  const org = final.organisations[0];
  assert.equal(org.receipts.length, initial.organisations[0].receipts.length, 'Cancellation must create no receipt');
  assert.equal(org.reviews.filter((r) => r.status === 'CANCELLED').length,
    initial.organisations[0].reviews.filter((r) => r.status === 'CANCELLED').length + 1);
  assert.equal(org.reviews.filter((r) => r.status === 'PENDING').length, 0);
  console.log('PASS: branded tools, hidden empty review block, saved collection after cold reopen, direct review, audited cancellation with no receipt');
} finally { await state({ online: true }); }
