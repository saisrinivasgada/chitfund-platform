import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

/** Simulator-only public app links, without starting a Safari view service. */
export async function openSimulatorLink(device, link, run = execute) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(device ?? '')
      || typeof link !== 'string' || !/^chitwise:\/\/\/\((?:app|auth)\)\//.test(link)) {
    throw new Error('An isolated QA simulator and ChitWise app route are required');
  }
  const { stdout } = await run('xcrun', ['simctl', 'list', 'devices', '--json']);
  const target = Object.values(JSON.parse(stdout).devices).flat().find(item => item.udid === device);
  if (!target?.isAvailable || target.state !== 'Booted' || !target.name.startsWith('ChitWiseOffline')) {
    throw new Error('App links may only open on a booted ChitWiseOffline QA simulator');
  }
  // Maestro 2.11 inspects background SafariViewService on iOS26. A stale service
  // can time out XCTest even while the native app remains running. These flows
  // exercise native routes only; keep unrelated browser services out of them.
  try { await run('xcrun', ['simctl', 'terminate', device, 'com.apple.SafariViewService']); }
  catch (error) {
    if (error.code !== 3 || !/No such process|not running|found nothing to terminate/i.test(error.stderr ?? '')) throw error;
  }
  await run('xcrun', ['simctl', 'openurl', device, link]);
}
