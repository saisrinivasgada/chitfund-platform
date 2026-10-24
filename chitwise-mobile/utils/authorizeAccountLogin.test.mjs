import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = ts.transpileModule(await readFile(new URL('./authorizeAccountLogin.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function login({ enabled = true, approved = true, unavailable = false } = {}) {
  const prompts = [], approvals = [];
  const context = vm.createContext({}); const module = new vm.SourceTextModule(source, { context });
  const dependencies = {
    './biometrics': { isBiometricEnabled: async () => { if (unavailable) throw new Error('Storage locked'); return enabled; }, authenticateDevice: async (message) => { prompts.push(message); return approved; } },
    './deviceUnlockSession': { authorizeDeviceSession: (accountId) => approvals.push(accountId) },
  };
  await module.link(async (name) => { const values = dependencies[name]; return new vm.SyntheticModule(Object.keys(values), function () { for (const [k,v] of Object.entries(values)) this.setExport(k,v); }, { context }); });
  await module.evaluate(); return { authorize: module.namespace.authorizeAccountLogin, prompts, approvals };
}
test('password/OTP sign-in still requests phone proof when app lock is configured', async () => {
  const app = await login(); assert.equal(await app.authorize('ORGANIZATION:u:b'), true);
  assert.equal(app.prompts.length, 1); assert.deepEqual(app.approvals, ['ORGANIZATION:u:b']);
});
test('cancelling phone proof cannot authorize an expired-account re-login', async () => {
  const app = await login({ approved: false }); assert.equal(await app.authorize('ORGANIZATION:u:b'), false);
  assert.deepEqual(app.approvals, []);
});
test('a successful enable prompt supplies phone proof without a second prompt', async () => {
  const app = await login(); assert.equal(await app.authorize('ORGANIZATION:u:b', true), true);
  assert.deepEqual(app.prompts, []); assert.deepEqual(app.approvals, ['ORGANIZATION:u:b']);
});
test('users who have not opted in can finish a verified server login normally', async () => {
  const app = await login({ enabled: false }); assert.equal(await app.authorize('ORGANIZATION:u:a'), true);
  assert.deepEqual(app.prompts, []); assert.deepEqual(app.approvals, ['ORGANIZATION:u:a']);
});
test('unreadable settings never grant an account approval, even after server password proof', async () => {
  const app = await login({ unavailable: true }); await assert.rejects(app.authorize('ORGANIZATION:u:a'), /Storage locked/);
  assert.deepEqual(app.approvals, []); assert.deepEqual(app.prompts, []);
});
