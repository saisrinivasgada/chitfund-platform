import test from 'node:test';
import assert from 'node:assert/strict';
import { linkQaPath, linkQaTraceEndpoint } from './linkQaTrace.ts';

test('link diagnostics require both explicit opt-in and the isolated fixture URL', () => {
  for (const flag of [undefined, '', '0', 'true']) assert.equal(linkQaTraceEndpoint(flag, 'http://127.0.0.1:3112/api'), null);
  for (const url of ['https://api.thechitwise.com/api', 'http://example.test:3112/api',
    'http://127.0.0.1.evil.test:3112/api', 'http://user:pass@127.0.0.1:3112/api',
    'http://127.0.0.1:3112/api?token=secret', 'http://127.0.0.1:999999/api']) {
    assert.equal(linkQaTraceEndpoint('1', url), null);
  }
  assert.equal(linkQaTraceEndpoint('1', 'http://127.0.0.1:3112/api'), 'http://127.0.0.1:3112/__qa/link-trace');
});

test('link evidence omits every query, fragment, authority and credential', () => {
  assert.equal(linkQaPath('chitwise:///(auth)/setup-account?token=secret&username=name#private'), '/(auth)/setup-account');
  assert.equal(linkQaPath('chitwise://user:pass@host/(app)/(admin)/payments?token=secret'), '/(app)/(admin)/payments');
  assert.equal(linkQaPath('https://user:pass@example.test/?token=secret'), '<other-scheme>');
  assert.equal(linkQaPath(null), null);
  assert.equal(linkQaPath('malformed-secret'), '<invalid-url>');
});
