import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSavedAccounts } from './savedAccounts.ts';

test('only an absent or explicitly empty saved-account index means no accounts', () => {
  assert.deepEqual(decodeSavedAccounts(null), []);
  assert.deepEqual(decodeSavedAccounts('[]'), []);
  for (const raw of ['', '{', 'null', '{}', '[null]', '[{"userId":"a"}]']) {
    assert.throws(() => decodeSavedAccounts(raw), /saved payments have not been deleted/i);
  }
});

test('valid legacy accounts and retained queue scopes survive decoding unchanged', () => {
  const original = [{ userId: 'a', role: 'STAFF', tenantId: 'org-a', sessionValid: false,
    retainedOfflineScopes: ['ORGANIZATION:a:org-a:ADMIN'], savedAt: 123 }];
  assert.deepEqual(decodeSavedAccounts(JSON.stringify(original)), original);
});
