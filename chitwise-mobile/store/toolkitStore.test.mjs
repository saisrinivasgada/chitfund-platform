import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { create } from 'zustand';
const source = ts.transpileModule(await readFile(new URL('./toolkitStore.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
async function settingsDevice(raw = null, options = {}) {
  let stored = raw; const writes = [];
  const storage = { getItem: async () => { await options.readGate; return raw; }, setItem: async (_, value) => {
    if (options.failFirst && !writes.length) { writes.push('failed'); throw new Error('Storage unavailable'); }
    await options.writeGate; writes.push(value); stored = value;
  } };
  const context = vm.createContext({}); const mod = new vm.SourceTextModule(source, { context });
  await mod.link(async (name) => {
    const values = name === 'zustand' ? { create } : { default: storage };
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await mod.evaluate(); return { store: mod.namespace.useToolkitStore, writes, stored: () => stored };
}
test('continuous floating-button preferences are bounded and survive rapid sequential changes', async () => {
  const device = await settingsDevice(); const prefs = device.store.getState();
  prefs.setOpacity(0.42); prefs.setButtonSize(57); prefs.setEnabled(false);
  await device.store.getState().loadSettings();
  assert.deepEqual(JSON.parse(device.stored()), { enabled: false, opacity: 0.42, buttonSize: 57 });
  prefs.setOpacity(-1); prefs.setButtonSize(999); await prefs.loadSettings();
  assert.equal(device.store.getState().opacity, 0.15); assert.equal(device.store.getState().buttonSize, 64);
});
test('invalid saved values cannot hide the floating button or make it unusably small', async () => {
  const device = await settingsDevice(JSON.stringify({ enabled: 'false', opacity: 'bad', buttonSize: -500 }));
  await device.store.getState().loadSettings();
  assert.equal(device.store.getState().enabled, true); assert.equal(device.store.getState().opacity, 0.85); assert.equal(device.store.getState().buttonSize, 36);
});
test('a slow settings restore cannot overwrite a newer slider adjustment', async () => {
  let release; const readGate = new Promise((resolve) => { release = resolve; });
  const device = await settingsDevice('{"opacity":0.25,"buttonSize":36}', { readGate });
  const restored = device.store.getState().loadSettings();
  await Promise.resolve(); device.store.getState().setOpacity(0.72); release(); await restored;
  assert.equal(device.store.getState().opacity, 0.72);
});
test('a failed preference write does not block later preferences or calculator operations', async () => {
  const device = await settingsDevice(null, { failFirst: true }); const prefs = device.store.getState();
  prefs.setOpacity(0.4); prefs.setButtonSize(60); await prefs.loadSettings();
  assert.equal(JSON.parse(device.stored()).buttonSize, 60);
  for (const key of ['AC', '8', '÷', '0', '=']) device.store.getState().calcInput(key);
  assert.equal(device.store.getState().display, 'Error');
  for (const key of ['AC', '5', '±', '+', '2', '=']) device.store.getState().calcInput(key);
  assert.equal(device.store.getState().display, '-3');
});
