import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = ts.transpileModule(await readFile(new URL('./biometrics.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const enabledKey = 'chitwise_biometric_enabled';
const accountKey = 'chitwise_device_unlock_account';
const legacyKey = 'chitwise_biometric_creds';
const account = (id, extra = {}) => ({ accountId: id, username: 'same-name', refreshToken: 'current-token', sessionValid: true, ...extra });
async function device({ os = 'android', level = 1, success = true, enrolled = false, types = [], saved = {}, prompt, readFails = false, writeFails = false } = {}) {
  const storage = new Map(Object.entries(saved)); const calls = [];
  const sdk = {
    SecurityLevel: { SECRET: 1 }, AuthenticationType: { FACIAL_RECOGNITION: 2, FINGERPRINT: 1 },
    getEnrolledLevelAsync: async () => level, isEnrolledAsync: async () => enrolled,
    supportedAuthenticationTypesAsync: async () => types,
    authenticateAsync: async (options) => { calls.push(options); return prompt ? prompt() : { success }; },
  };
  const dependencies = {
    'expo-local-authentication': sdk,
    'react-native': { Platform: { OS: os } },
    'expo-secure-store': {
      getItemAsync: async (key) => { if (readFails) throw new Error('Locked storage'); return storage.get(key) ?? null; },
      setItemAsync: async (key, value) => { if (writeFails) throw new Error('Full storage'); storage.set(key, value); },
      deleteItemAsync: async (key) => storage.delete(key),
    },
  };
  const context = vm.createContext({}); const module = new vm.SourceTextModule(source, { context });
  await module.link(async (name) => { const values = dependencies[name]; if (!values) throw new Error(name);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }, { context }); });
  await module.evaluate(); return { api: module.namespace, storage, calls };
}
test('PIN-only Android is available without enrolled biometrics or biometric hardware', async () => {
  const phone = await device(); assert.equal(await phone.api.isBiometricAvailable(), true);
  assert.equal(await phone.api.biometricTypeName(), 'Device unlock');
  assert.equal(await phone.api.authenticateDevice(), true);
  assert.equal(phone.calls[0].disableDeviceFallback, false);
  assert.equal(phone.calls[0].fallbackLabel, 'Use device passcode');
});
test('Android facial recognition is never labelled Apple Face ID', async () => {
  assert.equal(await (await device({ enrolled: true, types: [2] })).api.biometricTypeName(), 'Device unlock');
});
for (const [types, enrolled, expected] of [[[2],true,'Face ID'],[[1],true,'Touch ID'],[[2],false,'Device passcode']]) {
  test(`iOS reports ${expected} only for the appropriate enrolled method`, async () => {
    assert.equal(await (await device({ os: 'ios', types, enrolled })).api.biometricTypeName(), expected);
  });
}
test('no device security and web never invoke an OS prompt or enable app lock', async () => {
  for (const options of [{ level: 0 }, { os: 'web' }]) {
    const phone = await device(options);
    assert.equal(await phone.api.isBiometricAvailable(), false);
    assert.equal(await phone.api.enableBiometric('org-a'), false);
    assert.equal(phone.calls.length, 0); assert.equal(phone.storage.size, 0);
  }
});
test('successful enable stores exact account identity, removes duplicate token and notifies protection', async () => {
  const phone = await device({ saved: { [legacyKey]: 'sensitive-old-token' } }); const changes = [];
  phone.api.subscribeDeviceUnlock((...args) => changes.push(args));
  assert.equal(await phone.api.enableBiometric('ORGANIZATION:u:org-a'), true);
  assert.equal(phone.storage.get(enabledKey), 'true'); assert.equal(phone.storage.get(accountKey), 'ORGANIZATION:u:org-a');
  assert.equal(phone.storage.has(legacyKey), false); assert.deepEqual(changes, [[true, 'ORGANIZATION:u:org-a']]);
});
test('cancelled enable neither stores account metadata nor opts the user in', async () => {
  const phone = await device({ success: false }); assert.equal(await phone.api.enableBiometric('org-a'), false);
  assert.equal(phone.storage.size, 0);
});
test('cancelled disable keeps existing protection and saved-account pointer', async () => {
  const phone = await device({ success: false, saved: { [enabledKey]: 'true', [accountKey]: 'org-a' } });
  assert.equal(await phone.api.disableBiometric(), false); assert.equal(await phone.api.isBiometricEnabled(), true);
  assert.equal(phone.storage.get(accountKey), 'org-a');
});
test('disable requires device approval, clears legacy token and notifies listeners', async () => {
  const phone = await device({ saved: { [enabledKey]: 'true', [accountKey]: 'org-a', [legacyKey]: 'old' } }); const changes = [];
  phone.api.subscribeDeviceUnlock((on) => changes.push(on));
  assert.equal(await phone.api.disableBiometric(), true); assert.equal(phone.storage.size, 0); assert.deepEqual(changes, [false]);
});
test('unreadable secure settings fail closed rather than silently disabling the lock', async () => {
  const phone = await device({ readFails: true }); await assert.rejects(phone.api.isBiometricEnabled(), /Locked storage/);
});
test('a failed preference write never announces that app lock was enabled', async () => {
  const phone = await device({ writeFails: true }); const changes = [];
  phone.api.subscribeDeviceUnlock((on) => changes.push(on));
  await assert.rejects(phone.api.enableBiometric('org-a'), /Full storage/); assert.deepEqual(changes, []);
});
test('one OS approval cannot approve concurrent account selections or concurrent setting changes', async () => {
  let finish; const phone = await device({ prompt: () => new Promise((resolve) => { finish = resolve; }) });
  const first = phone.api.enableBiometric('org-a'); await new Promise(setImmediate);
  assert.equal(phone.api.deviceAuthenticationInProgress(), true);
  assert.equal(await phone.api.enableBiometric('org-b'), false); assert.equal(await phone.api.authenticateDevice('Switch account'), false);
  finish({ success: true }); assert.equal(await first, true); assert.equal(phone.calls.length, 1);
  assert.equal(phone.storage.get(accountKey), 'org-a'); assert.equal(phone.api.deviceAuthenticationInProgress(), false);
});
test('native prompt errors leave the configured lock and account metadata intact', async () => {
  const phone = await device({ saved: { [enabledKey]: 'true', [accountKey]: 'a' }, prompt: () => { throw new Error('Native failure'); } });
  assert.equal(await phone.api.promptBiometric([account('a')]), null);
  assert.equal(await phone.api.isBiometricEnabled(), true); assert.equal(phone.storage.get(accountKey), 'a');
});
test('saved-account unlock follows exact tenant identity and ignores the obsolete token copy', async () => {
  const phone = await device({ saved: { [enabledKey]: 'true', [accountKey]: 'org-b', [legacyKey]: JSON.stringify({ username: 'same-name', refreshToken: 'stale-token' }) } });
  assert.equal(await phone.api.promptBiometric([account('org-a'), account('org-b', { refreshToken: 'rotated-token' })]), 'org-b');
});
test('logged-out, removed and Hub sessions cannot be revived using a saved pointer', async () => {
  for (const accounts of [[], [account('a', { sessionValid: false })], [account('a', { authSource: 'HUB' })]]) {
    const phone = await device({ saved: { [enabledKey]: 'true', [accountKey]: 'a' } });
    assert.equal(await phone.api.promptBiometric(accounts), null);
  }
});
test('legacy migration requires one exact valid account, never guesses between tenants', async () => {
  const saved = { [enabledKey]: 'true', [legacyKey]: JSON.stringify({ username: 'same-name', refreshToken: 'current-token' }) };
  const ambiguous = await device({ saved }); assert.equal(await ambiguous.api.promptBiometric([account('a'),account('b')]), null);
  assert.equal(ambiguous.storage.has(accountKey), false);
  const unique = await device({ saved }); assert.equal(await unique.api.promptBiometric([account('a')]), 'a');
  assert.equal(unique.storage.get(accountKey), 'a'); assert.equal(unique.storage.has(legacyKey), false);
});
test('a stale legacy credential never revives a session or automatically disables the lock', async () => {
  const phone = await device({ saved: { [enabledKey]: 'true', [legacyKey]: JSON.stringify({ username: 'same-name', refreshToken: 'stale-token' }) } });
  assert.equal(await phone.api.promptBiometric([account('a')]), null); assert.equal(await phone.api.isBiometricEnabled(), true);
});
