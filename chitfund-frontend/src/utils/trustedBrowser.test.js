import test from 'node:test';
import assert from 'node:assert/strict';
import {
  browserKeyForUsername, browserKeyForMobile, browserKeyForGoogle,
  getStoredDeviceToken, saveDeviceToken, clearDeviceToken,
  rememberActiveBrowserKey, getActiveDeviceToken, clearActiveDeviceToken,
} from './trustedBrowser.js';

function storage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  return values;
}

test('remembers separate accounts and login methods without replacing their tokens', () => {
  storage();
  const username = browserKeyForUsername(' Ravi.Admin ');
  const mobile = browserKeyForMobile('+91', '98765 43210', 'ADMIN');
  const googleIdToken = `header.${btoa(JSON.stringify({ sub: 'google-123' }))}.signature`;
  const google = browserKeyForGoogle(googleIdToken);
  const first = 'a'.repeat(64);
  const second = 'b'.repeat(64);
  const third = 'c'.repeat(64);
  saveDeviceToken(username, first);
  saveDeviceToken(mobile, second);
  saveDeviceToken(google, third);
  assert.equal(getStoredDeviceToken(browserKeyForUsername('ravi.admin')), first);
  assert.equal(getStoredDeviceToken(mobile), second);
  assert.equal(getStoredDeviceToken(google), third);
  assert.equal(getStoredDeviceToken(browserKeyForUsername('another.admin')), null);
  clearDeviceToken(mobile);
  assert.equal(getStoredDeviceToken(mobile), null);
  assert.equal(getStoredDeviceToken(username), first);
  clearDeviceToken();
  assert.equal(getStoredDeviceToken(username), null);
});

test('a previous single browser token remains available until replaced', () => {
  const values = storage();
  const legacy = 'd'.repeat(64);
  values.set('chitwise_device_token', legacy);
  const alice = browserKeyForUsername('alice');
  const bob = browserKeyForUsername('bob');
  assert.equal(getStoredDeviceToken(alice), legacy);
  saveDeviceToken(bob, 'e'.repeat(64));
  assert.equal(getStoredDeviceToken(alice), legacy);
  assert.equal(getStoredDeviceToken(bob), 'e'.repeat(64));
  clearDeviceToken(alice);
  assert.equal(getStoredDeviceToken(alice), null);
  assert.equal(getStoredDeviceToken(bob), 'e'.repeat(64));
  clearDeviceToken();
  assert.equal(getStoredDeviceToken(alice), null);
});

test('malformed Google credentials and invalid remembered tokens fail closed', () => {
  storage();
  assert.equal(browserKeyForGoogle('invalid'), null);
  assert.equal(browserKeyForGoogle(`header.${btoa('{}')}.signature`), null);
  const username = browserKeyForUsername('alice');
  saveDeviceToken(username, 'not-a-server-token');
  assert.equal(getStoredDeviceToken(username), null);
});

test('active browser lookup stays bound to the signed-in account', () => {
  storage();
  const aliceKey = browserKeyForUsername('alice');
  const bobKey = browserKeyForUsername('bob');
  saveDeviceToken(aliceKey, 'a'.repeat(64));
  saveDeviceToken(bobKey, 'b'.repeat(64));
  rememberActiveBrowserKey('alice-id', aliceKey);
  rememberActiveBrowserKey('bob-id', bobKey);
  assert.equal(getActiveDeviceToken('alice-id'), 'a'.repeat(64));
  assert.equal(getActiveDeviceToken('bob-id'), 'b'.repeat(64));
  clearActiveDeviceToken('alice-id');
  assert.equal(getActiveDeviceToken('alice-id'), null);
  assert.equal(getStoredDeviceToken(aliceKey), null);
  assert.equal(getActiveDeviceToken('bob-id'), 'b'.repeat(64));
});
