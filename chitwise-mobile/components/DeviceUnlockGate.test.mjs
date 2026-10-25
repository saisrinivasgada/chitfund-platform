import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { create, act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const transpile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const [gateSource, sessionSource] = await Promise.all([transpile('./DeviceUnlockGate.tsx'), transpile('../utils/deviceUnlockSession.ts')]);
const userA = { id: 'u', tenantId: 'a', authSource: 'ORGANIZATION' };
const userB = { id: 'u', tenantId: 'b', authSource: 'ORGANIZATION' };
const id = (u) => `${u.authSource}:${u.id}:${u.tenantId}`;
async function phone({ enabled = true, loading = false, unreadable = false, user = userA, approve = false } = {}) {
  let state = { user, isLoading: loading };
  const authListeners = new Set(), stateListeners = new Set(), settingListeners = new Set();
  let pending, nativeBusy = false, settingsFail = unreadable;
  const calls = [], signOuts = [];
  const context = vm.createContext({});
  const session = new vm.SourceTextModule(sessionSource, { context }); await session.link(() => {}); await session.evaluate();
  const appState = { currentState: 'active', addEventListener: (_, listener) => { stateListeners.add(listener); return { remove: () => stateListeners.delete(listener) }; } };
  const useAuthStore = (selector) => selector(React.useSyncExternalStore((listener) => { authListeners.add(listener); return () => authListeners.delete(listener); }, () => state));
  useAuthStore.getState = () => state;
  const dependencies = {
    react: React, 'react/jsx-runtime': jsxRuntime,
    'react-native': {
      ActivityIndicator: 'Spinner', View: 'View', Text: 'Text', TouchableOpacity: 'Button', AppState: appState,
      Modal: ({ visible, children }) => React.createElement('NativeModal', { visible }, visible ? children : null),
    },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    '../store/authStore': { useAuthStore, accountStorageId: (userId, tenantId, source) => `${source}:${userId}:${tenantId}` },
    '../utils/biometrics': {
      isBiometricEnabled: async () => { if (settingsFail) throw new Error('Storage unavailable'); return enabled; },
      authenticateDevice: () => { calls.push(state.user); nativeBusy = true; return new Promise((resolve) => { pending = (success) => { nativeBusy = false; resolve(success); }; }); },
      deviceAuthenticationInProgress: () => nativeBusy,
      subscribeDeviceUnlock: (listener) => { settingListeners.add(listener); return () => settingListeners.delete(listener); },
    },
    '../utils/deviceUnlockSession': session.namespace,
    '../offline/signOut': { requestSignOut: async () => { signOuts.push(state.user); return false; } },
    './ui': { C: { navy: '#123' } },
  };
  const gate = new vm.SourceTextModule(gateSource, { context });
  await gate.link(async (name) => { const values = dependencies[name]; if (!values) throw new Error(name);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }, { context }); });
  await gate.evaluate(); let renderer;
  await act(async () => { renderer = create(React.createElement(gate.namespace.DeviceUnlockGate, null, React.createElement('PrivateContent'))); });
  const update = async (fn) => act(async () => { fn(); });
  const result = {
    calls, signOuts, session: session.namespace,
    visible: () => renderer.root.findAllByType('NativeModal').some((modal) => modal.props.visible),
    modalCount: () => renderer.root.findAllByType('NativeModal').length,
    text: () => JSON.stringify(renderer.toJSON()),
    resolve: async (success) => update(() => { assert.ok(pending, 'A native request must be pending'); const finish = pending; pending = null; finish(success); }),
    background: async () => update(() => { appState.currentState = 'background'; stateListeners.forEach((l) => l('background')); }),
    inactive: async () => update(() => { appState.currentState = 'inactive'; stateListeners.forEach((l) => l('inactive')); }),
    foreground: async () => update(() => { appState.currentState = 'active'; stateListeners.forEach((l) => l('active')); }),
    setAuth: async (next) => update(() => { state = { ...state, ...next }; authListeners.forEach((l) => l()); }),
    authorize: async (accountId) => update(() => session.namespace.authorizeDeviceSession(accountId)),
    settings: async (on, approvedId) => update(() => { enabled = on; settingListeners.forEach((l) => l(on, approvedId)); }),
    retry: async () => update(() => renderer.root.findAllByType('Button').find((b) => b.props.testID === 'unlock-chitwise').props.onPress()),
    signOut: async () => update(() => renderer.root.findAllByType('Button').find((b) => b.props.testID !== 'unlock-chitwise').props.onPress()),
    storageRecovers: () => { settingsFail = false; },
    dispose: async () => act(async () => renderer.unmount()),
  };
  if (approve && calls.length) await result.resolve(true);
  return result;
}
test('cold start covers private content until native device approval succeeds', async () => {
  const app = await phone(); assert.equal(app.visible(), true); assert.equal(app.calls.length, 1);
  await app.resolve(true); assert.equal(app.visible(), false); assert.equal(app.modalCount(), 0, 'Remove the native modal host after unlock so it cannot intercept taps'); assert.equal(app.signOuts.length, 0); await app.dispose();
});
test('cancelled or failed unlock stays locked, preserves the account and allows an explicit retry', async () => {
  const app = await phone(); await app.resolve(false);
  assert.equal(app.visible(), true); assert.match(app.text(), /remains locked/); assert.equal(app.calls.length, 1);
  assert.equal(app.signOuts.length, 0); await app.retry(); assert.equal(app.calls.length, 2);
  await app.resolve(true); assert.equal(app.visible(), false); await app.dispose();
});
test('returning from a real background visit requires a fresh device approval', async () => {
  const app = await phone({ approve: true }); await app.background(); assert.equal(app.visible(), true);
  await app.foreground(); assert.equal(app.calls.length, 2); assert.equal(app.visible(), true);
  await app.resolve(true); assert.equal(app.visible(), false); await app.dispose();
});
test('temporary inactive interruptions hide content without an unnecessary second prompt', async () => {
  const app = await phone({ approve: true }); await app.inactive(); assert.equal(app.visible(), true);
  await app.foreground(); assert.equal(app.visible(), false); assert.equal(app.calls.length, 1); await app.dispose();
});
test('Android credential activity does not create a repeated unlock loop', async () => {
  const app = await phone(); await app.background(); await app.foreground(); assert.equal(app.calls.length, 1);
  await app.resolve(true); assert.equal(app.visible(), false); assert.equal(app.calls.length, 1); await app.dispose();
});
test('an OS success for A cannot unlock a different account changed while the dialog was open', async () => {
  const app = await phone(); await app.setAuth({ user: userB }); await app.resolve(true);
  assert.equal(app.visible(), true); assert.equal(app.session.getDeviceUnlockSession().accounts.has(id(userB)), false);
  await app.retry(); await app.resolve(true); assert.equal(app.visible(), false); await app.dispose();
});
test('an approval invalidated during the OS prompt cannot unlock a later foreground visit', async () => {
  const app = await phone(); await act(async () => app.session.invalidateDeviceSession());
  await app.resolve(true); assert.equal(app.visible(), true); await app.dispose();
});
test('a verified account switch approval survives keyed account-provider changes', async () => {
  const app = await phone({ approve: true }); await app.authorize(id(userB)); await app.setAuth({ user: userB });
  assert.equal(app.visible(), false); assert.equal(app.calls.length, 1);
  await app.background(); await app.foreground(); assert.equal(app.calls.length, 2);
  await app.resolve(true); assert.equal(app.visible(), false); await app.dispose();
});
test('enabled lock waits for storage restoration, rather than treating the initial empty user as signed out', async () => {
  const app = await phone({ loading: true, user: null }); assert.equal(app.visible(), true); assert.equal(app.calls.length, 0);
  await app.setAuth({ user: userA, isLoading: false }); assert.equal(app.visible(), true); assert.equal(app.calls.length, 1);
  await app.resolve(true); await app.dispose();
});
test('signed-out and opted-out users do not receive a device prompt', async () => {
  for (const options of [{ user: null }, { enabled: false }]) {
    const app = await phone(options); assert.equal(app.visible(), false); assert.equal(app.calls.length, 0); await app.dispose();
  }
});
test('unreadable lock settings cover the app and recover without deleting any session', async () => {
  const app = await phone({ unreadable: true }); assert.equal(app.visible(), true); assert.equal(app.calls.length, 0);
  assert.match(app.text(), /could not be read/); app.storageRecovers(); await app.retry();
  assert.equal(app.calls.length, 1); await app.resolve(true); assert.equal(app.visible(), false); assert.equal(app.signOuts.length, 0); await app.dispose();
});
test('enabling and disabling app lock updates protection without remounting or a second prompt', async () => {
  const app = await phone({ enabled: false }); await app.settings(true, id(userA)); assert.equal(app.visible(), false);
  await app.background(); await app.foreground(); assert.equal(app.calls.length, 1); await app.resolve(false);
  await app.settings(false); assert.equal(app.visible(), false); await app.dispose();
});
test('cancelling the existing sign-out confirmation leaves the lock and stored collections in place', async () => {
  const app = await phone(); await app.resolve(false); await app.signOut();
  assert.equal(app.signOuts.length, 1); assert.equal(app.visible(), true); await app.dispose();
});
