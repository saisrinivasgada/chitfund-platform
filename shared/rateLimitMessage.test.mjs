import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimitMessage, retryAfterDelayMs } from './rateLimitMessage.js';

test('numeric Retry-After delays payment sync and gives a clear message', () => {
  const error = { response: { status: 429, headers: { 'retry-after': '90' }, data: {} } };
  assert.equal(retryAfterDelayMs(error), 90_000);
  assert.equal(rateLimitMessage(error), 'Too many requests. Please try again in 2 minutes.');
});

test('offline fetch errors retain the retry window, including HTTP dates', () => {
  const deadline = new Date(Date.now() + 120_000).toUTCString();
  const delay = retryAfterDelayMs({ status: 429, retryAfter: deadline });
  assert.ok(delay > 118_000 && delay <= 120_000);
});

test('unrelated errors and missing retry windows do not invent a delay', () => {
  assert.equal(retryAfterDelayMs({ status: 401, retryAfter: '60' }), null);
  assert.equal(retryAfterDelayMs({ response: { status: 429, headers: {}, data: {} } }), null);
});
