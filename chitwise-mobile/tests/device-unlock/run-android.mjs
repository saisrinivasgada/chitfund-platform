import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const device = process.env.CHITWISE_QA_DEVICE;
if (!/^emulator-\d+$/.test(device ?? '')) throw new Error('Device unlock QA requires a disposable Android emulator');
const endpoint = new URL(process.env.CHITWISE_QA_URL ?? 'http://127.0.0.1:3112');
if (!['localhost', '127.0.0.1'].includes(endpoint.hostname)) throw new Error('Local fixture only');
const state = async () => {
  const response = await fetch(new URL('/__qa/state', endpoint)); assert.equal(response.ok, true);
  return (await response.json()).data;
};
const evidence = { flow: 'android-pin.yaml', result: 'RUNNING', initial: await state() };
try {
  await new Promise((resolve, reject) => {
    const child = spawn(process.env.MAESTRO_BIN ?? 'maestro', ['--device', device, 'test', '-e', `QA_URL=${endpoint.origin}`, 'tests/device-unlock/android-pin.yaml'], { stdio: 'inherit' });
    child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Device unlock journey failed (${code})`)));
  });
  evidence.final = await state();
  for (const before of evidence.initial.organisations) {
    const after = evidence.final.organisations.find((org) => org.name === before.name); assert.ok(after);
    for (const key of ['due', 'secondDue', 'credit', 'receipts', 'reviews', 'staffReviews']) {
      assert.deepEqual(after[key], before[key], `Device unlock must not change ${before.name} ${key}`);
    }
  }
  evidence.result = 'PASSED';
  console.log('PASS: real Android PIN enable, cold-open cancellation/retry, account switch cancellation/isolation, offline background unlock and protected disable; financial records unchanged');
} catch (error) { evidence.result = 'FAILED'; evidence.error = error.message; throw error; }
finally {
  evidence.final ??= await state();
  if (process.env.CHITWISE_UNLOCK_REPORT) writeFileSync(process.env.CHITWISE_UNLOCK_REPORT, JSON.stringify(evidence, null, 2));
  await fetch(new URL('/__qa/state', endpoint), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ online: true }) });
}
