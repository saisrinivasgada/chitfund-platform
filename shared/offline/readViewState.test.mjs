import test from 'node:test';
import assert from 'node:assert/strict';
import { readViewState, createReadViewObserver } from './readViewState.js';

test('an interrupted first download is unavailable, while a confirmed empty list is real data', () => {
  assert.equal(readViewState([{ status: 'error', error: { offlineMissing: true } }]), 'unavailable');
  assert.equal(readViewState([{ status: 'pending', fetchStatus: 'paused' }]), 'unavailable');
  assert.equal(readViewState([{ status: 'success', data: [] }]), 'ready');
  assert.equal(readViewState([{ status: 'success', data: { content: [], totalElements: 0 } }]), 'ready');
});

test('first reads load without presenting empty results; disabled reads do not block another tab', () => {
  assert.equal(readViewState([{ status: 'pending', fetchStatus: 'fetching' }]), 'loading');
  assert.equal(readViewState([{ status: 'pending', fetchStatus: 'idle' }]), 'ready');
  assert.equal(readViewState([undefined]), 'ready');
});

test('a failed background refresh keeps its saved list, while explicit access or deletion denial hides it', () => {
  assert.equal(readViewState([{ status: 'error', data: [{ id: 'saved' }], error: { response: { status: 503 } } }]), 'ready');
  for (const status of [401, 403, 404, 410]) {
    assert.equal(readViewState([{ status: 'error', data: [{ id: 'saved' }], error: { response: { status } } }]), 'restricted');
  }
});

test('missing related data cannot turn a downloaded draw into a false empty instalment list', () => {
  assert.equal(readViewState([{ status: 'success', data: [{ id: 'draw' }] }, { status: 'error', error: { offlineMissing: true } }]), 'unavailable');
});

test('screen observation and retry remain restricted to its account client and selected reads', async () => {
  const states = new Map([['members-a', { state: { status: 'error' } }], ['chits-a', { state: { status: 'success', data: [] } }]]);
  let listener, notified = 0, unsubscribe = 0, filters;
  const client = { getQueryCache: () => ({ get: (key) => states.get(key), subscribe: (fn) => { listener = fn; return () => unsubscribe++; } }),
    refetchQueries: async (value) => { filters = value; } };
  const observer = createReadViewObserver(client, ['members-a']);
  assert.equal(observer.getSnapshot(), 'unavailable');
  const stop = observer.subscribe(() => notified++);
  listener({ query: { queryHash: 'members-b' } }); assert.equal(notified, 0);
  states.set('members-a', { state: { status: 'success', data: [] } });
  listener({ query: { queryHash: 'members-a' } }); assert.equal(notified, 1);
  assert.equal(observer.getSnapshot(), 'ready');
  await observer.retry(); assert.equal(filters.type, 'active');
  assert.equal(filters.predicate({ queryHash: 'members-a' }), true);
  assert.equal(filters.predicate({ queryHash: 'chits-a' }), false);
  assert.equal(filters.predicate({ queryHash: 'members-b' }), false);
  stop(); assert.equal(unsubscribe, 1);
});
