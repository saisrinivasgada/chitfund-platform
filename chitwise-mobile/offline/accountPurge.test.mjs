import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(await readFile(new URL('./database.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function loadDatabase({ fileExists, deleteFile, close }) {
  const keys = new Map();
  const events = [];
  const dependencies = {
    'expo-crypto': {
      CryptoDigestAlgorithm: { SHA256: 'sha256' }, randomUUID,
      digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex'),
    },
    'expo-secure-store': {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key) => keys.get(key),
      setItemAsync: async (key, value) => { keys.set(key, value); },
      deleteItemAsync: async (key) => { events.push('delete-key'); keys.delete(key); },
    },
    'expo-file-system': { File: class { get exists() { return fileExists(); } } },
    'expo-sqlite': {
      defaultDatabaseDirectory: '/tmp',
      deleteDatabaseAsync: async () => { events.push('delete-file'); await deleteFile(); },
      openDatabaseAsync: async () => ({
        execAsync: async () => {}, runAsync: async () => {},
        getFirstAsync: async (sql) => sql === 'PRAGMA cipher_version' ? { cipher_version: 'test' } : { user_version: 9 },
        getAllAsync: async () => [{ name: 'session_epoch' }, { name: 'server_review_id' }, { name: 'server_receipt_json' }, { name: 'recovery_lease_id' }, { name: 'delivery_lease_id' }],
        closeAsync: async () => { events.push('close'); await close(); },
      }),
    },
  };
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async (name) => {
    const values = dependencies[name];
    if (!values) throw new Error(name);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { db: module.namespace, keys, events };
}

test('offline account purge closes the database before deleting its file and key', async () => {
  const scope = 'WEB:user:tenant:ADMIN';
  const hash = createHash('sha256').update(scope).digest('hex').slice(0, 16);
  const harness = await loadDatabase({ fileExists: () => false, deleteFile: async () => {}, close: async () => {} });
  await harness.db.getOfflineDatabase(scope);
  assert.ok(harness.keys.has(`chitwise_offline_key_${hash}`));
  await harness.db.purgeAccountOfflineData(scope);
  assert.deepEqual(harness.events, ['close', 'delete-file', 'delete-key']);
  assert.equal(harness.keys.has(`chitwise_offline_key_${hash}`), false);
});

test('failed offline file deletion keeps the encryption key and reports failure', async () => {
  const scope = 'WEB:user:tenant:MEMBER';
  const hash = createHash('sha256').update(scope).digest('hex').slice(0, 16);
  const harness = await loadDatabase({ fileExists: () => true, deleteFile: async () => { throw new Error('file locked'); }, close: async () => {} });
  harness.keys.set(`chitwise_offline_key_${hash}`, 'a'.repeat(64));
  await assert.rejects(harness.db.purgeAccountOfflineData(scope), /file locked/);
  assert.equal(harness.keys.has(`chitwise_offline_key_${hash}`), true);
  assert.deepEqual(harness.events, ['delete-file']);
});
