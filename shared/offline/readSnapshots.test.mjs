import test from 'node:test';
import assert from 'node:assert/strict';
import { batchSnapshot, cacheableRead, listSnapshot, requestKey, shouldRetryRead, mayKeepReadSnapshot } from './readSnapshots.js';

test('complete downloaded members serve pages that were never opened', () => {
  const members = Array.from({ length: 501 }, (_, i) => ({ id: String(i), fullName: `Member ${i}`, status: 'ACTIVE' }));
  const page = listSnapshot('members', members, { page: 25, size: 20 });
  assert.equal(page.data.content[0].id, '500');
  assert.equal(page.data.totalElements, 501);
  assert.equal(page.data.totalPages, 26);
  assert.equal(page.data.last, true);
  assert.equal(listSnapshot('members', members, {}).data.content.length, 501);
});

test('complete payment downloads serve unopened pages with the payment-service contract', () => {
  const records = Array.from({ length: 451 }, (_, index) => ({ id: String(index), memberId: 'm', chitId: 'c', createdAt: '2026-10-16T10:00:00' }));
  const page = batchSnapshot(records, { page: 22, size: 20 }).data;
  assert.equal(page.content[0].id, '440'); assert.equal(page.content.length, 11);
  assert.equal(page.hasMore, false); assert.equal(page.totalElements, 451);
  assert.equal(batchSnapshot(records, {}).data.length, 451);
});

test('offline payment date filters use creation dates and never confuse them with recording time', () => {
  const records = [{ id: 'a', memberId: 'm', chitId: 'c', createdAt: '2026-10-16T10:00:00', recordedAt: '2026-10-01T10:00:00' },
    { id: 'b', memberId: 'n', chitId: 'c', createdAt: '2026-10-16T11:00:00' }];
  assert.deepEqual(batchSnapshot(records, { memberId: 'm', fromDate: '2026-10-16', toDate: '2026-10-16' }).data.map((row) => row.id), ['a']);
  assert.equal(batchSnapshot(records, { status: 'COMPLETED' }), null);
  assert.equal(batchSnapshot(records, { page: -1 }), null);
});

test('offline filtering uses the complete collection and unsupported filters do not invent results', () => {
  const members = [{ id: 'a', fullName: 'Alice', phone: '111', status: 'ACTIVE' },
    { id: 'b', fullName: 'Bob', phone: '222', status: 'INACTIVE' }];
  assert.deepEqual(listSnapshot('members', members, { search: 'ALICE', status: 'ACTIVE' }).data.content.map((x) => x.id), ['a']);
  assert.equal(listSnapshot('members', members, { includeDeleted: true }), null);
  assert.equal(listSnapshot('members', members, { page: -1 }), null);
});

test('request identity is stable across parameter order and equivalent query representations', () => {
  assert.equal(requestKey('/members?page=0', { size: 20, search: undefined }), requestKey('/members', { size: '20', page: 0 }));
  assert.notEqual(requestKey('/members', { page: 0 }), requestKey('/members', { page: 1 }));
});

test('offline persistence permits business reads and excludes credentials, identity and writes', () => {
  assert.equal(cacheableRead('/payments/history'), true);
  assert.equal(cacheableRead('/members'), true);
  assert.equal(cacheableRead('/auth/refresh'), false);
  assert.equal(cacheableRead('/payments/internal/verify'), false);
  assert.equal(cacheableRead('/members/a/app-access'), false);
  assert.equal(cacheableRead('/payments', 'POST'), false);
});

test('network failure retains saved data; explicit deletion/access denial does not', () => {
  assert.equal(mayKeepReadSnapshot(new Error('Network down')), true);
  assert.equal(mayKeepReadSnapshot({ response: { status: 503 } }), true);
  for (const status of [401, 403, 404, 410]) {
    assert.equal(mayKeepReadSnapshot({ response: { status } }), false);
    assert.equal(shouldRetryRead(0, { response: { status } }), false);
  }
  assert.equal(shouldRetryRead(0, { offlineMissing: true }), false);
  assert.equal(shouldRetryRead(0, new Error('Network down')), true);
  assert.equal(shouldRetryRead(2, new Error('Network down')), false);
});
