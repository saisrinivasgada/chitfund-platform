import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSyncSummary as summary } from './accountSyncSummary.js';
test('an account with saved money never looks fully synced while waiting, locked or signed out', () => {
  const counts = { pending: 2, conflicts: 1, failed: 0 };
  assert.match(summary({ counts, sessionValid: false }).label, /Sign in.*3 saved/);
  assert.equal(summary({ counts, sessionValid: true }).label, '1 collection needs review');
  assert.equal(summary({ counts, sessionValid: true, syncing: true }).state, 'syncing');
  assert.equal(summary({ counts, locked: true }).label, 'Saved records are locked');
  assert.equal(summary({ counts: { pending: 2 }, sessionValid: true, online: false }).label, '2 saved · offline');
});
test('no pending collections does not imply the offline data download is complete', () => {
  assert.equal(summary().state, 'checking');
  assert.equal(summary({ counts: {}, preparation: { status: 'paused' } }).label, 'Data download paused');
  assert.equal(summary({ counts: {}, preparation: { status: 'ready' } }).state, 'ready');
});
