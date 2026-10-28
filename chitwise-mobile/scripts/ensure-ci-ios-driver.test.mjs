import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureIosDriver } from './ensure-ci-ios-driver.mjs';

const device = 'b94b5405-0b3d-4fc8-a29f-6ed69ffd8d13';
const ok = { status: 0, stdout: '', stderr: '' };
const timeout = { status: 1, stderr: 'xcuitest.installer.LocalXCTestInstaller$IOSDriverTimeoutException: iOS driver not ready' };
function fixture(results, name = 'ChitWiseOfflineCI', recoveryFails = false) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (args[1] === 'list') return { ...ok, stdout: JSON.stringify({ devices: { ios: [{ udid: device, name, state: 'Booted', isAvailable: true }] } }) };
    if (command === 'maestro') return results.shift();
    return recoveryFails ? { status: 1, stderr: 'boot failed' } : ok;
  };
  return { calls, run };
}
test('a ready driver does not restart the simulator', () => {
  const f = fixture([ok]); ensureIosDriver({ device, run: f.run });
  assert.equal(f.calls.length, 2);
});
test('a startup-only timeout permits one restart before any sign-in', () => {
  const f = fixture([timeout, ok]); ensureIosDriver({ device, run: f.run });
  assert.deepEqual(f.calls.slice(2, 5).map(c => c[2]), ['shutdown', 'boot', 'bootstatus']);
  assert.equal(f.calls.filter(c => c[0] === 'maestro').length, 2);
  assert.ok(f.calls.filter(c => c[0] === 'maestro').every(c => c.at(-1) === 'tests/offline/driver-ready.yaml'));
});
test('repeated startup failure stays failed after two attempts', () => {
  const f = fixture([timeout, timeout]);
  assert.throws(() => ensureIosDriver({ device, run: f.run }), /preflight failed/);
  assert.equal(f.calls.filter(c => c[0] === 'maestro').length, 2);
});
test('app assertions and errors after connection are never retried', () => {
  for (const stderr of ['Assertion is false: Enter your username', 'Element not found', `${timeout.stderr}\nRunning on iPhone`, `${timeout.stderr}\nLaunch app ChitWise COMPLETED`]) {
    const f = fixture([{ status: 1, stderr }]);
    assert.throws(() => ensureIosDriver({ device, run: f.run }), /preflight failed/);
    assert.equal(f.calls.length, 2);
  }
});
test('foreign devices and failed simulator recovery stop immediately', () => {
  const foreign = fixture([ok], 'Personal iPhone');
  assert.throws(() => ensureIosDriver({ device, run: foreign.run }), /restricted/);
  assert.equal(foreign.calls.length, 1);
  const f = fixture([timeout], 'ChitWiseOfflineCI', true);
  assert.throws(() => ensureIosDriver({ device, run: f.run }), /recovery failed/);
  assert.equal(f.calls.length, 3);
});
