import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { signOutWarning } from '../../shared/offline/signOutPolicy.js';
const source = ts.transpileModule(await readFile(new URL('./signOut.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
async function device({ confirm = false, locked = false } = {}) {
  const events = []; const dialogs = [];
  const accounts = [{ accountId: 'a', role: 'ADMIN', retainedOfflineScopes: ['a:STAFF'], refreshToken: 'refresh-a' }, { accountId: 'b', role: 'ADMIN', refreshToken: 'refresh-b' }];
  const state = { user: { id: 'a' }, accounts,
    logout: async () => events.push('logout'), logoutFromAccount: async (id) => events.push(`logout:${id}`), logoutAll: async () => events.push('logout:all') };
  const dependencies = {
    'react-native': { Alert: { alert: (title, message, buttons) => { dialogs.push({ title, message }); buttons?.[confirm ? 1 : 0]?.onPress(); } } },
    '../../shared/offline/signOutPolicy': { signOutWarning },
    '../store/authStore': { accountStorageId: () => 'a', useAuthStore: { getState: () => state } },
    './accountScope': { getStoredAccountScope: (a) => `${a.accountId}:${a.role}` },
    './database': { getUnsentOperationCount: async (scope) => { if (locked) throw new Error('Locked'); return scope.startsWith('a:') ? 1 : 2; },
      discardUnsentOperationsForSignOut: async (scope) => events.push(`discard:${scope}`) },
    '../services/api': { logoutAccount: async (token) => events.push(`revoke:${token}`), logoutAllDevices: async () => events.push('revoke:devices') },
  };
  const context = vm.createContext({}); const module = new vm.SourceTextModule(source, { context });
  await module.link(async (name) => { const values = dependencies[name]; if (!values) throw new Error(name);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }, { context }); });
  await module.evaluate(); return { signOut: module.namespace.requestSignOut, events, dialogs };
}
test('cancelling sign-out preserves sessions and both current/retained-role collections', async () => {
  const phone = await device(); assert.equal(await phone.signOut(), false); assert.deepEqual(phone.events, []);
  assert.match(phone.dialogs[0].message, /2 unsynced payments.*will not restore/);
});
test('confirmed sign-out discards only the selected account before invalidating it', async () => {
  const phone = await device({ confirm: true }); assert.equal(await phone.signOut(), true);
  assert.deepEqual(phone.events, ['discard:a:ADMIN','discard:a:STAFF','revoke:refresh-a','logout:a']);
});
test('sign out all counts every account and duplicate taps share one confirmation', async () => {
  const phone = await device({ confirm: true }); const first = phone.signOut({ all: true }); const second = phone.signOut({ all: true });
  assert.equal(first, second); assert.equal(await first, true); assert.equal(phone.dialogs.length, 1);
  assert.match(phone.dialogs[0].message, /4 unsynced payments/); assert.equal(phone.events.at(-1), 'logout:all');
  assert.ok(phone.events.includes('discard:b:ADMIN'));
});
test('unreadable local storage never silently deletes or invalidates a session', async () => {
  const phone = await device({ confirm: true, locked: true }); assert.equal(await phone.signOut(), false);
  assert.deepEqual(phone.events, []); assert.equal(phone.dialogs[0].title, 'Could not finish signing out');
});
