import test from 'node:test';
import assert from 'node:assert/strict';
import { offlinePresentation } from './presentation.js';

test('only subscribed accounts show sync UI, regardless of saved work', () => {
  assert.deepEqual(offlinePresentation({ enabled: false }, true), { showSync: false, notSubscribed: true });
  assert.deepEqual(offlinePresentation({ enabled: true }, false), { showSync: true, notSubscribed: false });
  assert.deepEqual(offlinePresentation(undefined, false), { showSync: false, notSubscribed: true });
  assert.deepEqual(offlinePresentation(undefined, true), { showSync: true, notSubscribed: false });
  assert.deepEqual(offlinePresentation({ enabled: false, reason: 'OFFLINE_NOT_CONFIGURED' }, true), { showSync: true, notSubscribed: false });
  assert.deepEqual(offlinePresentation({ enabled: false, reason: 'ADD_ON_REQUIRED' }, true), { showSync: false, notSubscribed: true });
  assert.deepEqual(offlinePresentation(undefined), { showSync: false, notSubscribed: false });
});

test('a fresh known subscription denial supersedes an older grant without changing original evidence', async () => {
  const { effectiveOfflineAccess } = await import('./accessPolicy.js');
  const access = { enabled: true, checkedAt: 100, grant: { token: 'old-proof' } };
  assert.equal(effectiveOfflineAccess(access, false, 200).enabled, false);
  assert.equal(effectiveOfflineAccess(access, false, 200).grant, null);
  assert.equal(access.grant.token, 'old-proof');
  assert.equal(effectiveOfflineAccess({ ...access, checkedAt: 300 }, false, 200).enabled, true);
});
