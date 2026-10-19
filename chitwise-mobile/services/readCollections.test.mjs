import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { listSnapshot, requestKey } from '../../shared/offline/readSnapshots.js';

const code = ts.transpileModule(await readFile(new URL('./api.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function client() {
  const calls = [];
  const http = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    get: async (path, config) => { calls.push({ path, params: config.params }); return { data: { data: { content: [] } } }; },
  };
  const dependencies = {
    axios: { default: { create: () => http } },
    'expo-secure-store': {}, 'expo-crypto': {},
    '../store/authStore': { accountStorageId() {}, useAuthStore: {} },
    '../store/uiStore': { useUIStore: {} }, '../store/syncStore': { useSyncStore: {} },
    '../offline/accountScope': { getAccountScope() {} },
    '../offline/accountClient': { accountForScope() {}, refreshAccountSession() {} },
    '@tanstack/react-query': { onlineManager: {} },
    '../offline/httpCache': { cachedHttpResponse() {}, saveHttpResponse() {}, forgetHttpResponse() {} },
  };
  const context = vm.createContext({ process: { env: {} } });
  const module = new vm.SourceTextModule(code, { context });
  await module.link(async name => {
    const values = dependencies[name];
    if (!values) throw new Error(`Unmocked dependency: ${name}`);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { api: module.namespace, calls };
}

for (const kind of ['members', 'chits']) test(`native ${kind} reads match downloaded data without an earlier screen visit`, async () => {
  const phone = await client();
  const queryClient = {}; queryClient.self = queryClient;
  await phone.api[kind === 'members' ? 'getMembers' : 'getChits']({
    client: queryClient, queryKey: ['screen-specific-key'], signal: new AbortController().signal,
    meta: { account: 'must-not-be-a-server-parameter' },
  });
  const { path, params } = phone.calls[0];
  assert.equal(requestKey(path, params), requestKey(`/${kind}`, { size: 200 }));
  const downloaded = [{ id: 'saved-record', fullName: 'Saved member', name: 'Saved chit', status: 'ACTIVE' }];
  const result = listSnapshot(kind, downloaded, params);
  assert.ok(result, 'Downloaded data must serve this request even without an exact previously visited URL');
  assert.deepEqual(result.data.content, downloaded);
});

test('native list filters and paging remain part of the durable server identity', async () => {
  const phone = await client();
  const input = { page: 2, size: 25, status: 'ACTIVE', search: 'Ravi', sort: 'fullName,asc' };
  await phone.api.getMembers({ ...input, queryKey: ['ignored'] });
  assert.equal(requestKey('/members', phone.calls[0].params), requestKey('/members', input));
  assert.equal(listSnapshot('members', [{ id: 'other', fullName: 'Other', status: 'ACTIVE' }], phone.calls[0].params).data.totalElements, 0);
});
