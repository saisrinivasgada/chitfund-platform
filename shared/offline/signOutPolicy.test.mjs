import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnsentCollection, signOutWarning } from './signOutPolicy.js';
test('discard policy includes unresolved device work but never server-held reviews or receipts', () => {
  for (const status of ['QUEUED','SYNCING','RETRYABLE_FAILURE','PAUSED_ACCESS','AUTH_REQUIRED','FAILED','CONFLICT','PERMANENT_FAILURE']) {
    assert.equal(isUnsentCollection({ status }), true, status);
    assert.equal(isUnsentCollection({ status, reviewId: 'server-review' }), false);
    assert.equal(isUnsentCollection({ status, serverReviewId: 'server-review' }), false);
    assert.equal(isUnsentCollection({ status, serverReceiptId: 'receipt' }), false);
  }
  assert.equal(isUnsentCollection({ status: 'SUCCEEDED' }), false);
  assert.equal(isUnsentCollection({ status: 'CANCELLED' }), false);
  assert.match(signOutWarning(2, true), /2 unsynced payments.*permanently deleted.*these accounts.*will not restore/);
});
