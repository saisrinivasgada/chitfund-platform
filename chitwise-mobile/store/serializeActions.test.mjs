import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeActions } from './serializeActions.ts';

test('concurrent account writes preserve both updates in invocation order', async () => {
  let stored = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const actions = serializeActions({
    async update(value) {
      const before = [...stored];
      if (value === 'org-a') await blocked;
      stored = [...before, value];
    },
  });
  const first = actions.update('org-a');
  const second = actions.update('org-b');
  await Promise.resolve();
  assert.deepEqual(stored, []);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(stored, ['org-a', 'org-b']);
});

test('a failed storage operation does not block later logout or recovery', async () => {
  let loggedOut = false;
  const actions = serializeActions({
    async update() { throw new Error('Storage unavailable'); },
    async logout() { loggedOut = true; },
  });
  const failed = actions.update();
  const logout = actions.logout();
  await assert.rejects(failed, /Storage unavailable/);
  await logout;
  assert.equal(loggedOut, true);
});
