import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Recover only a driver that never connected. App assertion failures remain
// failures, and the financial suite is never retried by this preflight.
export function ensureIosDriver({ device, run = spawnSync, record = () => {}, maestro = 'maestro' }) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(device ?? '')) {
    throw new Error('Select the isolated CI simulator');
  }
  const options = { encoding: 'utf8', timeout: 390_000, maxBuffer: 2_000_000 };
  const checked = (command, args) => {
    const result = run(command, args, options);
    record(`${command} ${args.join(' ')}\n${result.stdout ?? ''}\n${result.stderr ?? ''}\n`);
    if (result.error) throw result.error;
    return result;
  };
  const inventory = checked('xcrun', ['simctl', 'list', 'devices', '--json']);
  if (inventory.status !== 0) throw new Error('Could not inspect the CI simulator');
  const target = Object.values(JSON.parse(inventory.stdout).devices).flat().find(d => d.udid === device);
  if (target?.name !== 'ChitWiseOfflineCI' || !target.isAvailable || target.state !== 'Booted') {
    throw new Error('Driver recovery is restricted to the booted ChitWiseOfflineCI simulator');
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = checked(maestro, ['--device', device, 'test', 'tests/offline/driver-ready.yaml']);
    if (result.status === 0) return;
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const startupOnly = output.includes('IOSDriverTimeoutException') && !/Running on|Launch app .*COMPLETED|Assertion is false|Element not found/i.test(output);
    if (attempt === 2 || !startupOnly) throw new Error('iOS driver preflight failed; see the retained diagnostics');
    // Keep the installed app and its data. Restart only this disposable CI
    // simulator, before login or any collection has been recorded.
    for (const args of [
      ['simctl', 'shutdown', device], ['simctl', 'boot', device], ['simctl', 'bootstatus', device, '-b'],
    ]) {
      if (checked('xcrun', args).status !== 0) throw new Error('CI simulator recovery failed');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.CI !== '1' || !process.env.RUNNER_TEMP) throw new Error('CI runner required');
  const log = `${process.env.RUNNER_TEMP}/chitwise-ios-driver-preflight.log`;
  ensureIosDriver({ device: process.env.CHITWISE_QA_DEVICE, maestro: process.env.MAESTRO_BIN ?? 'maestro',
    record: text => appendFileSync(log, text) });
}
