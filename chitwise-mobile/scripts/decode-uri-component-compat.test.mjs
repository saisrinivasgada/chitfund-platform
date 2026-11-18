import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const decode = require('decode-uri-component');
const queryString = require('query-string');

test('patched decoder remains compatible with Expo Router query strings', () => {
  assert.equal(decode('hello+world'), 'hello world');
  assert.equal(decode('%FE%FF'), '\uFFFD\uFFFD');
  assert.equal(decode('%25E2%2582%25AC'), '%E2%82%AC');
  assert.deepEqual({ ...queryString.parse('name=hello+world&value=%C3%A5') }, {
    name: 'hello world',
    value: 'å',
  });
});

test('long malformed query strings decode without repeated expansion', () => {
  const malformed = '%'.repeat(100_000);
  const start = performance.now();
  assert.equal(decode(malformed), malformed);
  assert.ok(performance.now() - start < 2_000);
});
